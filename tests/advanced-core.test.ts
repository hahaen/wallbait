import { describe, expect, it } from 'vitest';
import {
  BEACON_MS,
  COOLDOWN_MS,
  RECHARGE_MS,
  TICK_MS,
} from '../src/core/config';
import {
  aimDirection,
  blocked,
  createState,
  setPaused,
  step,
  targetFor,
  warningPath,
} from '../src/core/engine';
import type { Command, GameState, Level } from '../src/core/types';

function arena(overrides: Partial<Level> = {}): GameState {
  return createState({
    id: 1,
    name: '规则实验室',
    chapter: '测试',
    focus: '观察规则',
    intent: '隔离规则边界',
    width: 13,
    height: 15,
    walls: [],
    apple: { x: 6, y: 10 },
    facing: 'up',
    snakes: [{ x: 2, y: 2, kind: 'normal', delayMs: 100000 }],
    beaconEnabled: true,
    parMs: 20000,
    parDodges: 3,
    ...overrides,
  });
}
function advance(
  state: GameState,
  milliseconds: number,
  command: Command = { direction: null },
): void {
  for (let t = 0; t < milliseconds; t += TICK_MS) step(state, command);
}

describe('共享电量与信标', () => {
  it('两技能各耗一格，同步命令先闪避并在落点放信标', () => {
    const s = arena();
    step(s, { direction: 'right', dodge: true, beacon: true });
    expect(s.apple).toEqual({ x: 8, y: 10 });
    expect(s.beacon).toEqual({ x: 8, y: 10, remainingMs: BEACON_MS });
    expect(s.energy).toBe(0);
    expect(s.dodges).toBe(1);
    expect(s.beacons).toBe(1);
    advance(s, COOLDOWN_MS, { direction: null, dodge: true, beacon: true });
    expect(s.dodges).toBe(1);
    expect(s.beacons).toBe(1);
  });
  it('仅剩一格时闪避优先；每三秒回一格，上限两格', () => {
    const s = arena();
    s.energy = 1;
    step(s, { direction: 'right', dodge: true, beacon: true });
    expect(s.energy).toBe(0);
    expect(s.beacon).toBeNull();
    const charging = arena();
    step(charging, { direction: 'right', dodge: true, beacon: true });
    advance(charging, RECHARGE_MS - TICK_MS);
    expect(charging.energy).toBe(0);
    step(charging, { direction: null });
    expect(charging.energy).toBe(1);
    advance(charging, RECHARGE_MS * 2);
    expect(charging.energy).toBe(2);
    expect(charging.rechargeMs).toBe(0);
  });
  it('撞墙闪避不耗电，未开放或仍在场的信标不耗电', () => {
    const s = arena({ apple: { x: 1, y: 10 }, beaconEnabled: false });
    step(s, { direction: 'left', dodge: true, beacon: true });
    expect(s.energy).toBe(2);
    expect(s.beacon).toBeNull();
    s.level = { ...s.level, beaconEnabled: true };
    step(s, { direction: null, beacon: true });
    step(s, { direction: null, beacon: true });
    expect(s.energy).toBe(1);
    expect(s.beacons).toBe(1);
    advance(s, BEACON_MS - TICK_MS);
    expect(s.beacon).toBeNull();
  });
  it('暂停冻结充电、信标及门；重新初始化没有旧引用', () => {
    const s = arena();
    step(s, { direction: null, beacon: true });
    setPaused(s, true);
    const snapshot = structuredClone(s);
    advance(s, 6000, { direction: 'left', dodge: true, beacon: true });
    expect(s).toEqual(snapshot);
    const fresh = createState(s.level);
    expect(fresh.energy).toBe(2);
    expect(fresh.beacon).toBeNull();
    expect(fresh.gates).not.toBe(s.gates);
  });
});

describe('三种策略与不可变正式预警', () => {
  it('追逐者追实际位置，截击者预测前两格并在墙前截断', () => {
    const s = arena({ apple: { x: 6, y: 7 }, facing: 'right' });
    const normal = s.snakes[0]!;
    const swift = { ...normal, kind: 'swift' as const };
    expect(targetFor(s, normal)).toEqual({ x: 6, y: 7 });
    expect(targetFor(s, swift)).toEqual({ x: 8, y: 7 });
    s.level = { ...s.level, walls: [{ x: 7, y: 7 }] };
    expect(targetFor(s, swift)).toEqual({ x: 6, y: 7 });
    step(s, { direction: null, beacon: true });
    s.apple = { x: 9, y: 9 };
    expect(targetFor(s, swift)).toEqual({ x: 6, y: 7 });
  });
  it('谨慎者拒绝真人的撞墙线路，但会被信标引诱', () => {
    const s = arena({
      apple: { x: 9, y: 7 },
      snakes: [{ x: 7, y: 7, kind: 'cautious', delayMs: 100000 }],
    });
    expect(aimDirection(s, s.snakes[0]!)).toBeNull();
    step(s, { direction: null, beacon: true });
    expect(aimDirection(s, s.snakes[0]!)).toBe('right');
    s.beacon = null;
    s.snakes[0]!.x = 5;
    expect(aimDirection(s, s.snakes[0]!)).toBe('right');
  });
  it('谨慎者追踪保持两格距离，在玩家逼近时退让', () => {
    const s = arena({
      apple: { x: 9, y: 7 },
      snakes: [{ x: 7, y: 7, kind: 'cautious' }],
    });
    advance(s, 1000);
    expect(s.snakes[0]!.x).toBe(7);
    expect(s.snakes[0]!.y).toBe(7);
    s.apple = { x: 8, y: 7 };
    s.snakes[0]!.timer = 0;
    step(s, { direction: null });
    expect(
      Math.abs(s.apple.x - s.snakes[0]!.x) +
        Math.abs(s.apple.y - s.snakes[0]!.y),
    ).toBe(2);
  });
  it('玩家改变方向且信标到期，都不改变已展示的锁定路径', () => {
    const s = arena({
      apple: { x: 8, y: 7 },
      snakes: [{ x: 5, y: 7, kind: 'swift' }],
    });
    step(s, { direction: null, beacon: true });
    advance(s, 140);
    const snake = s.snakes[0]!;
    expect(snake.phase).toBe('charging');
    const path = warningPath(s, snake);
    s.beacon!.remainingMs = TICK_MS;
    advance(s, 240, { direction: 'up' });
    expect(s.beacon).toBeNull();
    expect(snake.locked).toBe('right');
    expect(warningPath(s, snake)).toEqual(path);
  });
});

describe('踏板门与攻击路径', () => {
  const gates = [
    {
      id: 'A',
      cells: [{ x: 8, y: 10 }],
      switches: [{ x: 7, y: 10 }],
      initialClosed: true,
    },
  ];
  it('踩入翻转、站住不重复；闪避逐格激活踏板再通过刚打开的门', () => {
    const s = arena({ gates });
    expect(blocked(s, { x: 8, y: 10 })).toBe(true);
    step(s, { direction: 'right', dodge: true });
    expect(s.apple).toEqual({ x: 8, y: 10 });
    expect(s.gates[0]!.closed).toBe(false);
    advance(s, 240, { direction: 'left' });
    // 重新进入踏板请求关门时已经离开门格，可安全关闭。
    expect(s.apple).toEqual({ x: 6, y: 10 });
    expect(s.gates[0]!.closed).toBe(true);
    advance(s, 120, { direction: 'right' });
    expect(s.gates[0]!.closed).toBe(false);
    advance(s, 1000);
    expect(s.gates[0]!.closed).toBe(false);
  });
  it('敌人占门时延后关门，离开后生效，不挤压角色', () => {
    const s = arena({ gates: [{ ...gates[0]!, initialClosed: false }] });
    Object.assign(s.snakes[0]!, { x: 8, y: 10 });
    advance(s, 120, { direction: 'right' });
    expect(s.gates[0]).toEqual({ id: 'A', closed: false, pending: true });
    s.snakes[0]!.y = 9;
    step(s, { direction: null });
    expect(s.gates[0]).toEqual({ id: 'A', closed: true, pending: null });
    expect(s.status).toBe('playing');
  });
  it('预警和冲刺全过程冻结门，冲刺按原路径撞门后再执行请求', () => {
    const s = arena({
      gates,
      snakes: [
        { x: 2, y: 2, kind: 'normal', delayMs: 100000 },
        { x: 3, y: 2, kind: 'normal', delayMs: 100000 },
      ],
    });
    const snake = s.snakes[0]!;
    Object.assign(snake, {
      x: 8,
      y: 7,
      phase: 'charging',
      locked: 'down',
      timer: 300,
    });
    const initialPath = warningPath(s, snake);
    advance(s, 120, { direction: 'right' });
    expect(s.gates[0]).toEqual({ id: 'A', closed: true, pending: false });
    expect(warningPath(s, snake)).toEqual(initialPath);
    advance(s, 500);
    expect(snake.alive).toBe(false);
    expect(s.gates[0]).toEqual({ id: 'A', closed: false, pending: null });
    expect(s.status).toBe('playing');
  });
  it('再次踩入取消待切换，关闭门的信标不会引导追踪穿门', () => {
    const s = arena({ gates });
    const snake = s.snakes[0]!;
    Object.assign(snake, {
      x: 8,
      y: 7,
      phase: 'charging',
      locked: 'down',
      timer: 2000,
    });
    advance(s, 120, { direction: 'right' });
    advance(s, 120, { direction: 'left' });
    advance(s, 120, { direction: 'right' });
    expect(s.gates[0]!.pending).toBeNull();
    s.beacon = { x: 8, y: 10, remainingMs: 2000 };
    Object.assign(snake, { phase: 'tracking', timer: 0, x: 8, y: 9 });
    step(s, { direction: null });
    expect(snake).toMatchObject({ x: 8, y: 9, alive: true });
  });
  it('关门逐格挡住超高速敌人，失败保留可读原因', () => {
    const s = arena({ gates });
    const snake = s.snakes[0]!;
    Object.assign(snake, {
      x: 8,
      y: 8,
      phase: 'dashing',
      locked: 'down',
      remaining: 4,
      timer: 1,
    });
    snake.rules.dashMs = 5;
    step(s, { direction: null });
    expect(snake.y).toBe(9);
    expect(snake.alive).toBe(false);
    const losing = arena();
    Object.assign(losing.snakes[0]!, { x: 7, y: 10 });
    step(losing, { direction: 'right', dodge: true });
    expect(losing.status).toBe('lost');
    expect(losing.lossReason).toContain('没有无敌');
  });
});
