import {
  COOLDOWN_MS,
  DIRECTIONS,
  DODGE_CELLS,
  MOVE_MS,
  SNAKE_RULES,
  TICK_MS,
  VECTOR,
} from './config';
import type {
  Command,
  Direction,
  GameState,
  Level,
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
export function createState(level: Level): GameState {
  return {
    level,
    status: 'playing',
    paused: false,
    elapsedMs: 0,
    apple: { ...level.apple },
    facing: level.facing,
    moveTimer: MOVE_MS,
    cooldownMs: 0,
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
    })),
  };
}
export function setPaused(state: GameState, paused: boolean): void {
  if (state.status !== 'playing') return;
  state.paused = paused;
  state.moveTimer = MOVE_MS;
  state.events = [];
}
function finish(state: GameState, status: 'won' | 'lost'): void {
  if (state.status !== 'playing') return;
  state.status = status;
  state.events.push({ type: status, ...state.apple });
}
function headAt(state: GameState, point: Point): boolean {
  return state.snakes.some((s) => s.alive && same(s, point));
}
function moveApple(state: GameState, direction: Direction): boolean {
  const next = ahead(state.apple, direction);
  if (solid(state.level, next)) return false;
  state.apple = next;
  // 即使同一时间蛇准备离开此格，也不能与蛇头换位穿越。
  if (headAt(state, next)) finish(state, 'lost');
  return true;
}
export function aimDirection(state: GameState, snake: Snake): Direction | null {
  const dx = state.apple.x - snake.x,
    dy = state.apple.y - snake.y;
  if (dx !== 0 && dy !== 0) return null;
  const distance = Math.abs(dx) + Math.abs(dy);
  if (distance === 0 || distance > snake.rules.range) return null;
  const direction = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
  let point: Point = snake;
  for (let i = 0; i < distance; i++) {
    point = ahead(point, direction);
    if (solid(state.level, point)) return null;
  }
  return direction;
}
// 从苹果做一次 BFS，追踪只选择可通行、距离变短的格；不以碰墙代替寻路。
function distances(state: GameState): Map<string, number> {
  const result = new Map<string, number>([[key(state.apple), 0]]);
  const queue = [state.apple];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    for (const d of DIRECTIONS) {
      const next = ahead(current, d),
        k = key(next);
      if (!solid(state.level, next) && !result.has(k)) {
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
  state.cooldownMs = Math.max(0, state.cooldownMs - TICK_MS);
  if (command.direction) state.facing = command.direction;
  if (headAt(state, state.apple)) {
    finish(state, 'lost');
    return;
  }
  let dodged = false;
  if (
    command.dodge &&
    state.cooldownMs === 0 &&
    !solid(state.level, ahead(state.apple, state.facing))
  ) {
    state.dodges++;
    state.cooldownMs = COOLDOWN_MS;
    dodged = true;
    state.events.push({ type: 'dodge', ...state.apple });
    for (let i = 0; i < DODGE_CELLS && state.status === 'playing'; i++) {
      if (!moveApple(state, state.facing)) break;
    }
    state.moveTimer = MOVE_MS;
  }
  if (state.status !== 'playing') return;
  if (!command.direction) state.moveTimer = MOVE_MS;
  else if (!dodged) {
    state.moveTimer -= TICK_MS;
    if (state.moveTimer <= 0) {
      moveApple(state, command.direction);
      state.moveTimer += MOVE_MS;
    }
  }
  if (state.status !== 'playing') return;

  let path: Map<string, number> | undefined;
  let touched = false;
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
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
        path ??= distances(state);
        let best = path.get(key(snake)) ?? Infinity;
        let chosen: Direction | undefined;
        for (const direction of DIRECTIONS) {
          const next = ahead(snake, direction),
            distance = path.get(key(next));
          if (distance !== undefined && distance < best) {
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
      snake.timer -= TICK_MS;
      // dashMs 可小于固定步；每次只跨一格，并且逐格判定。
      while (snake.timer <= 0 && snake.alive && snake.phase === 'dashing') {
        const next = ahead(snake, snake.locked);
        if (solid(state.level, next)) {
          snake.alive = false;
          state.events.push({ type: 'wall', snake: snake.id, ...next });
          break;
        }
        moveSnake(snake, next);
        snake.remaining--;
        snake.timer += snake.rules.dashMs;
        if (same(snake, state.apple)) {
          touched = true;
          break;
        }
        if (snake.remaining <= 0) {
          snake.phase = 'recovering';
          snake.timer = snake.rules.recoverMs;
        }
      }
    }
    if (same(snake, state.apple)) touched = true;
  }
  // 收集所有蛇的同刻事件后统一结算：头部触及苹果优先于全蛇撞墙。
  if (touched) finish(state, 'lost');
  else if (state.snakes.every((s) => !s.alive)) finish(state, 'won');
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
