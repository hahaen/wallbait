import { describe, expect, it } from 'vitest';
import { COOLDOWN_MS, MOVE_MS, TICK_MS } from '../src/core/config';
import { createState, setPaused, stars, step } from '../src/core/engine';
import { LEVELS, validateLevel } from '../src/core/levels';
import type { Command, GameState } from '../src/core/types';

const make = (): GameState =>
  createState({
    ...LEVELS[0]!,
    apple: { x: 6, y: 10 },
    snakes: [{ x: 2, y: 2, kind: 'normal', delayMs: 100000 }],
  });
function ticks(
  s: GameState,
  count: number,
  c: Command = { direction: null },
): void {
  for (let i = 0; i < count; i++) step(s, c);
}
describe('移动与闪避', () => {
  it('首次短按立即移动，松手再按和快速换向不能绕过 120ms 间隔', () => {
    const s = make();
    step(s, { direction: 'right' });
    expect(s.apple).toEqual({ x: 7, y: 10 });
    for (let i = 0; i < 5; i++) step(s, { direction: i % 2 ? null : 'up' });
    expect(s.apple).toEqual({ x: 7, y: 10 });
    step(s, { direction: 'up' });
    expect(s.apple).toEqual({ x: 7, y: 9 });
    ticks(s, 6);
    step(s, { direction: 'left' });
    expect(s.apple).toEqual({ x: 6, y: 9 });
  });
  it('暂停恢复不清除尚未到期的步进间隔', () => {
    const s = make();
    step(s, { direction: 'right' });
    setPaused(s, true);
    ticks(s, 100);
    setPaused(s, false);
    step(s, { direction: 'up' });
    expect(s.apple).toEqual({ x: 7, y: 10 });
  });
  it('按住按间隔四向走、松开停止，不穿外围墙和障碍', () => {
    const s = make();
    ticks(s, MOVE_MS / TICK_MS, { direction: 'right' });
    expect(s.apple).toEqual({ x: 7, y: 10 });
    ticks(s, 12);
    expect(s.apple.x).toBe(7);
    ticks(s, 100, { direction: 'right' });
    expect(s.apple.x).toBe(11);
    s.level = { ...s.level, walls: [{ x: 11, y: 9 }] };
    ticks(s, 10, { direction: 'up' });
    expect(s.apple.y).toBe(10);
  });
  it('按摇杆斜率分配直步与斜步，斜步按距离延长间隔，松手不继续走', () => {
    const s = make();
    const shallow: Command = {
      direction: 'right',
      movement: { x: 1, y: -1 / 3 },
    };
    step(s, shallow);
    expect(s.apple).toEqual({ x: 7, y: 10 });
    ticks(s, MOVE_MS / TICK_MS, shallow);
    expect(s.apple).toEqual({ x: 8, y: 9 });
    expect(s.moveTimer).toBeGreaterThan(MOVE_MS);
    ticks(s, s.moveTimer / TICK_MS, shallow);
    expect(s.apple).toEqual({ x: 9, y: 9 });
    ticks(s, 20);
    expect(s.apple).toEqual({ x: 9, y: 9 });
    expect(s.moveCarry).toBe(0);
  });
  it('斜走遇方墙沿空侧滑动，遇到目标格蛇头立即判负', () => {
    const diagonal: Command = { direction: 'right', movement: { x: 1, y: -1 } };
    const s = make();
    s.level = { ...s.level, walls: [{ x: 7, y: 10 }] };
    step(s, diagonal);
    expect(s.apple).toEqual({ x: 6, y: 9 });
    const b = make();
    Object.assign(b.snakes[0]!, { x: 7, y: 9 });
    step(b, diagonal);
    expect(b.loss).toMatchObject({ kind: 'contact', cell: { x: 7, y: 9 } });
  });
  it('可绕过斜墙切掉的角，仍会被石墙主体挡住', () => {
    const s = createState({ ...LEVELS[0]!, apple: { x: 7, y: 13 } });
    step(s, { direction: 'right', movement: { x: 1, y: -1 } });
    expect(s.apple).toEqual({ x: 8, y: 12 });
    ticks(s, s.moveTimer / TICK_MS, { direction: 'down' });
    expect(s.apple).toEqual({ x: 8, y: 12 });
    const b = createState({
      ...LEVELS[0]!,
      apple: { x: 7, y: 13 },
      wallOutlines: [
        [
          { x: 8, y: 13 },
          { x: 9, y: 13 },
          { x: 9, y: 14 },
          { x: 8, y: 14 },
        ],
      ],
    });
    step(b, { direction: 'right', movement: { x: 1, y: -1 } });
    expect(b.apple).toEqual({ x: 7, y: 12 });
  });
  it('闪避两格、冷却不能连用，当前方向优先且静止沿最后朝向', () => {
    const s = make();
    step(s, { direction: 'left', dodge: true });
    expect(s.apple.x).toBe(4);
    expect(s.cooldownMs).toBe(COOLDOWN_MS);
    step(s, { direction: null, dodge: true });
    expect(s.apple.x).toBe(4);
    expect(s.dodges).toBe(1);
    ticks(s, COOLDOWN_MS / TICK_MS);
    step(s, { direction: null, dodge: true });
    expect(s.apple.x).toBe(2);
  });
  it('首格被挡不耗技能，途中被挡只走到墙前', () => {
    const s = make();
    s.apple.x = 1;
    step(s, { direction: 'left', dodge: true });
    expect(s.cooldownMs).toBe(0);
    s.apple.x = 2;
    step(s, { direction: 'left', dodge: true });
    expect(s.apple.x).toBe(1);
    expect(s.dodges).toBe(1);
  });
  it('闪避没有无敌，不能穿越路径中的蛇头', () => {
    const s = make();
    s.snakes[0]!.x = 7;
    s.snakes[0]!.y = 10;
    step(s, { direction: 'right', dodge: true });
    expect(s.status).toBe('lost');
    expect(s.apple.x).toBe(7);
    expect(s.loss).toMatchObject({
      enemy: 0,
      kind: 'contact',
      cell: { x: 7, y: 10 },
    });
  });
});
describe('状态机与碰撞', () => {
  it.each(['normal', 'swift', 'cautious'] as const)(
    '%s 对齐后直接冲刺，苹果改行后仍保持原方向',
    (kind) => {
      const s = createState({
        ...LEVELS[1]!,
        apple: { x: 7, y: 7 },
        facing: 'left',
        snakes: [{ x: 3, y: 7, kind }],
      });
      ticks(s, 15);
      const snake = s.snakes[0]!;
      expect(snake.phase).toBe('dashing');
      expect(snake.locked).toBe('right');
      ticks(s, 12, { direction: 'up' });
      const y = snake.y;
      ticks(s, 2);
      expect(snake.y).toBe(y);
      expect(snake.locked).toBe('right');
      expect(snake.x).toBeGreaterThan(3);
    },
  );
  it('冲刺逐格检查，中间蛇头碰苹果判负', () => {
    const s = make(),
      snake = s.snakes[0]!;
    s.apple = { x: 6, y: 5 };
    Object.assign(snake, {
      x: 4,
      y: 5,
      phase: 'dashing',
      locked: 'right',
      timer: 1,
      remaining: 10,
    });
    snake.rules.dashMs = 5;
    step(s, { direction: null });
    expect(s.status).toBe('lost');
    expect(snake.x).toBe(6);
    expect(s.loss).toMatchObject({
      enemy: 0,
      kind: 'dash',
      cell: { x: 6, y: 5 },
    });
    expect(s.loss!.path).toContainEqual({ x: 5, y: 5 });
    expect(s.loss!.path).toContainEqual({ x: 6, y: 5 });
  });
  it('冲刺逐格撞实心墙，不穿墙；追踪遇墙绕路', () => {
    const s = make(),
      snake = s.snakes[0]!;
    s.level = { ...s.level, walls: [{ x: 5, y: 5 }] };
    Object.assign(snake, {
      x: 4,
      y: 5,
      phase: 'dashing',
      locked: 'right',
      timer: 1,
      remaining: 10,
    });
    snake.rules.dashMs = 5;
    step(s, { direction: null });
    expect(s.status).toBe('won');
    expect(snake.x).toBe(4);
    const b = make();
    b.level = { ...b.level, walls: [{ x: 2, y: 3 }] };
    Object.assign(b.snakes[0]!, { phase: 'tracking', timer: 0 });
    ticks(b, 10);
    expect(b.snakes[0]!.alive).toBe(true);
    expect(b.snakes[0]!.x).not.toBe(2);
  });
  it('冲空进入恢复，再继续追踪', () => {
    const s = make(),
      snake = s.snakes[0]!;
    Object.assign(snake, {
      phase: 'dashing',
      locked: 'right',
      timer: 20,
      remaining: 1,
    });
    step(s, { direction: null });
    expect(snake.phase).toBe('recovering');
    ticks(s, snake.rules.recoverMs / TICK_MS);
    expect(snake.phase).toBe('tracking');
  });
  it('处理换位穿越和同格相遇', () => {
    for (const target of [7, 8]) {
      const s = make(),
        snake = s.snakes[0]!;
      Object.assign(snake, {
        x: target,
        y: 10,
        phase: 'dashing',
        locked: 'left',
        timer: 20,
        remaining: 10,
      });
      s.moveTimer = 20;
      step(s, { direction: 'right' });
      expect(s.status).toBe('lost');
    }
  });
  it('蛇身不伤苹果，蛇之间不相互淘汰', () => {
    const s = make();
    s.snakes[0]!.body = [{ x: 7, y: 10 }];
    step(s, { direction: 'right', dodge: true });
    expect(s.status).toBe('playing');
    const a = s.snakes[0]!;
    Object.assign(a, {
      x: 3,
      y: 4,
      phase: 'dashing',
      locked: 'right',
      timer: 20,
      remaining: 9,
    });
    s.snakes.push({
      ...a,
      id: 1,
      x: 5,
      locked: 'left',
      body: [],
      rules: { ...a.rules },
    });
    step(s, { direction: null });
    expect(s.snakes.every((v) => v.alive)).toBe(true);
    expect(s.snakes.map((v) => v.x)).toEqual([4, 4]);
  });
  it('部分蛇撞墙不结束；同刻另一蛇命中优先判负；结算只一次', () => {
    const s = make(),
      a = s.snakes[0]!;
    Object.assign(a, {
      x: 1,
      y: 5,
      phase: 'dashing',
      locked: 'left',
      timer: 20,
      remaining: 9,
    });
    s.snakes.push({
      ...a,
      id: 1,
      x: 5,
      y: 10,
      locked: 'right',
      body: [],
      rules: { ...a.rules },
    });
    step(s, { direction: null });
    expect(s.status).toBe('lost');
    expect(s.events.filter((e) => e.type === 'lost')).toHaveLength(1);
    const elapsed = s.elapsedMs;
    step(s, { direction: null });
    expect(s.events).toEqual([]);
    expect(s.elapsedMs).toBe(elapsed);
    const b = make();
    b.snakes.push({
      ...b.snakes[0]!,
      id: 1,
      x: 1,
      y: 5,
      phase: 'dashing',
      locked: 'left',
      timer: 20,
      remaining: 9,
    });
    step(b, { direction: null });
    expect(b.status).toBe('playing');
    expect(b.snakes.filter((v) => v.alive)).toHaveLength(1);
    b.snakes[0]!.alive = false;
    step(b, { direction: null });
    expect(b.status).toBe('won');
  });
});
describe('生命周期与关卡', () => {
  it('暂停冻结冷却、时间、蛇阶段；重开无旧状态引用', () => {
    const s = make();
    step(s, { direction: 'up', dodge: true });
    setPaused(s, true);
    const snapshot = structuredClone(s);
    ticks(s, 200, { direction: 'right', dodge: true });
    expect(s).toEqual(snapshot);
    setPaused(s, false);
    step(s, { direction: null });
    expect(s.elapsedMs).toBe(snapshot.elapsedMs + TICK_MS);
    const fresh = createState(s.level);
    expect(fresh.dodges).toBe(0);
    expect(fresh.elapsedMs).toBe(0);
    expect(fresh.apple).toEqual(s.level.apple);
    expect(fresh.snakes[0]).not.toBe(s.snakes[0]);
  });
  it('星级：通关一星，达标时间和战术目标各加一星', () => {
    const s = make();
    expect(stars(s)).toBe(0);
    s.status = 'won';
    expect(stars(s)).toBe(3);
    s.elapsedMs = s.level.parMs + 1;
    expect(stars(s)).toBe(2);
    s.dodges = 99;
    expect(stars(s)).toBe(2);
    s.charges = 2;
    expect(stars(s)).toBe(1);
  });
  it('20 关编号连续、地图合法、布局及组合有差异', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    for (const l of LEVELS) expect(validateLevel(l), l.name).toEqual([]);
  });
  it.each(LEVELS)('$id $name 不操作不会自行送胜，开局有反应时间', (l) => {
    const s = createState(l);
    ticks(s, 30);
    expect(s.status).toBe('playing');
    ticks(s, 3000);
    expect(s.status).not.toBe('won');
  });
});

it('对齐后直接冲刺，不经过蓄力或预警阶段；途中走位不能改变冲刺方向', () => {
  const s = createState({
    ...LEVELS[1]!,
    walls: [],
    apple: { x: 8, y: 8 },
    snakes: [{ x: 4, y: 8, kind: 'normal' }],
  });
  const phases = new Set<string>();
  let launched = false;
  for (let i = 0; i < 30 && !launched; i++) {
    step(s, { direction: null });
    phases.add(s.snakes[0]!.phase);
    launched = s.events.some((e) => e.type === 'dash');
  }
  expect(launched).toBe(true);
  expect([...phases]).toEqual(['tracking', 'dashing']);
  const enemy = s.snakes[0]!;
  const before = { x: enemy.x, y: enemy.y };
  for (let i = 0; i < enemy.rules.dashMs / TICK_MS; i++)
    step(s, { direction: 'up' });
  expect(enemy.x).toBe(before.x + 1);
  expect(enemy.y).toBe(before.y);
  expect(enemy.locked).toBe('right');
});
