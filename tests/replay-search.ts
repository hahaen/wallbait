import {
  ahead,
  blocked,
  createState,
  step,
  targetFor,
} from '../src/core/engine';
import { DIRECTIONS } from '../src/core/config';
import type { Command, GameState, Level, Point } from '../src/core/types';

export interface Replay {
  level: number;
  elapsedMs: number;
  dodges: number;
  beacons: number;
  commands: Command[];
}
interface Node {
  state: GameState;
  commands: Command[];
  score: number;
}
function clone(s: GameState): GameState {
  return {
    ...s,
    apple: { ...s.apple },
    events: [],
    beacon: s.beacon ? { ...s.beacon } : null,
    gates: s.gates.map((g) => ({ ...g })),
    snakes: s.snakes.map((v) => ({ ...v, body: [...v.body] })),
  };
}
const key = (p: Point): string => `${p.x},${p.y}`;
function distances(s: GameState): Map<string, number> {
  const map = new Map([[key(s.apple), 0]]),
    queue = [s.apple];
  for (let i = 0; i < queue.length; i++)
    for (const d of DIRECTIONS) {
      const p = ahead(queue[i]!, d);
      if (!blocked(s, p) && !map.has(key(p))) {
        map.set(key(p), map.get(key(queue[i]!))! + 1);
        queue.push(p);
      }
    }
  return map;
}
function score(s: GameState): number {
  let value = 0;
  const path = distances(s);
  let reachable = false;
  for (const snake of s.snakes) {
    if (!snake.alive) {
      value += 2000;
      continue;
    }
    if (!path.has(key(snake))) continue;
    reachable = true;
    value += 200;
    const dx = Math.abs(s.apple.x - snake.x),
      dy = Math.abs(s.apple.y - snake.y),
      distance = dx + dy;
    if (snake.phase === 'charging' || snake.phase === 'dashing') {
      let p: Point = snake,
        willHitWall = false,
        danger = false;
      const steps =
        snake.phase === 'charging' ? snake.rules.dashCells : snake.remaining;
      for (let i = 0; i < steps; i++) {
        p = ahead(p, snake.locked);
        if (blocked(s, p)) {
          willHitWall = true;
          break;
        }
        if (p.x === s.apple.x && p.y === s.apple.y) danger = true;
      }
      value += willHitWall ? 800 : 15;
      value -= danger ? 250 : 0;
      if (willHitWall) value += (snake.rules.chargeMs - snake.timer) / 20;
    } else {
      // 找到同轴且终点能撞墙的布点位置，鼓励真实走位而非修改状态。
      let setup = 30;
      for (const d of DIRECTIONS) {
        let p: Point = snake;
        const spots: Point[] = [];
        let wall = false;
        for (let i = 0; i < snake.rules.dashCells; i++) {
          p = ahead(p, d);
          if (blocked(s, p)) {
            wall = true;
            break;
          }
          spots.push(p);
        }
        if (wall)
          for (const spot of spots)
            setup = Math.min(setup, path.get(key(spot)) ?? 30);
      }
      value += 80 - setup * 7 - Math.min(dx, dy) * 3 - Math.abs(distance - 3);
      if (s.beacon) {
        const target = targetFor(s, snake);
        value +=
          30 -
          (Math.abs(target.x - snake.x) + Math.abs(target.y - snake.y)) * 3;
      }
      if (snake.kind === 'cautious' && !s.beacon && s.energy > 0 && setup === 0)
        value += 15;
    }
    if (distance < 2) value -= (2 - distance) * 60;
  }
  if (!reachable) {
    let switchDistance = 50;
    for (const gate of s.level.gates ?? []) {
      const current = s.gates.find((g) => g.id === gate.id)!;
      if (!current.closed && current.pending !== true) continue;
      for (const p of gate.switches)
        switchDistance = Math.min(switchDistance, path.get(key(p)) ?? 50);
    }
    value += 100 - switchDistance * 10;
  }
  value += s.energy * 4;
  value -= s.dodges * 0.3 + s.beacons * 0.5;
  return value;
}
function fingerprint(s: GameState): string {
  return `${s.apple.x},${s.apple.y},${s.facing},${s.energy},${Math.ceil(s.rechargeMs / 240)},${s.cooldownMs},${s.moveTimer};${s.beacon ? `${s.beacon.x},${s.beacon.y},${Math.ceil(s.beacon.remainingMs / 120)}` : '-'};${s.gates.map((g) => `${g.closed},${g.pending}`).join(';')};${s.snakes.map((v) => (v.alive ? `${v.x},${v.y},${v.phase},${v.locked},${Math.ceil(v.timer / 120)},${v.aimDirection},${v.aim},${v.remaining}` : 'x')).join(';')}`;
}
/** 测试工具：120ms决策，只通过正常命令推进，生成文件不赋值游戏坐标/状态。 */
export function findReplay(level: Level): Replay {
  let beam: Node[] = [{ state: createState(level), commands: [], score: 0 }];
  const actions: Command[] = [
    { direction: null },
    ...DIRECTIONS.map((direction) => ({ direction })),
    ...DIRECTIONS.map((direction) => ({ direction, dodge: true })),
  ];
  if (level.beaconEnabled)
    actions.push(
      { direction: null, beacon: true },
      ...DIRECTIONS.map((direction) => ({ direction, beacon: true })),
    );
  const width = Number(process.env.REPLAY_WIDTH ?? 100);
  for (let depth = 0; depth < 600; depth++) {
    const candidates = new Map<string, Node>();
    for (const node of beam)
      for (const command of actions) {
        if (
          command.dodge &&
          (node.state.cooldownMs > 0 || node.state.energy === 0)
        )
          continue;
        if (command.beacon && (node.state.beacon || node.state.energy === 0))
          continue;
        const state = clone(node.state);
        for (let i = 0; i < 6; i++)
          step(state, {
            direction: command.direction,
            dodge: i === 0 && command.dodge,
            beacon: i === 0 && command.beacon,
          });
        if (state.status === 'lost') continue;
        const commands = [...node.commands, command];
        if (state.status === 'won')
          return {
            level: level.id,
            elapsedMs: state.elapsedMs,
            dodges: state.dodges,
            beacons: state.beacons,
            commands,
          };
        const k = fingerprint(state),
          value = score(state),
          old = candidates.get(k);
        if (!old || value > old.score)
          candidates.set(k, { state, commands, score: value });
      }
    beam = [...candidates.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, width);
    if (!beam.length) break;
  }
  throw new Error(`未找到第 ${level.id} 关回放`);
}
