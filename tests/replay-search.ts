import { ahead, createState, solid, step } from '../src/core/engine';
import { DIRECTIONS } from '../src/core/config';
import type { Command, GameState, Level } from '../src/core/types';

export interface Replay {
  level: number;
  elapsedMs: number;
  dodges: number;
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
    snakes: s.snakes.map((v) => ({ ...v, body: [...v.body] })),
  };
}
function score(s: GameState): number {
  let value = 0;
  for (const snake of s.snakes) {
    if (!snake.alive) {
      value += 1000;
      continue;
    }
    const dx = Math.abs(s.apple.x - snake.x),
      dy = Math.abs(s.apple.y - snake.y);
    const distance = dx + dy;
    if (snake.phase === 'charging' || snake.phase === 'dashing') {
      let p = { x: snake.x, y: snake.y },
        willHitWall = false,
        danger = false;
      for (
        let i = 0;
        i <
        (snake.phase === 'charging' ? snake.rules.dashCells : snake.remaining);
        i++
      ) {
        p = ahead(p, snake.locked);
        if (solid(s.level, p)) {
          willHitWall = true;
          break;
        }
        if (p.x === s.apple.x && p.y === s.apple.y) danger = true;
      }
      value += willHitWall ? 320 : 25;
      value -= danger ? 160 : 0;
      if (willHitWall) value += (snake.rules.chargeMs - snake.timer) / 30;
    } else {
      value += 22 - Math.min(dx, dy) * 5 - Math.abs(distance - 4) * 1.5;
    }
    if (distance < 3) value -= (3 - distance) * 20;
  }
  value -= s.dodges * 0.3;
  return value;
}
function fingerprint(s: GameState): string {
  return `${s.apple.x},${s.apple.y},${s.facing},${Math.ceil(s.cooldownMs / 240)};${s.snakes.map((v) => (v.alive ? `${v.x},${v.y},${v.phase},${v.locked},${Math.ceil(v.timer / 120)},${v.remaining}` : 'x')).join(';')}`;
}
/** 仅测试工具：120ms 决策束搜索，只输出命令，不修改规则状态。 */
export function findReplay(level: Level): Replay {
  let beam: Node[] = [{ state: createState(level), commands: [], score: 0 }];
  const actions: Command[] = [
    { direction: null },
    ...DIRECTIONS.map((direction) => ({ direction })),
    ...DIRECTIONS.map((direction) => ({ direction, dodge: true })),
  ];
  for (let depth = 0; depth < 350; depth++) {
    const candidates = new Map<string, Node>();
    for (const node of beam)
      for (const command of actions) {
        if (command.dodge && node.state.cooldownMs > 0) continue;
        const state = clone(node.state);
        for (let i = 0; i < 6; i++)
          step(state, {
            direction: command.direction,
            dodge: i === 0 && command.dodge,
          });
        if (state.status === 'lost') continue;
        const commands = [...node.commands, command];
        if (state.status === 'won')
          return {
            level: level.id,
            elapsedMs: state.elapsedMs,
            dodges: state.dodges,
            commands,
          };
        const k = fingerprint(state),
          value = score(state);
        const old = candidates.get(k);
        if (!old || value > old.score)
          candidates.set(k, { state, commands, score: value });
      }
    beam = [...candidates.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);
    if (!beam.length) break;
  }
  throw new Error(`未找到第 ${level.id} 关回放`);
}
