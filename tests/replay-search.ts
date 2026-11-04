import {
  ahead,
  blocked,
  createState,
  step,
  targetFor,
} from '../src/core/engine';
import { tacticComplete, magnetMove, pulseTargets } from '../src/core/engine';
import { DIRECTIONS } from '../src/core/config';
import type {
  Command,
  GameState,
  Level,
  Point,
  UtilitySkill,
} from '../src/core/types';

export interface Replay {
  level: number;
  elapsedMs: number;
  dodges: number;
  beacons: number;
  commands: Command[];
  utility?: UtilitySkill;
}
interface Node {
  state: GameState;
  commands: Command[];
  score: number;
  wreckHit: boolean;
}
function clone(s: GameState): GameState {
  return {
    ...s,
    apple: { ...s.apple },
    events: [],
    eliminations: s.eliminations.map((p) => ({ ...p })),
    interference: s.interference.map((f) => ({ ...f })),
    highlights: s.highlights.map((h) => ({ ...h })),
    lureKills: s.lureKills.map((k) => ({ ...k })),
    beacon: s.beacon ? { ...s.beacon } : null,
    gates: s.gates.map((g) => ({ ...g })),
    wrecks: s.wrecks.map((w) => ({ ...w })),
    snakes: s.snakes.map((v) => ({
      ...v,
      body: [...v.body],
      abilityTarget: v.abilityTarget ? { ...v.abilityTarget } : null,
    })),
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
function score(s: GameState, seekWreck = false, wreckAt?: Point): number {
  let value = 0;
  const path = distances(s);
  let reachable = false;
  if (seekWreck && !s.highlights.some((h) => h.id === 'wreck-chain')) {
    let setup = 50;
    for (const wreck of s.wrecks) {
      if (wreckAt && (wreck.x !== wreckAt.x || wreck.y !== wreckAt.y)) continue;
      for (const direction of DIRECTIONS) {
        const spot = ahead(wreck, direction);
        setup = Math.min(setup, path.get(key(spot)) ?? 50);
      }
    }
    if (s.wrecks.length) value += 500 - setup * 35;
  }
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
        willHitWreck = false,
        danger = false;
      const steps =
        snake.phase === 'charging' ? snake.rules.dashCells : snake.remaining;
      for (let i = 0; i < steps; i++) {
        p = ahead(p, snake.locked);
        if (blocked(s, p)) {
          willHitWall = true;
          willHitWreck = s.wrecks.some(
            (w) =>
              w.active &&
              w.x === p.x &&
              w.y === p.y &&
              (!wreckAt || (p.x === wreckAt.x && p.y === wreckAt.y)),
          );
          break;
        }
        if (p.x === s.apple.x && p.y === s.apple.y) danger = true;
      }
      value += willHitWall ? 800 : 15;
      if (seekWreck && willHitWreck) value += 1500;
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
  return `${s.utility},${s.pulses},${s.pushes},${s.charges},${s.gateChanges};${s.eliminations.map(key).join(';')};${s.interference.map((f) => `${key(f)},${f.snake},${Math.ceil(f.remainingMs / 120)}`).join(';')};${s.chipCollected};${s.highlights.map((h) => h.id).join(',')};${s.apple.x},${s.apple.y},${s.facing},${s.energy},${Math.ceil(s.rechargeMs / 240)},${s.cooldownMs},${s.moveTimer};${s.beacon ? `${s.beacon.x},${s.beacon.y},${Math.ceil(s.beacon.remainingMs / 120)}` : '-'};${s.gates.map((g) => `${g.closed},${g.pending}`).join(';')};${s.wrecks.map((w) => `${w.x},${w.y},${w.active}`).join(';')};${s.snakes.map((v) => (v.alive ? `${v.x},${v.y},${v.phase},${v.locked},${Math.ceil(v.timer / 120)},${v.aimDirection},${v.aim},${v.remaining},${v.stunMs},${Math.ceil(v.abilityCooldownMs / 120)},${v.followup},${v.abilityTarget ? key(v.abilityTarget) : '-'}` : 'x')).join(';')}`;
}
/** 测试工具：120ms决策，只通过正常命令推进，生成文件不赋值游戏坐标/状态。 */
export function findReplay(
  level: Level,
  goal: {
    chip?: boolean;
    wreck?: boolean;
    wreckAt?: Point;
    utility?: UtilitySkill;
    useUtility?: boolean;
    tactic?: boolean;
  } = {},
  prefix: Command[] = [],
): Replay {
  if (goal.tactic && level.tactic === 'chip') goal = { ...goal, chip: true };
  if (goal.tactic && level.tactic === 'wreck') goal = { ...goal, wreck: true };
  const initial = createState(level, goal.utility);
  for (const c of prefix)
    for (let i = 0; i < 6; i++)
      step(initial, {
        direction: c.direction,
        dodge: i === 0 && c.dodge,
        beacon: i === 0 && c.beacon,
      });
  let beam: Node[] = [
    { state: initial, commands: [...prefix], score: 0, wreckHit: false },
  ];
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
        if (
          command.dodge &&
          node.state.utility === 'pulse' &&
          !pulseTargets(node.state).length
        )
          continue;
        if (
          command.dodge &&
          node.state.utility === 'magnet' &&
          !magnetMove({
            ...node.state,
            facing: command.direction ?? node.state.facing,
          })
        )
          continue;
        const state = clone(node.state);
        let wreckHit = node.wreckHit;
        for (let i = 0; i < 6; i++) {
          step(state, {
            direction: command.direction,
            dodge: i === 0 && command.dodge,
            beacon: i === 0 && command.beacon,
          });
          if (
            state.events.some(
              (e) =>
                e.type === 'wall' &&
                e.obstacle === 'wreck' &&
                (!goal.wreckAt ||
                  (e.x === goal.wreckAt.x && e.y === goal.wreckAt.y)),
            )
          )
            wreckHit = true;
        }
        if (goal.wreckAt) {
          const snake = state.snakes[0]!;
          if (
            !snake.alive &&
            !state.wrecks.some(
              (w) => w.x === goal.wreckAt!.x && w.y === goal.wreckAt!.y,
            )
          )
            continue;
          if (
            snake.alive &&
            (snake.phase === 'charging' || snake.phase === 'dashing')
          ) {
            let p: Point = snake;
            let wrongWall = false;
            const count =
              snake.phase === 'charging'
                ? snake.rules.dashCells
                : snake.remaining;
            for (let i = 0; i < count; i++) {
              const next = ahead(p, snake.locked);
              if (blocked(state, next)) {
                wrongWall = p.x !== goal.wreckAt.x || p.y !== goal.wreckAt.y;
                break;
              }
              p = next;
            }
            if (wrongWall) continue;
          }
        }
        if (state.status === 'lost') continue;
        if (
          goal.tactic &&
          level.tactic === 'first-lure' &&
          state.charges > level.snakes.length
        )
          continue;
        const commands = [...node.commands, command];
        if (
          state.status === 'won' &&
          (!goal.chip || state.chipCollected) &&
          (!goal.wreck || wreckHit) &&
          (!goal.useUtility || state.pulses + state.pushes > 0) &&
          (!goal.tactic || tacticComplete(state))
        )
          return {
            level: level.id,
            ...(goal.utility ? { utility: goal.utility } : {}),
            elapsedMs: state.elapsedMs,
            dodges: state.dodges,
            beacons: state.beacons,
            commands,
          };
        if (state.status === 'won') continue;
        const chipDistance =
          goal.chip && level.chip && !state.chipCollected
            ? (distances(state).get(key(level.chip)) ?? 50)
            : 0;
        let utilityScore = 0;
        if (goal.useUtility) {
          if (state.pulses + state.pushes > 0) utilityScore = 1600;
          else if (state.utility === 'magnet') {
            const path = distances(state);
            let nearest = 50;
            for (const wreck of state.wrecks.filter((w) => w.active))
              for (const d of DIRECTIONS)
                nearest = Math.min(
                  nearest,
                  path.get(key(ahead(wreck, d))) ?? 50,
                );
            if (state.wrecks.length)
              utilityScore = 500 - nearest * 30 + (magnetMove(state) ? 100 : 0);
          }
        }
        const k = `${wreckHit}:${fingerprint(state)}`,
          value =
            score(state, goal.wreck, goal.wreckAt) +
            utilityScore +
            (goal.tactic && level.tactic === 'split'
              ? new Set(state.eliminations.map(key)).size * 300
              : 0) +
            (goal.chip && state.chipCollected ? 1000 : -chipDistance * 20) +
            (goal.wreck && wreckHit ? 1000 : 0) -
            (goal.wreckAt && !state.wrecks.length
              ? (Math.abs(state.apple.x - goal.wreckAt.x) +
                  Math.abs(state.apple.y - goal.wreckAt.y)) *
                20
              : 0),
          old = candidates.get(k);
        if (!old || value > old.score)
          candidates.set(k, { state, commands, score: value, wreckHit });
      }
    beam = [...candidates.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, width);
    if (!beam.length) break;
  }
  throw new Error(`未找到第 ${level.id} 关回放`);
}
