import { describe, expect, it } from 'vitest';
import { createState, step } from '../src/core/engine';
import { LEVELS } from '../src/core/levels';
import {
  dangerText,
  groupEnemies,
  lossAdvice,
  lossTitle,
} from '../src/game/feedback';

describe('多敌预警与失败归因', () => {
  it('同格敌人与共享预警终点的标签保留全部来源', () => {
    const s = createState({
      ...LEVELS[0]!,
      snakes: [
        { x: 3, y: 4, kind: 'normal' },
        { x: 3, y: 4, kind: 'swift' },
        { x: 8, y: 4, kind: 'cautious' },
      ],
    });
    expect(
      groupEnemies(s.snakes, (enemy) => enemy).map((group) =>
        group.enemies.map((enemy) => enemy.id),
      ),
    ).toEqual([[0, 1], [2]]);
    expect(
      groupEnemies(s.snakes, () => ({ x: 5, y: 4 }))[0]!.enemies.map(
        (enemy) => enemy.id,
      ),
    ).toEqual([0, 1, 2]);
    expect(groupEnemies(s.snakes, () => undefined)).toEqual([]);
  });
  it('失败保留从锁向起点开始的完整冲刺通道', () => {
    const s = createState({
      ...LEVELS[0]!,
      apple: { x: 6, y: 6 },
      snakes: [{ x: 2, y: 6, kind: 'normal' }],
    });
    s.snakes[0]!.timer = 10000;
    for (let i = 0; i < 100 && s.status === 'playing'; i++)
      step(s, { direction: null });
    expect(s.loss?.kind).toBe('dash');
    expect(s.loss?.path).toEqual([2, 3, 4, 5, 6].map((x) => ({ x, y: 6 })));
  });
  it('正在冲刺优先，再按发动时间排序，同类敌人用编号区分', () => {
    const s = createState({
      ...LEVELS[0]!,
      snakes: [
        { x: 2, y: 2, kind: 'normal' },
        { x: 3, y: 2, kind: 'normal' },
        { x: 4, y: 2, kind: 'swift' },
      ],
    });
    Object.assign(s.snakes[0]!, {
      phase: 'charging',
      locked: 'left',
      timer: 700,
    });
    Object.assign(s.snakes[1]!, {
      phase: 'charging',
      locked: 'down',
      timer: 100,
    });
    Object.assign(s.snakes[2]!, {
      phase: 'dashing',
      locked: 'right',
      timer: 200,
    });
    expect(dangerText(s)).toBe(
      '3号截击者冲刺→ · 2号冲锋者蓄力↓ · 1号冲锋者蓄力←',
    );
    s.snakes[2]!.alive = false;
    expect(dangerText(s)).not.toContain('3号');
  });
  it('追踪碰撞保存致命敌人和实际来路，结束后现场不再变化', () => {
    const s = createState({
      ...LEVELS[0]!,
      apple: { x: 6, y: 6 },
      snakes: [{ x: 5, y: 6, kind: 'normal' }],
    });
    s.snakes[0]!.timer = 0;
    step(s, { direction: null });
    expect(s.loss).toEqual({
      enemy: 0,
      kind: 'tracking',
      cell: { x: 6, y: 6 },
      path: [
        { x: 5, y: 6 },
        { x: 6, y: 6 },
      ],
    });
    expect(lossTitle(s)).toBe('1号冲锋者 · 追踪接触');
    expect(lossAdvice(s)).toContain('绕墙');
    const snapshot = structuredClone(s.loss);
    step(s, { direction: 'right', dodge: true });
    expect(s.loss).toEqual(snapshot);
    expect(createState(s.level).loss).toBeNull();
  });
});
