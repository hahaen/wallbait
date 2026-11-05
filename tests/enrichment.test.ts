import { describe, expect, it } from 'vitest';
import {
  blocked,
  createState,
  setPaused,
  stars,
  step,
} from '../src/core/engine';
import { LEVELS, validateLevel } from './fixtures/levels';
import type { GameState, Level } from '../src/core/types';

const lab = (extra: Partial<Level> = {}): GameState =>
  createState({
    ...LEVELS[0]!,
    id: 7,
    walls: [],
    apple: { x: 6, y: 10 },
    facing: 'up',
    snakes: [{ x: 2, y: 2, kind: 'normal', delayMs: 100000 }],
    beaconEnabled: true,
    chip: { x: 6, y: 9, title: '测试', memory: '记忆' },
    ...extra,
  });
function advance(s: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(s, { direction: null });
}
function rush(s: GameState, distance: number): void {
  Object.assign(s.snakes[0]!, {
    x: 6,
    y: 10 - distance,
    phase: 'dashing',
    remaining: 4,
    locked: 'down',
    timer: 160,
    attackPath: [
      { x: 6, y: 7 },
      { x: 6, y: 8 },
      { x: 6, y: 9 },
      { x: 6, y: 10 },
      { x: 6, y: 11 },
    ],
  });
}

describe('可选芯片', () => {
  it('普通移动和闪避中间格可拾取，信标与敌人经过不能代取', () => {
    const s = lab();
    step(s, { direction: 'up', dodge: true });
    expect(s.chipCollected).toBe(true);
    expect(s.apple).toEqual({ x: 6, y: 8 });
    expect(s.events.filter((e) => e.type === 'chip')).toHaveLength(1);
    step(s, { direction: 'down' });
    expect(s.events.some((e) => e.type === 'chip')).toBe(false);
    const normal = lab();
    step(normal, { direction: 'up' });
    expect(normal.chipCollected).toBe(true);
    const remote = lab({ chip: { x: 6, y: 8, title: '测试', memory: '记忆' } });
    step(remote, { direction: null, beacon: true });
    expect(remote.chipCollected).toBe(false);
    expect(remote.beacon).toMatchObject({ x: 6, y: 8 });
  });
  it('撞头格不拾取，暂停不收集，重开清空；拾取不改变星级', () => {
    const s = lab();
    setPaused(s, true);
    step(s, { direction: 'up' });
    expect(s.chipCollected).toBe(false);
    setPaused(s, false);
    Object.assign(s.snakes[0]!, { x: 6, y: 9 });
    step(s, { direction: 'up' });
    expect(s.status).toBe('lost');
    expect(s.chipCollected).toBe(false);
    const collected = lab();
    step(collected, { direction: 'up' });
    expect(createState(collected.level).chipCollected).toBe(false);
    const withoutChip = {
      ...collected,
      chipCollected: false,
      status: 'won' as const,
    };
    expect(stars({ ...collected, status: 'won' })).toBe(stars(withoutChip));
  });
  it('拒绝墙、出生、机关重叠、非整数和门隔离的芯片', () => {
    for (const point of [{ x: 0, y: 1 }, LEVELS[6]!.apple, { x: 2.5, y: 10 }])
      expect(
        validateLevel({
          ...LEVELS[6]!,
          chip: { ...point, title: '测试', memory: '记忆' },
        }),
      ).toContain('芯片配置无效');
    const gateLevel = structuredClone(LEVELS[3]!);
    gateLevel.chip = {
      ...gateLevel.gates![0]!.switches[0]!,
      title: '测试',
      memory: '记忆',
    };
    expect(validateLevel(gateLevel)).toContain('芯片配置无效');
    expect(LEVELS.filter((l) => l.chip).map((l) => l.id)).toEqual([7, 11, 18]);
  });
});

describe('精彩操作的实际事件归因', () => {
  it('撞残骸只奖励一次，普通墙不奖励；零闪避只在胜利发放', () => {
    const s = lab({
      snakes: [
        { x: 4, y: 7, kind: 'normal' },
        { x: 4, y: 7, kind: 'swift' },
      ],
    });
    s.wrecks.push({ x: 5, y: 7, active: true });
    for (const snake of s.snakes)
      Object.assign(snake, {
        phase: 'dashing',
        locked: 'right',
        remaining: 3,
        timer: 1,
      });
    step(s, { direction: null });
    expect(s.status).toBe('won');
    expect(s.highlights.map((h) => h.id)).toEqual(['wreck-chain', 'no-dodge']);
    expect(s.events.filter((e) => e.type === 'highlight')).toHaveLength(2);
    advance(s, 2);
    expect(s.events).toEqual([]);
    const lost = lab();
    Object.assign(lost.snakes[0]!, lost.apple);
    step(lost, { direction: null });
    expect(lost.highlights).toEqual([]);
  });
  it('一标双骗按正式锁定的信标编号归因，到期不抹去；不同信标不能合并', () => {
    for (const sameBeacon of [true, false]) {
      const s = lab({
        walls: [
          { x: 5, y: 7 },
          { x: 9, y: 7 },
        ],
        snakes: [
          { x: 4, y: 7, kind: 'normal' },
          { x: 8, y: 7, kind: 'normal', delayMs: 5000 },
        ],
      });
      Object.assign(s.snakes[0]!, {
        phase: 'dashing',
        locked: 'right',
        remaining: 3,
        timer: 1,
        attackBeacon: 1,
      });
      step(s, { direction: null });
      expect(s.highlights).toEqual([]);
      Object.assign(s.snakes[1]!, {
        phase: 'dashing',
        locked: 'right',
        remaining: 3,
        timer: 1,
        attackBeacon: sameBeacon ? 1 : 2,
      });
      step(s, { direction: null });
      expect(s.highlights.some((h) => h.id === 'double-decoy')).toBe(
        sameBeacon,
      );
    }
    // 正式蓄力才记录信标归属；之后信标到期仍保留。
    const locked = lab({
      apple: { x: 8, y: 10 },
      facing: 'left',
      snakes: [{ x: 4, y: 10, kind: 'normal' }],
    });
    step(locked, { direction: null, beacon: true });
    advance(locked, 6);
    expect(locked.snakes[0]!.phase).toBe('dashing');
    expect(locked.snakes[0]!.attackBeacon).toBe(1);
    locked.beacon = null;
    advance(locked, 1);
    expect(locked.snakes[0]!.attackBeacon).toBe(1);
  });
  it('擦肩而过只计算蛇头两格内真实离开且避过冲刺，早走/从未处于通道不计', () => {
    for (const distance of [2, 3]) {
      const s = lab();
      rush(s, distance);
      step(s, { direction: 'right' });
      expect(s.highlights).toEqual([]);
      advance(s, 30);
      expect(s.highlights.some((h) => h.id === 'close-call')).toBe(
        distance === 2,
      );
    }
    const outside = lab({ apple: { x: 7, y: 10 } });
    rush(outside, 2);
    step(outside, { direction: 'right' });
    advance(outside, 30);
    expect(outside.highlights).toEqual([]);
    const back = lab();
    rush(back, 2);
    step(back, { direction: 'right' });
    advance(back, 5);
    step(back, { direction: 'left' });
    advance(back, 30);
    expect(back.status).toBe('lost');
    expect(back.highlights).toEqual([]);
  });
  it('暂停冻结操作记录与规则时间，重开没有前局记录', () => {
    const s = lab();
    rush(s, 2);
    step(s, { direction: 'right' });
    setPaused(s, true);
    const snapshot = structuredClone(s);
    advance(s, 30);
    expect(s).toEqual(snapshot);
    setPaused(s, false);
    advance(s, 30);
    expect(s.highlights[0]?.id).toBe('close-call');
    expect(createState(s.level).highlights).toEqual([]);
  });
});

it.each([11, 18])(
  '第%s关中央残骸封口后右侧绕行仍通，残骸同时形成新撞击点',
  (id) => {
    const s = createState(LEVELS[id - 1]!);
    const y = id === 11 ? 6 : 7;
    s.wrecks.push({ x: 6, y, active: true });
    expect(blocked(s, { x: 6, y })).toBe(true);
    // 静态可达性检查；含敌人时序的可行性另由纯命令回放证明。
    s.apple = { x: 6, y: y + 1 };
    const visited = new Set([`${s.apple.x},${s.apple.y}`]),
      queue = [s.apple];
    for (const p of queue)
      for (const d of [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
      ]) {
        const next = { x: p.x + d.x, y: p.y + d.y },
          key = `${next.x},${next.y}`;
        if (!blocked(s, next) && !visited.has(key)) {
          visited.add(key);
          queue.push(next);
        }
      }
    expect(visited.has(`${s.level.chip!.x},${s.level.chip!.y}`)).toBe(true);
    expect(visited.has(`10,${y + 1}`)).toBe(true);
  },
);
