import { MOVE_MS, TICK_MS } from '../src/core/config';
import { ahead, blocked, createState, step } from '../src/core/engine';
import type { Command, Direction, GameState, Level } from '../src/core/types';

export const STRATEGY_LIMIT_MS = 60000;
export const STRATEGIES = [
  {
    id: 'still',
    title: '原地等待',
    algorithm: '从出生起不发送方向或技能，最多观察 60 秒。',
  },
  {
    id: 'left-wall',
    title: '左手贴墙',
    algorithm:
      '先向左直到遇到墙或关闭门，再朝上沿左手墙行走。每到新格按左转、直行、右转、掉头顺序选可行方向；不读取敌人，不用技能。',
  },
  {
    id: 'right-wall',
    title: '右手贴墙',
    algorithm:
      '先向右直到遇到墙或关闭门，再朝上沿右手墙行走。每到新格按右转、直行、左转、掉头顺序选可行方向；不读取敌人，不用技能。',
  },
  {
    id: 'rectangle',
    title: '固定矩形绕圈',
    algorithm:
      '按上 1200ms、右 960ms、下 1200ms、左 960ms 无限循环，形成 8×10 格矩形；撞障碍仍按既定时间换向，不读取敌人或机关。',
  },
  {
    id: 'dodge-spam',
    title: '无脑重复闪避',
    algorithm:
      '沿固定矩形的时间表移动，每 240ms 尝试闪避，不检查资源或敌人；是否执行由正常规则决定。',
  },
  {
    id: 'one-sidestep',
    title: '首次预警只横移一次',
    algorithm:
      '原地等第一条正式预警，优先沿锁向顺时针垂直方向侧移一格；被墙挡则选反方向，两个方向都被挡则继续尝试。成功移动后一直不动。',
  },
  {
    id: 'blind-beacon',
    title: '盲放信标加绕圈',
    algorithm:
      '沿固定矩形的时间表移动，每 240ms 尝试向当前朝向投信标，不看敌人、墙距、资源或已有信标；禁用和费用限制由正常规则决定。',
  },
] as const;

export type StrategyId = (typeof STRATEGIES)[number]['id'];
type Policy = (state: Readonly<GameState>) => Command;
const directions: Direction[] = ['up', 'right', 'down', 'left'];
function turn(direction: Direction, amount: number): Direction {
  return directions[(directions.indexOf(direction) + amount + 4) % 4]!;
}
const positionKey = (state: Readonly<GameState>): string =>
  `${state.apple.x},${state.apple.y}`;

function followWall(hand: 'left' | 'right'): Policy {
  let seeking = true;
  let direction: Direction = hand;
  let lastDecision = '';
  return (state) => {
    if (seeking) {
      if (!blocked(state, ahead(state.apple, direction))) return { direction };
      seeking = false;
      direction = 'up';
    }
    const position = positionKey(state);
    // 同一格等待正常 120ms 移动，不在采样间隔内原地反复改向。
    if (
      position !== lastDecision ||
      blocked(state, ahead(state.apple, direction))
    ) {
      const side = hand === 'left' ? -1 : 1;
      const choice = [side, 0, -side, 2]
        .map((amount) => turn(direction, amount))
        .find((candidate) => !blocked(state, ahead(state.apple, candidate)));
      lastDecision = position;
      if (!choice) return { direction: null };
      direction = choice;
    }
    return { direction };
  };
}

function rectangle(elapsedMs: number): Direction {
  const phase = elapsedMs % (36 * MOVE_MS);
  if (phase < 10 * MOVE_MS) return 'up';
  if (phase < 18 * MOVE_MS) return 'right';
  if (phase < 28 * MOVE_MS) return 'down';
  return 'left';
}

function oneSidestep(): Policy {
  let origin = '';
  let direction: Direction | null = null;
  let finished = false;
  return (state) => {
    if (finished) return { direction: null };
    if (!origin) {
      const warning = state.snakes.find(
        (snake) => snake.alive && snake.phase === 'charging',
      );
      if (!warning) return { direction: null };
      origin = positionKey(state);
      direction = turn(warning.locked, 1);
    }
    if (positionKey(state) !== origin) {
      finished = true;
      return { direction: null };
    }
    if (direction && blocked(state, ahead(state.apple, direction))) {
      const opposite = turn(direction, 2);
      if (!blocked(state, ahead(state.apple, opposite))) direction = opposite;
    }
    return { direction };
  };
}

export function strategyPolicy(id: StrategyId): Policy {
  if (id === 'still') return () => ({ direction: null });
  if (id === 'left-wall') return followWall('left');
  if (id === 'right-wall') return followWall('right');
  if (id === 'one-sidestep') return oneSidestep();
  return (state) => ({
    direction: rectangle(state.elapsedMs),
    dodge: id === 'dodge-spam' && state.elapsedMs % 240 === 0,
    beacon: id === 'blind-beacon' && state.elapsedMs % 240 === 0,
  });
}

export interface StrategyResult {
  level: number;
  status: 'won' | 'lost' | 'timeout';
  elapsedMs: number;
  dodges: number;
  beacons: number;
  remaining: number;
  movedCells: number;
  gateChanges: number;
  reason: string | null;
}

/** 每次均从正常出生开始；策略只返回玩家命令，唯一状态推进入口为 step。 */
export function runStrategy(level: Level, id: StrategyId): StrategyResult {
  const state = createState(level);
  const policy = strategyPolicy(id);
  let movedCells = 0;
  let gateChanges = 0;
  for (
    let elapsed = 0;
    elapsed < STRATEGY_LIMIT_MS && state.status === 'playing';
    elapsed += TICK_MS
  ) {
    const previous = { ...state.apple };
    const gates = state.gates.map((gate) => gate.closed);
    step(state, policy(state));
    movedCells +=
      Math.abs(previous.x - state.apple.x) +
      Math.abs(previous.y - state.apple.y);
    gateChanges += state.gates.filter(
      (gate, index) => gate.closed !== gates[index],
    ).length;
  }
  return {
    level: level.id,
    status: state.status === 'playing' ? 'timeout' : state.status,
    elapsedMs: state.elapsedMs,
    dodges: state.dodges,
    beacons: state.beacons,
    remaining: state.snakes.filter((snake) => snake.alive).length,
    movedCells,
    gateChanges,
    reason: state.lossReason,
  };
}
