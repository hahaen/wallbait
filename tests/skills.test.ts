import { expect, it } from 'vitest';
import {
  createState,
  step,
  setPaused,
  warningPath,
  magnetMove,
  magnetPreview,
  pulseTargets,
  inInterference,
  tacticComplete,
  stars,
} from '../src/core/engine';
import { LEVELS } from '../src/core/levels';
import { availableSkills } from '../src/core/loadout';
import type { GameState, SnakeKind, UtilitySkill } from '../src/core/types';

function arena(
  utility: UtilitySkill = 'dodge',
  kind: SnakeKind = 'normal',
  elite = false,
): GameState {
  return createState(
    {
      ...LEVELS[19]!,
      walls: [],
      gates: [],
      chip: undefined,
      apple: { x: 6, y: 9 },
      snakes: [{ x: 6, y: 7, kind, elite }],
      utilitySkills: ['dodge', 'pulse', 'magnet'],
      tactic: 'first-lure',
    },
    utility,
  );
}
function wait(s: GameState, ms: number): void {
  for (let t = 0; t < ms; t += 20) step(s, { direction: null });
}
it('脉冲按共享电量释放，暂停已锁向攻击600ms，保持路线后继续完整倒计时', () => {
  const s = arena('pulse'),
    enemy = s.snakes[0]!;
  enemy.phase = 'charging';
  enemy.locked = 'down';
  enemy.timer = 760;
  enemy.attackPath = [{ x: enemy.x, y: enemy.y }, ...warningPath(s, enemy)];
  const path = structuredClone(enemy.attackPath);
  step(s, { direction: null, utility: true });
  expect(s.energy).toBe(1);
  expect(s.pulses).toBe(1);
  expect(s.dodges).toBe(0);
  wait(s, 580);
  expect(enemy.stunMs).toBe(0);
  expect(enemy.timer).toBe(760);
  expect(enemy.attackPath).toEqual(path);
  expect(enemy.locked).toBe('down');
  step(s, { direction: null });
  expect(enemy.timer).toBe(740);
  expect(s.status).toBe('playing');
});
it('脉冲不穿墙，斜角至少一条直角通路畅通，无目标不耗电', () => {
  const s = arena('pulse');
  s.level = { ...s.level, walls: [{ x: 6, y: 8 }] };
  expect(pulseTargets(s)).toHaveLength(0);
  step(s, { direction: null, utility: true });
  expect(s.energy).toBe(2);
  Object.assign(s.snakes[0]!, { x: 7, y: 8 });
  s.level = {
    ...s.level,
    walls: [
      { x: 6, y: 8 },
      { x: 7, y: 9 },
    ],
  };
  expect(pulseTargets(s)).toHaveLength(0);
  s.level = { ...s.level, walls: [{ x: 6, y: 8 }] };
  expect(pulseTargets(s)).toHaveLength(1);
});
it('脉冲没有无敌，不能阻止玩家主动走入已暂停的敌头', () => {
  const s = arena('pulse');
  s.apple.y = 8;
  step(s, { direction: 'up', utility: true });
  expect(s.status).toBe('lost');
  expect(s.loss?.kind).toBe('contact');
});
it('磁推共用预览落点，只移动面前实心残骸，不能在正式攻击中改变地形', () => {
  const s = arena('magnet');
  Object.assign(s.snakes[0]!, { x: 2, y: 2, timer: 10000 });
  s.facing = 'up';
  s.wrecks.push({ x: 6, y: 8, active: true });
  expect(magnetMove(s)).toEqual({ from: { x: 6, y: 8 }, to: { x: 6, y: 7 } });
  step(s, { direction: null, utility: true });
  expect(s.wrecks).toEqual([{ x: 6, y: 7, active: true }]);
  expect(s.energy).toBe(1);
  expect(s.pushes).toBe(1);
  s.wrecks[0]!.y = 8;
  s.snakes[0]!.phase = 'charging';
  s.snakes[0]!.timer = 900;
  expect(magnetMove(s)).toBeNull();
  wait(s, 240);
  const energy = s.energy;
  step(s, { direction: null, utility: true });
  expect(s.energy).toBe(energy);
  expect(s.pushes).toBe(1);
});
it('磁推拒绝原因与实际执行一致，无效尝试不消耗电量', () => {
  const s = arena('magnet');
  Object.assign(s.snakes[0]!, { x: 2, y: 2, timer: 10000 });
  s.facing = 'up';
  expect(magnetPreview(s).reason).toBe('no-wreck');
  s.wrecks.push({ x: 6, y: 8, active: true });
  expect(magnetPreview(s).reason).toBeNull();
  s.level = { ...s.level, walls: [{ x: 6, y: 7 }] };
  expect(magnetPreview(s).reason).toBe('occupied');
  s.level = {
    ...s.level,
    walls: [],
    chip: { x: 6, y: 7, title: '芯片', memory: '记忆' },
  };
  expect(magnetPreview(s).reason).toBe('reserved');
  s.snakes[0]!.phase = 'charging';
  expect(magnetPreview(s).reason).toBe('attacking');
  step(s, { direction: null, utility: true });
  expect(s.energy).toBe(2);
  expect(s.pushes).toBe(0);
  expect(s.wrecks[0]).toEqual({ x: 6, y: 8, active: true });
});
it('磁推拒绝被角色、待生效残骸、机关、信标或未收芯片占用的落点', () => {
  for (const obstacle of [
    'head',
    'wreck',
    'gate',
    'switch',
    'beacon',
    'chip',
    'wall',
  ]) {
    const s = arena('magnet');
    s.facing = 'up';
    s.wrecks.push({ x: 6, y: 8, active: true });
    Object.assign(s.snakes[0]!, { x: 2, y: 2 });
    const to = { x: 6, y: 7 };
    if (obstacle === 'head') Object.assign(s.snakes[0]!, to);
    if (obstacle === 'wreck') s.wrecks.push({ ...to, active: false });
    if (obstacle === 'beacon') s.beacon = { ...to, remainingMs: 2200 };
    if (obstacle === 'chip')
      s.level = { ...s.level, chip: { ...to, title: '测试', memory: '记忆' } };
    if (obstacle === 'wall') s.level = { ...s.level, walls: [to] };
    if (obstacle === 'gate' || obstacle === 'switch')
      s.level = {
        ...s.level,
        gates: [
          {
            id: 'A',
            cells: obstacle === 'gate' ? [to] : [{ x: 1, y: 1 }],
            switches: obstacle === 'switch' ? [to] : [{ x: 1, y: 2 }],
            initialClosed: false,
          },
        ],
      };
    expect(magnetMove(s), obstacle).toBeNull();
  }
});
it('双技能按工具、信标顺序消费；一格电时工具优先，失败工具不吞信标', () => {
  const s = arena('pulse');
  s.energy = 1;
  step(s, { direction: null, utility: true, beacon: true });
  expect(s.pulses).toBe(1);
  expect(s.beacon).toBeNull();
  const empty = arena('magnet');
  empty.energy = 1;
  step(empty, { direction: null, utility: true, beacon: true });
  expect(empty.pushes).toBe(0);
  expect(empty.beacons).toBe(1);
});
it('强化冲锋者冲空后300ms调整，再进行完整预警；第二段冲空正常恢复', () => {
  const s = arena('dodge', 'normal', true),
    enemy = s.snakes[0]!;
  Object.assign(enemy, {
    y: 6,
    phase: 'dashing',
    locked: 'down',
    remaining: 1,
    timer: 20,
  });
  step(s, { direction: null });
  expect(enemy.followup).toBe(true);
  expect(enemy.timer).toBe(300);
  wait(s, 300);
  expect(enemy.phase).toBe('charging');
  expect(enemy.timer).toBe(enemy.rules.chargeMs);
  expect(s.events.some((e) => e.type === 'charge')).toBe(true);
  Object.assign(enemy, {
    phase: 'dashing',
    locked: 'left',
    remaining: 1,
    timer: 20,
  });
  step(s, { direction: null });
  expect(enemy.phase).toBe('recovering');
  expect(enemy.followup).toBe(false);
  expect(enemy.timer).toBe(enemy.rules.recoverMs);
});
it('强化冲锋者第一段撞墙即淘汰，不增加血量或产生第二段', () => {
  const s = arena('dodge', 'normal', true),
    enemy = s.snakes[0]!;
  Object.assign(enemy, {
    x: 1,
    y: 2,
    phase: 'dashing',
    locked: 'left',
    remaining: 4,
    timer: 20,
  });
  step(s, { direction: null });
  expect(s.status).toBe('won');
  expect(enemy.alive).toBe(false);
});
it('侧切提前400ms展示落点，结束后仍需完整正式预警；占格会取消侧移', () => {
  for (const occupied of [false, true]) {
    const s = arena('dodge', 'swift', true),
      enemy = s.snakes[0]!;
    Object.assign(enemy, { x: 5, y: 5 });
    s.apple = { x: 6, y: 8 };
    s.facing = 'down';
    step(s, { direction: null });
    expect(enemy.phase).toBe('sidestepping');
    const target = { ...enemy.abilityTarget! };
    wait(s, 380);
    expect(enemy.x).toBe(5);
    expect(enemy.y).toBe(5);
    if (occupied) s.apple = target;
    wait(s, 20);
    expect(enemy.phase).toBe('tracking');
    expect(s.status).toBe('playing');
    expect({ x: enemy.x, y: enemy.y }).toEqual(
      occupied ? { x: 5, y: 5 } : target,
    );
    if (!occupied) {
      wait(s, 120);
      expect(enemy.phase).toBe('charging');
      expect(enemy.timer).toBe(enemy.rules.chargeMs);
    }
  }
});
it('干扰预告600ms后固定落地，场内冻结回充进度但已有电量仍可使用', () => {
  const s = arena('pulse', 'cautious', true),
    enemy = s.snakes[0]!;
  Object.assign(enemy, { y: 4, abilityCooldownMs: 0 });
  s.energy = 1;
  s.rechargeMs = 1000;
  step(s, { direction: null });
  expect(enemy.phase).toBe('interfering');
  expect(s.interference).toHaveLength(0);
  const target = { ...enemy.abilityTarget! };
  wait(s, 600);
  expect(s.interference).toHaveLength(1);
  expect(s.interference[0]).toMatchObject(target);
  expect(inInterference(s)).toBe(true);
  const progress = s.rechargeMs;
  wait(s, 200);
  expect(s.rechargeMs).toBe(progress);
  step(s, { direction: 'right', beacon: true });
  expect(s.beacons).toBe(1);
  expect(s.energy).toBe(0);
  for (let i = 0; i < 7; i++) step(s, { direction: 'right' });
  expect(inInterference(s)).toBe(false);
  expect(s.rechargeMs).toBeGreaterThan(progress);
  enemy.alive = false;
  step(s, { direction: null });
  expect(s.interference).toHaveLength(0);
});
it('暂停冻结敌人技能、脉冲和干扰场；重开清空瞬态并检查可选装备', () => {
  const s = arena('pulse', 'cautious', true);
  s.snakes[0]!.abilityCooldownMs = 0;
  step(s, { direction: null });
  step(s, { direction: null, utility: true });
  s.interference.push({ x: 1, y: 1, snake: 0, remainingMs: 1000 });
  setPaused(s, true);
  const before = structuredClone(s);
  wait(s, 4000);
  expect(s).toEqual(before);
  const reset = createState(s.level, 'pulse');
  expect(reset.pulseMs).toBe(0);
  expect(reset.interference).toEqual([]);
  expect(reset.snakes[0]!.stunMs).toBe(0);
  expect(createState(LEVELS[0]!, 'pulse').utility).toBe('dodge');
  expect(availableSkills(LEVELS[5]!)).toContain('pulse');
  expect(availableSkills(LEVELS[8]!)).toContain('magnet');
});
it('战术星按关卡目标结算，技能使用次数不扣星，失败不发战术星', () => {
  const s = arena();
  s.status = 'won';
  s.charges = 1;
  s.dodges = 99;
  s.pulses = 99;
  expect(stars(s)).toBe(3);
  s.charges = 2;
  expect(stars(s)).toBe(2);
  s.level = { ...s.level, tactic: 'split' };
  s.eliminations = [
    { x: 1, y: 1 },
    { x: 1, y: 1 },
  ];
  expect(tacticComplete(s)).toBe(false);
  s.eliminations[1]!.x = 2;
  expect(tacticComplete(s)).toBe(true);
  s.status = 'lost';
  expect(stars(s)).toBe(0);
  expect(tacticComplete(s)).toBe(false);
});

it('脉冲原点固定在施放格，不随同一步或后续移动改变', () => {
  const s = arena('pulse');
  step(s, { direction: 'right', utility: true });
  expect(s.pulseOrigin).toEqual({ x: 6, y: 9 });
  expect(s.apple).toEqual({ x: 7, y: 9 });
  wait(s, 240);
  expect(s.pulseOrigin).toEqual({ x: 6, y: 9 });
});
