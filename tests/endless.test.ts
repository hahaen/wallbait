import { describe, expect, it } from 'vitest';
import { RECHARGE_MS, TICK_MS } from '../src/core/config';
import { blocked, routeDistances, setPaused } from '../src/core/engine';
import {
  beatsEndlessScore,
  createEndless,
  ENDLESS_MAP,
  stepEndless,
} from '../src/core/endless';
import { validateLevel } from '../src/core/levels';
import type { GameState, Point, WaveRegion } from '../src/core/types';
import { defaults, readSave, writeSave } from '../src/storage/save';

const idle = { direction: null };
const inRegion = (p: Point, r: WaveRegion): boolean =>
  p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
const tick = (state: GameState, count: number): void => {
  for (let i = 0; i < count; i++) stepEndless(state, idle);
};
const nextWave = (state: GameState): void => {
  // 将存活蛇安排在撞墙前一格，使用真实撞击与波次推进。
  for (const [i, snake] of state.snakes.entries()) {
    if (!snake.alive) continue;
    Object.assign(snake, {
      x: 2 + i * 3,
      y: 1,
      phase: 'dashing',
      locked: 'up',
      timer: 0,
    });
  }
  stepEndless(state, idle);
  tick(state, state.endless!.nextWaveMs / TICK_MS);
};

describe('无尽挑战', () => {
  it('地图尺寸正确，两组闸门任意开合时，所有可走格仍连通', () => {
    expect(ENDLESS_MAP).toMatchObject({ width: 55, height: 61 });
    expect(validateLevel(ENDLESS_MAP)).toEqual([]);
    const state = createEndless(12, 'dodge', 6);
    for (const mask of [0, 1, 2, 3]) {
      state.gates.forEach(
        (gate, i) => (gate.closed = Boolean(mask & (1 << i))),
      );
      const routes = routeDistances(state, state.apple);
      for (let y = 0; y < state.level.height; y++)
        for (let x = 0; x < state.level.width; x++)
          expect(routes[y * state.level.width + x]! >= 0).toBe(
            !blocked(state, { x, y }),
          );
    }
  });

  it('正常诱撞首波后，可以留守或走到另一区接战，波间状态连续', () => {
    const state = createEndless(12, 'dodge', 6);
    const level = state.level;
    const gate = state.gates[0]!;
    gate.closed = true;
    // 首次冲刺结束后，利用苹果下方的石墙，贴墙把信标投到脚下。
    tick(state, 90);
    expect(state.snakes[0]).toMatchObject({
      x: 27,
      y: 29,
      phase: 'recovering',
    });
    stepEndless(state, { direction: 'down', beacon: true });
    expect(state.beacon).toMatchObject({ x: 27, y: 30 });
    stepEndless(state, { direction: 'right', dodge: true });
    for (let i = 0; i < 150 && !state.endless!.nextWaveMs; i++)
      stepEndless(state, idle);
    expect(state.status).toBe('playing');
    expect(state.endless).toMatchObject({
      wave: 1,
      cleared: 1,
      defeated: 1,
      nextWaveMs: 2400,
    });
    expect(state.wrecks).toContainEqual({
      x: 27,
      y: 30,
      active: true,
      wave: 1,
    });

    const choice = state.endless!.waveChoice!;
    const [stayRegion, moveRegion] = choice.regions;
    expect(choice.selected).toBe(0);
    expect(stayRegion).not.toEqual(moveRegion);
    expect(inRegion(state.apple, stayRegion)).toBe(true);

    setPaused(state, true);
    const snapshot = structuredClone(state);
    const gapTicks = snapshot.endless!.nextWaveMs / TICK_MS;
    tick(state, gapTicks + 1);
    expect(state).toEqual(snapshot);
    setPaused(state, false);

    const stay = structuredClone(state);
    tick(stay, gapTicks);
    expect(stay.endless?.wave).toBe(2);
    expect(stay.apple).toEqual(snapshot.apple);
    expect(stay.snakes).toHaveLength(2);
    expect(stay.snakes.every((snake) => inRegion(snake, stayRegion))).toBe(
      true,
    );

    for (let i = 0; i < 32; i++) stepEndless(state, { direction: 'right' });
    expect(choice.selected).toBe(1);
    expect(choice.regions).toEqual(snapshot.endless!.waveChoice!.regions);
    tick(state, gapTicks - 32);
    expect(state.snakes.every((snake) => inRegion(snake, moveRegion))).toBe(
      true,
    );
    expect(state.endless?.waveChoice).toBeUndefined();
    expect(state.level).toBe(level);
    expect(state.apple.x).toBeGreaterThan(snapshot.apple.x);
    expect(state.gates[0]).toBe(gate);
    expect(gate.closed).toBe(true);
    const recharge = snapshot.rechargeMs + gapTicks * TICK_MS;
    expect(state.energy).toBe(
      snapshot.energy + Math.floor(recharge / RECHARGE_MS),
    );
    expect(state.rechargeMs).toBe(recharge % RECHARGE_MS);
    expect(state.wrecks).toContainEqual({
      x: 27,
      y: 30,
      active: true,
      wave: 1,
    });
    expect(state.endless).toMatchObject({
      wave: 2,
      cleared: 1,
      defeated: 1,
      nextWaveMs: 0,
    });
    expect(state.snakes.map((s) => s.kind)).toEqual(['normal', 'swift']);
  });

  it('不同区域能连续安全刷波，种子可重试，旧残骸按波次退场', () => {
    for (const apple of [
      { x: 1, y: 1 },
      { x: 53, y: 59 },
      { x: 36, y: 31 },
      { x: 10, y: 48 },
    ]) {
      const a = createEndless(45, 'magnet', 9);
      const b = createEndless(45, 'magnet', 9);
      for (const state of [a, b]) {
        state.apple = { ...apple };
        state.gates[0]!.closed = apple.x !== 36;
      }
      for (let wave = 2; wave <= 15; wave++) {
        nextWave(a);
        nextWave(b);
        expect(a.endless?.wave).toBe(wave);
        expect(a.endless?.cleared).toBe(wave - 1);
        expect(a.snakes).toEqual(b.snakes);
        expect(a.snakes.length).toBeGreaterThanOrEqual(2);
        expect(a.snakes.length).toBeLessThanOrEqual(3);
        const paths = routeDistances(a, a.apple);
        a.snakes.forEach((snake, i) => {
          expect(
            Math.abs(apple.x - snake.x) + Math.abs(apple.y - snake.y),
          ).toBeGreaterThanOrEqual(6);
          expect(
            paths[snake.y * a.level.width + snake.x],
          ).toBeGreaterThanOrEqual(6);
          expect(snake.timer).toBeGreaterThanOrEqual(900);
          for (const previous of a.snakes.slice(0, i))
            expect(
              Math.abs(previous.x - snake.x) + Math.abs(previous.y - snake.y),
            ).toBeGreaterThanOrEqual(4);
        });
        expect(a.wrecks.every((w) => w.wave! > wave - 3)).toBe(true);
        if (wave < 4) expect(a.wrecks.some((w) => w.wave === 1)).toBe(true);
        if (wave === 4) expect(a.wrecks.some((w) => w.wave === 1)).toBe(false);
      }
    }
  });

  it('同刻被抓与最后一蛇撞墙时按失败结算，不增加完成波数', () => {
    const state = createEndless(10, 'dodge', 6);
    nextWave(state);
    Object.assign(state.snakes[0]!, {
      x: 27,
      y: 29,
      phase: 'dashing',
      locked: 'down',
      timer: 0,
      remaining: 1,
    });
    Object.assign(state.snakes[1]!, {
      x: 3,
      y: 1,
      phase: 'dashing',
      locked: 'up',
      timer: 0,
    });
    stepEndless(state, idle);
    expect(state.status).toBe('lost');
    expect(state.endless).toMatchObject({
      wave: 2,
      cleared: 1,
      defeated: 2,
      nextWaveMs: 0,
    });
    const score = { ...state.endless };
    tick(state, 300);
    expect(state.endless).toEqual(score);
  });

  it('撞墙残骸不会封死边角的最后一条退路', () => {
    const state = createEndless(12, 'dodge', 6);
    state.apple = { x: 1, y: 1 };
    state.wrecks.push({ x: 2, y: 1, active: true, wave: 1 });
    Object.assign(state.snakes[0]!, {
      x: 1,
      y: 2,
      phase: 'dashing',
      locked: 'left',
      timer: 0,
    });
    stepEndless(state, idle);
    expect(state.endless?.cleared).toBe(1);
    expect(state.wrecks).toEqual([{ x: 2, y: 1, active: true, wave: 1 }]);
    expect(blocked(state, { x: 1, y: 2 })).toBe(false);
  });

  it('个人纪录与主线独立保存，按波数、撞毁数比较，并忽略坏值', () => {
    const best = { cleared: 5, defeated: 13 };
    expect(beatsEndlessScore({ cleared: 6, defeated: 12 }, best)).toBe(true);
    expect(beatsEndlessScore({ cleared: 5, defeated: 14 }, best)).toBe(true);
    expect(beatsEndlessScore({ cleared: 5, defeated: 13 }, best)).toBe(false);
    expect(beatsEndlessScore({ cleared: 4, defeated: 15 }, best)).toBe(false);
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    expect(readSave(storage).endlessBest).toBeUndefined();
    expect(writeSave(storage, { ...defaults(), endlessBest: best })).toBe(true);
    expect(readSave(storage)).toMatchObject({
      unlocked: 1,
      best: {},
      endlessBest: best,
    });
    writeSave(storage, {
      ...defaults(),
      endlessBest: { cleared: -1, defeated: 20 },
    });
    expect(readSave(storage).endlessBest).toBeUndefined();
  });
});
