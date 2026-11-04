import {
  BEACON_MS,
  BEACON_CELLS,
  COOLDOWN_MS,
  DIRECTIONS,
  DODGE_CELLS,
  MOVE_MS,
  MAX_ENERGY,
  RECHARGE_MS,
  SNAKE_RULES,
  TICK_MS,
  VECTOR,
} from './config';
import type {
  Command,
  Direction,
  GameState,
  Level,
  LossDetails,
  Point,
  Snake,
} from './types';

export const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
export const ahead = (p: Point, d: Direction): Point => ({
  x: p.x + VECTOR[d].x,
  y: p.y + VECTOR[d].y,
});
export function solid(level: Level, p: Point): boolean {
  return (
    p.x <= 0 ||
    p.y <= 0 ||
    p.x >= level.width - 1 ||
    p.y >= level.height - 1 ||
    level.walls.some((w) => same(w, p))
  );
}
/** 静态墙、当前关闭的门与已生效残骸；待生效状态不参与碰撞。 */
export function blocked(state: GameState, p: Point): boolean {
  return (
    solid(state.level, p) ||
    state.wrecks.some((w) => w.active && same(w, p)) ||
    (state.level.gates ?? []).some(
      (gate) =>
        state.gates.some((g) => g.id === gate.id && g.closed) &&
        gate.cells.some((cell) => same(cell, p)),
    )
  );
}
/** 与实际投掷共用落点计算；障碍后方不可投，贴墙时落在脚下。 */
export function beaconLanding(state: GameState): Point {
  let point = { ...state.apple };
  for (let i = 0; i < BEACON_CELLS; i++) {
    const next = ahead(point, state.facing);
    if (blocked(state, next)) break;
    point = next;
  }
  return point;
}
export function createState(level: Level): GameState {
  return {
    level,
    status: 'playing',
    paused: false,
    elapsedMs: 0,
    apple: { ...level.apple },
    facing: level.facing,
    moveTimer: 0,
    cooldownMs: 0,
    energy: MAX_ENERGY,
    rechargeMs: 0,
    beacon: null,
    beacons: 0,
    wrecks: [],
    gates: (level.gates ?? []).map((gate) => ({
      id: gate.id,
      closed: gate.initialClosed,
      pending: null,
    })),
    lossReason: null,
    loss: null,
    dodges: 0,
    events: [],
    snakes: level.snakes.map((spawn, id) => ({
      x: spawn.x,
      y: spawn.y,
      id,
      kind: spawn.kind,
      rules: { ...SNAKE_RULES[spawn.kind], ...spawn.rules },
      phase: spawn.delayMs ? 'recovering' : 'tracking',
      alive: true,
      facing: 'down',
      locked: 'down',
      timer: spawn.delayMs ?? 0,
      aim: 0,
      aimDirection: null,
      remaining: 0,
      body: [],
      attackPath: [],
    })),
  };
}
export function setPaused(state: GameState, paused: boolean): void {
  if (state.status !== 'playing') return;
  state.paused = paused;
  state.events = [];
}
function finish(state: GameState, status: 'won' | 'lost'): void {
  if (state.status !== 'playing') return;
  state.status = status;
  state.events.push({ type: status, ...state.apple });
}
function headAt(state: GameState, point: Point): Snake | undefined {
  return state.snakes.find((s) => s.alive && same(s, point));
}
function hitPlayer(
  state: GameState,
  reason: string,
  snake: Snake,
  kind: LossDetails['kind'],
  path = snake.phase === 'charging' || snake.phase === 'dashing'
    ? snake.attackPath.length
      ? snake.attackPath
      : [{ x: snake.x, y: snake.y }, ...warningPath(state, snake)]
    : [{ x: snake.x, y: snake.y }],
): void {
  if (state.status !== 'playing') return;
  state.lossReason = reason;
  state.loss = {
    enemy: snake.id,
    kind,
    cell: { ...state.apple },
    path: path.map((p) => ({ ...p })),
  };
  finish(state, 'lost');
}
function applyPendingTerrain(state: GameState): void {
  // 正式攻击的整段预警与冲刺共享同一地形，不让机关偷偷改变已展示路径。
  if (
    state.snakes.some(
      (s) => s.alive && (s.phase === 'charging' || s.phase === 'dashing'),
    )
  )
    return;
  for (const wreck of state.wrecks) {
    if (!wreck.active && !same(state.apple, wreck) && !headAt(state, wreck)) {
      wreck.active = true;
      // 信标若被新残骸覆盖，不能继续产生不可达目标。
      if (state.beacon && same(state.beacon, wreck)) state.beacon = null;
    }
  }
  for (const gate of state.level.gates ?? []) {
    const current = state.gates.find((g) => g.id === gate.id);
    if (!current || current.pending === null) continue;
    if (
      current.pending &&
      gate.cells.some((p) => same(state.apple, p) || headAt(state, p))
    )
      continue;
    current.closed = current.pending;
    current.pending = null;
  }
}
function enterSwitches(state: GameState, previous: Point, next: Point): void {
  for (const gate of state.level.gates ?? []) {
    if (
      gate.switches.some((p) => same(p, next)) &&
      !gate.switches.some((p) => same(p, previous))
    ) {
      const current = state.gates.find((g) => g.id === gate.id);
      if (!current) continue;
      const desired = !(current.pending ?? current.closed);
      current.pending = desired === current.closed ? null : desired;
    }
  }
  applyPendingTerrain(state);
}
function moveApple(state: GameState, direction: Direction): boolean {
  const next = ahead(state.apple, direction);
  if (blocked(state, next)) return false;
  const previous = state.apple;
  state.apple = next;
  // 即使同一时间蛇准备离开此格，也不能与蛇头换位穿越。
  const head = headAt(state, next);
  if (head)
    hitPlayer(
      state,
      '撞上了敌人头部。闪避没有无敌时间，也不能穿过敌人。',
      head,
      'contact',
    );
  else enterSwitches(state, previous, next);
  return true;
}
/** 追踪目标可以变化；正式锁向后只使用 snake.locked，不再取本目标。 */
export function targetFor(state: GameState, snake: Snake): Point {
  if (state.beacon) return { x: state.beacon.x, y: state.beacon.y };
  let target = { ...state.apple };
  if (snake.kind === 'swift') {
    for (let i = 0; i < 2; i++) {
      const next = ahead(target, state.facing);
      if (blocked(state, next)) break;
      target = next;
    }
  }
  return target;
}
export function warningPath(state: GameState, snake: Snake): Point[] {
  if (!snake.alive || (snake.phase !== 'charging' && snake.phase !== 'dashing'))
    return [];
  const result: Point[] = [];
  let p: Point = snake;
  const count =
    snake.phase === 'charging' ? snake.rules.dashCells : snake.remaining;
  for (let i = 0; i < count; i++) {
    p = ahead(p, snake.locked);
    if (blocked(state, p)) break;
    result.push(p);
  }
  return result;
}
export function aimDirection(state: GameState, snake: Snake): Direction | null {
  const target = targetFor(state, snake);
  const dx = target.x - snake.x,
    dy = target.y - snake.y;
  if (dx !== 0 && dy !== 0) return null;
  const distance = Math.abs(dx) + Math.abs(dy);
  if (distance === 0 || distance > snake.rules.range) return null;
  const direction = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
  let point: Point = snake;
  for (let i = 0; i < distance; i++) {
    point = ahead(point, direction);
    if (blocked(state, point)) return null;
  }
  if (snake.kind === 'cautious' && !state.beacon) {
    point = snake;
    for (let i = 0; i < snake.rules.dashCells; i++) {
      point = ahead(point, direction);
      if (blocked(state, point)) return null;
    }
  }
  return direction;
}
// 从目标做 BFS，追踪只选择可通行格；不以碰墙代替寻路。
function distances(state: GameState, target: Point): Map<string, number> {
  // 信标可以留在随后关闭的门格内；不可从不可通行的目标反向寻出穿门路线。
  if (blocked(state, target)) return new Map();
  const result = new Map<string, number>([[key(target), 0]]);
  const queue = [target];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    for (const d of DIRECTIONS) {
      const next = ahead(current, d),
        k = key(next);
      if (!blocked(state, next) && !result.has(k)) {
        result.set(k, result.get(key(current))! + 1);
        queue.push(next);
      }
    }
  }
  return result;
}
const key = (p: Point): string => `${p.x},${p.y}`;
function moveSnake(snake: Snake, next: Point): void {
  snake.body.unshift({ x: snake.x, y: snake.y });
  snake.body.length = Math.min(4, snake.body.length);
  snake.x = next.x;
  snake.y = next.y;
}

/** 只推进一个固定步。渲染、回放均使用这一入口；不接收墙上时间。 */
export function step(state: GameState, command: Command): void {
  state.events = [];
  if (state.paused || state.status !== 'playing') return;
  state.elapsedMs += TICK_MS;
  state.moveTimer = Math.max(0, state.moveTimer - TICK_MS);
  state.cooldownMs = Math.max(0, state.cooldownMs - TICK_MS);
  if (state.energy < MAX_ENERGY) {
    state.rechargeMs += TICK_MS;
    if (state.rechargeMs >= RECHARGE_MS) {
      state.energy++;
      state.rechargeMs -= RECHARGE_MS;
    }
  }
  if (state.energy === MAX_ENERGY) state.rechargeMs = 0;
  if (state.beacon) {
    state.beacon.remainingMs -= TICK_MS;
    if (state.beacon.remainingMs <= 0) state.beacon = null;
  }
  applyPendingTerrain(state);
  if (command.direction) state.facing = command.direction;
  const head = headAt(state, state.apple);
  if (head) {
    hitPlayer(
      state,
      '撞上了敌人头部。请先观察退路，再接近敌人。',
      head,
      'contact',
    );
    return;
  }
  let dodged = false;
  if (
    command.dodge &&
    state.energy > 0 &&
    state.cooldownMs === 0 &&
    !blocked(state, ahead(state.apple, state.facing))
  ) {
    state.dodges++;
    state.energy--;
    state.cooldownMs = COOLDOWN_MS;
    dodged = true;
    state.events.push({ type: 'dodge', ...state.apple });
    for (let i = 0; i < DODGE_CELLS && state.status === 'playing'; i++) {
      if (!moveApple(state, state.facing)) break;
    }
    state.moveTimer = MOVE_MS;
  }
  if (state.status !== 'playing') return;
  if (
    command.beacon &&
    state.level.beaconEnabled &&
    state.energy > 0 &&
    !state.beacon
  ) {
    state.energy--;
    state.beacons++;
    state.beacon = { ...beaconLanding(state), remainingMs: BEACON_MS };
  }
  if (command.direction && !dodged && state.moveTimer === 0) {
    moveApple(state, command.direction);
    state.moveTimer = MOVE_MS;
  }
  if (state.status !== 'playing') return;

  const paths = new Map<string, Map<string, number>>();
  let collision:
    { snake: Snake; kind: 'tracking' | 'dash'; path: Point[] } | undefined;
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    const origin = { x: snake.x, y: snake.y };
    if (snake.phase === 'charging' || snake.phase === 'recovering') {
      snake.timer -= TICK_MS;
      if (snake.timer > 0) continue;
      if (snake.phase === 'charging') {
        snake.phase = 'dashing';
        snake.timer = snake.rules.dashMs;
        snake.remaining = snake.rules.dashCells;
        state.events.push({
          type: 'dash',
          snake: snake.id,
          x: snake.x,
          y: snake.y,
        });
      } else {
        snake.phase = 'tracking';
        snake.timer = snake.rules.trackMs;
      }
      continue;
    }
    if (snake.phase === 'tracking') {
      const aim = aimDirection(state, snake);
      snake.aim = aim && aim === snake.aimDirection ? snake.aim + TICK_MS : 0;
      snake.aimDirection = aim;
      if (aim && snake.aim >= snake.rules.aimMs) {
        snake.phase = 'charging';
        snake.locked = aim;
        snake.facing = aim;
        snake.timer = snake.rules.chargeMs;
        snake.attackPath = [
          { x: snake.x, y: snake.y },
          ...warningPath(state, snake),
        ];
        snake.aim = 0;
        state.events.push({
          type: 'charge',
          snake: snake.id,
          x: snake.x,
          y: snake.y,
        });
        continue;
      }
      snake.timer -= TICK_MS;
      if (snake.timer <= 0) {
        const target = targetFor(state, snake);
        let path = paths.get(key(target));
        if (!path) {
          path = distances(state, target);
          paths.set(key(target), path);
        }
        let best = path.get(key(snake)) ?? Infinity;
        let chosen: Direction | undefined;
        const keepDistance = snake.kind === 'cautious' && !state.beacon;
        const retreat = keepDistance && best < 2;
        for (const direction of DIRECTIONS) {
          const next = ahead(snake, direction),
            distance = path.get(key(next));
          if (
            distance !== undefined &&
            (retreat ? distance > best && distance <= 2 : distance < best) &&
            (!keepDistance || retreat || distance >= 2)
          ) {
            best = distance;
            chosen = direction;
          }
        }
        if (chosen) {
          snake.facing = chosen;
          moveSnake(snake, ahead(snake, chosen));
        }
        snake.timer += snake.rules.trackMs;
      }
    } else {
      const path = snake.attackPath.length
        ? snake.attackPath
        : [origin, ...warningPath(state, snake)];
      snake.timer -= TICK_MS;
      // dashMs 可小于固定步；每次只跨一格，并且逐格判定。
      while (snake.timer <= 0 && snake.alive && snake.phase === 'dashing') {
        const next = ahead(snake, snake.locked);
        if (blocked(state, next)) {
          snake.alive = false;
          state.events.push({
            type: 'wall',
            snake: snake.id,
            ...next,
            obstacle: state.wrecks.some((w) => w.active && same(w, next))
              ? 'wreck'
              : 'wall',
          });
          if (!state.wrecks.some((w) => same(w, snake)))
            state.wrecks.push({ x: snake.x, y: snake.y, active: false });
          break;
        }
        moveSnake(snake, next);
        snake.remaining--;
        snake.timer += snake.rules.dashMs;
        if (same(snake, state.apple)) {
          collision ??= { snake, kind: 'dash', path };
          break;
        }
        if (snake.remaining <= 0) {
          snake.phase = 'recovering';
          snake.timer = snake.rules.recoverMs;
        }
      }
    }
    if (same(snake, state.apple))
      collision ??= {
        snake,
        kind: 'tracking',
        path: [origin, { ...state.apple }],
      };
  }
  // 收集所有蛇的同刻事件后统一结算：头部触及苹果优先于全蛇撞墙。
  if (collision)
    hitPlayer(
      state,
      collision.kind === 'dash'
        ? '仍在锁定的冲刺通道内。看准箭头，横向离开危险格。'
        : '被追踪中的敌人追上了。绕墙拉开距离，并保留一格电量脱身。',
      collision.snake,
      collision.kind,
      collision.path,
    );
  if (state.status === 'playing') {
    applyPendingTerrain(state);
    if (state.snakes.every((s) => !s.alive)) finish(state, 'won');
  }
}

export function stars(
  state: Pick<GameState, 'status' | 'elapsedMs' | 'dodges' | 'level'>,
): number {
  if (state.status !== 'won') return 0;
  return (
    1 +
    Number(state.elapsedMs <= state.level.parMs) +
    Number(state.dodges <= state.level.parDodges)
  );
}
