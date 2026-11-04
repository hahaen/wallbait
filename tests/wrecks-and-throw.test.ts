import { describe, expect, it } from 'vitest';
import { BEACON_MS, TICK_MS } from '../src/core/config';
import {
  aimDirection,
  beaconLanding,
  blocked,
  createState,
  setPaused,
  step,
  targetFor,
  warningPath,
} from '../src/core/engine';
import { LEVELS } from '../src/core/levels';
import type { Command, GameState, Level } from '../src/core/types';

function arena(overrides: Partial<Level> = {}): GameState {
  return createState({
    id: 1,
    name: '残骸实验室',
    chapter: '测试',
    focus: '规则边界',
    intent: '规则边界',
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
  s: GameState,
  ms: number,
  command: Command = { direction: null },
): void {
  for (let t = 0; t < ms; t += TICK_MS) step(s, command);
}

describe('投掷信标', () => {
  it('四个朝向与实际落点一致，先投再移动，仍只消耗一格电', () => {
    for (const [direction, point] of [
      ['up', { x: 6, y: 8 }],
      ['right', { x: 8, y: 10 }],
      ['down', { x: 6, y: 12 }],
      ['left', { x: 4, y: 10 }],
    ] as const) {
      const s = arena({ facing: direction });
      expect(beaconLanding(s)).toEqual(point);
      step(s, { direction, beacon: true });
      expect(s.beacon).toEqual({ ...point, remainingMs: BEACON_MS });
      expect(s.energy).toBe(1);
      expect(s.beacons).toBe(1);
    }
  });
  it('墙、边界、关闭门与实心残骸截短投掷；待生效残骸允许通过', () => {
    const s = arena({ walls: [{ x: 6, y: 8 }] });
    expect(beaconLanding(s)).toEqual({ x: 6, y: 9 });
    s.wrecks.push({ x: 6, y: 9, active: true });
    expect(beaconLanding(s)).toEqual(s.apple);
    s.wrecks[0]!.active = false;
    expect(beaconLanding(s)).toEqual({ x: 6, y: 9 });
    const gate = arena({
      gates: [
        {
          id: 'A',
          cells: [{ x: 6, y: 9 }],
          switches: [{ x: 3, y: 3 }],
          initialClosed: true,
        },
      ],
    });
    expect(beaconLanding(gate)).toEqual(gate.apple);
    const edge = arena({ apple: { x: 6, y: 1 } });
    step(edge, { direction: null, beacon: true });
    expect(edge.beacon).toMatchObject({ x: 6, y: 1 });
  });
  it('信标投过敌人头部仍能诱导侦察者，已锁向的攻击不改向', () => {
    const s = arena({
      apple: { x: 9, y: 7 },
      facing: 'right',
      snakes: [{ x: 10, y: 7, kind: 'cautious', delayMs: 100000 }],
    });
    step(s, { direction: null, beacon: true });
    expect(s.beacon).toMatchObject({ x: 11, y: 7 });
    expect(s.status).toBe('playing');
    expect(aimDirection(s, s.snakes[0]!)).toBe('right');
    Object.assign(s.snakes[0]!, {
      phase: 'charging',
      locked: 'left',
      timer: 1000,
    });
    const path = warningPath(s, s.snakes[0]!);
    advance(s, 120, { direction: 'down' });
    expect(s.snakes[0]!.locked).toBe('left');
    expect(warningPath(s, s.snakes[0]!)).toEqual(path);
  });
});

describe('残骸与公平的地形生效', () => {
  it('撞毁留下最后头部格，冻结其他已锁定攻击；攻击结束后才阻挡', () => {
    const s = arena({
      walls: [{ x: 5, y: 5 }],
      snakes: [
        { x: 5, y: 6, kind: 'normal' },
        { x: 2, y: 6, kind: 'swift' },
      ],
    });
    Object.assign(s.snakes[0]!, {
      phase: 'dashing',
      locked: 'up',
      remaining: 4,
      timer: 1,
    });
    Object.assign(s.snakes[1]!, {
      phase: 'charging',
      locked: 'right',
      timer: 700,
    });
    const path = warningPath(s, s.snakes[1]!);
    step(s, { direction: null });
    expect(s.wrecks).toEqual([{ x: 5, y: 6, active: false }]);
    expect(blocked(s, { x: 5, y: 6 })).toBe(false);
    expect(warningPath(s, s.snakes[1]!)).toEqual(path);
    advance(s, 800);
    expect(s.snakes[1]!.alive).toBe(true);
    expect(s.snakes[1]!.x).toBe(5);
    expect(s.wrecks[0]!.active).toBe(false);
    // 仍有敌人占格时也不生效；恢复后的追踪离开才形成障碍。
    s.snakes[1]!.timer = 0;
    advance(s, 300);
    expect(s.wrecks[0]!.active).toBe(true);
  });
  it('玩家占格、暂停不生效；离开后激活，信标被覆盖即移除，重开清空', () => {
    const s = arena();
    s.wrecks.push({ ...s.apple, active: false });
    s.beacon = { ...s.apple, remainingMs: BEACON_MS };
    step(s, { direction: null });
    expect(s.wrecks[0]!.active).toBe(false);
    setPaused(s, true);
    const snapshot = structuredClone(s);
    advance(s, 3000, { direction: 'right' });
    expect(s).toEqual(snapshot);
    setPaused(s, false);
    step(s, { direction: 'right' });
    expect(s.wrecks[0]!.active).toBe(true);
    expect(s.beacon).toBeNull();
    expect(createState(s.level).wrecks).toEqual([]);
  });
  it('残骸阻挡闪避、视线、预测与追踪，冲刺撞残骸也淘汰并接出新残骸', () => {
    const s = arena({
      apple: { x: 6, y: 7 },
      facing: 'right',
      snakes: [{ x: 3, y: 7, kind: 'normal' }],
    });
    s.wrecks.push({ x: 5, y: 7, active: true }, { x: 7, y: 7, active: true });
    expect(aimDirection(s, s.snakes[0]!)).toBeNull();
    expect(targetFor(s, { ...s.snakes[0]!, kind: 'swift' })).toEqual(s.apple);
    step(s, { direction: 'right', dodge: true });
    expect(s.apple).toEqual({ x: 6, y: 7 });
    expect(s.energy).toBe(2);
    advance(s, 300);
    expect(s.snakes[0]!).toMatchObject({ x: 4, y: 6 });
    Object.assign(s.snakes[0]!, {
      x: 4,
      y: 7,
      phase: 'dashing',
      locked: 'right',
      remaining: 3,
      timer: 1,
    });
    step(s, { direction: null });
    expect(s.status).toBe('won');
    expect(s.events).toContainEqual({
      type: 'wall',
      snake: 0,
      x: 5,
      y: 7,
      obstacle: 'wreck',
    });
    expect(s.wrecks).toContainEqual({ x: 4, y: 7, active: true });
  });
  it('同格同时撞毁只留一块残骸，逐格高速冲刺不穿过实心残骸', () => {
    const s = arena({
      snakes: [
        { x: 4, y: 7, kind: 'normal' },
        { x: 4, y: 7, kind: 'swift' },
      ],
    });
    s.wrecks.push({ x: 6, y: 7, active: true });
    for (const snake of s.snakes) {
      Object.assign(snake, {
        phase: 'dashing',
        locked: 'right',
        remaining: 4,
        timer: 1,
      });
      snake.rules.dashMs = 5;
    }
    step(s, { direction: null });
    expect(s.status).toBe('won');
    expect(s.snakes.every((snake) => snake.x === 5 && !snake.alive)).toBe(true);
    expect(s.wrecks.filter((w) => w.x === 5 && w.y === 7)).toHaveLength(1);
  });
  it('第八关正常命令完成借墙→残骸→投掷诱撞接力，不修改对局状态', () => {
    const s = createState(LEVELS[7]!);
    step(s, { direction: 'left', beacon: true });
    advance(s, 1060);
    advance(s, 120, { direction: 'down' });
    advance(s, 240, { direction: 'left' });
    advance(s, 780);
    expect(s.wrecks).toContainEqual({ x: 6, y: 6, active: true });
    expect(s.apple).toEqual({ x: 5, y: 8 });
    step(s, { direction: 'up', beacon: true });
    expect(s.beacon).toMatchObject({ x: 5, y: 6 });
    const events = [];
    for (let t = 0; t < 3000 && s.status === 'playing'; t += TICK_MS) {
      step(s, { direction: null });
      events.push(...s.events);
    }
    expect(s.status).toBe('won');
    expect(events).toContainEqual({
      type: 'wall',
      snake: 1,
      x: 6,
      y: 6,
      obstacle: 'wreck',
    });
  });
});
