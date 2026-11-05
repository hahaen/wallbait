import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createState, step } from '../src/core/engine';
import { availableSkills, SKILLS, TACTICS } from '../src/core/loadout';
import { LEVELS } from './fixtures/levels';
import type { Command, Direction, Point } from '../src/core/types';
import type { Replay } from './replay-search';

const replayFile = new URL('./fixtures/solutions.json', import.meta.url);
const reportFile = new URL(
  '../docs/testing/replay-metrics.json',
  import.meta.url,
);
const documentFile = new URL('../docs/levels.md', import.meta.url);
const replays = JSON.parse(readFileSync(replayFile, 'utf8')) as Replay[];
const directionText: Record<Direction, string> = {
  up: '上',
  right: '右',
  down: '下',
  left: '左',
};
const kindText = { normal: '冲锋蛇', swift: '截击蛇', cautious: '侦察蛇' };
const seconds = (ms: number): string => (ms / 1000).toFixed(2);

interface Metrics {
  level: number;
  name: string;
  status: string;
  elapsedMs: number;
  dodges: number;
  beacons: number;
  chipCollected: boolean;
  highlights: string[];
  movedCells: number;
  inputTurns: number;
  overlapMs: number;
  abilities: { atMs: number; enemy: number; kind: string }[];
  charges: { atMs: number; enemy: number; direction: Direction }[];
  eliminations: {
    atMs: number;
    enemy: number;
    wall: Point;
    obstacle: 'wall' | 'wreck';
  }[];
  wreckActivations: { atMs: number; position: Point }[];
  gateChanges: { atMs: number; gate: string; closed: boolean }[];
  beaconPlacements: { atMs: number; position: Point }[];
}

/** 只读 tick 前后快照与事件；推进只通过真实 Command，不修改规则状态。 */
function measure(replay: Replay): Metrics {
  const state = createState(LEVELS[replay.level - 1]!);
  const result: Metrics = {
    level: replay.level,
    name: state.level.name,
    status: state.status,
    elapsedMs: 0,
    dodges: 0,
    beacons: 0,
    chipCollected: false,
    highlights: [],
    movedCells: 0,
    inputTurns: 0,
    overlapMs: 0,
    abilities: [],
    charges: [],
    eliminations: [],
    wreckActivations: [],
    gateChanges: [],
    beaconPlacements: [],
  };
  let previousDirection: Direction | null = null;
  for (const command of replay.commands) {
    if (state.status !== 'playing') break;
    if (command.direction) {
      if (previousDirection && previousDirection !== command.direction)
        result.inputTurns++;
      previousDirection = command.direction;
    }
    for (let i = 0; i < 6 && state.status === 'playing'; i++) {
      const before = {
        apple: { ...state.apple },
        beacons: state.beacons,
        phases: state.snakes.map((s) => s.phase),
        wrecks: state.wrecks
          .filter((w) => w.active)
          .map((w) => `${w.x},${w.y}`),
        gates: state.gates.map((gate) => ({
          id: gate.id,
          closed: gate.closed,
        })),
      };
      step(state, {
        direction: command.direction,
        dodge: i === 0 && command.dodge,
        beacon: i === 0 && command.beacon,
      });
      result.movedCells +=
        Math.abs(state.apple.x - before.apple.x) +
        Math.abs(state.apple.y - before.apple.y);
      if (
        state.snakes.filter((s) => s.alive && s.phase === 'dashing').length >= 2
      )
        result.overlapMs += 20;
      for (const wreck of state.wrecks)
        if (wreck.active && !before.wrecks.includes(`${wreck.x},${wreck.y}`))
          result.wreckActivations.push({
            atMs: state.elapsedMs,
            position: { x: wreck.x, y: wreck.y },
          });
      for (const snake of state.snakes)
        if (
          (snake.phase === 'sidestepping' || snake.phase === 'interfering') &&
          before.phases[snake.id] !== snake.phase
        )
          result.abilities.push({
            atMs: state.elapsedMs,
            enemy: snake.id + 1,
            kind: snake.phase === 'sidestepping' ? '侧切预告' : '干扰预告',
          });
      for (const event of state.events) {
        if (
          event.type === 'dash' &&
          state.snakes[event.snake]!.kind === 'normal' &&
          state.snakes[event.snake]!.followup
        )
          result.abilities.push({
            atMs: state.elapsedMs,
            enemy: event.snake + 1,
            kind: '二段冲刺',
          });
        if (event.type === 'dash')
          result.charges.push({
            atMs: state.elapsedMs,
            enemy: event.snake + 1,
            direction: state.snakes[event.snake]!.locked,
          });
        if (event.type === 'wall')
          result.eliminations.push({
            atMs: state.elapsedMs,
            enemy: event.snake + 1,
            wall: { x: event.x, y: event.y },
            obstacle: event.obstacle,
          });
      }
      for (const gate of state.gates)
        if (before.gates.find((g) => g.id === gate.id)?.closed !== gate.closed)
          result.gateChanges.push({
            atMs: state.elapsedMs,
            gate: gate.id,
            closed: gate.closed,
          });
      if (state.beacons > before.beacons && state.beacon)
        result.beaconPlacements.push({
          atMs: state.elapsedMs,
          position: { x: state.beacon.x, y: state.beacon.y },
        });
    }
  }
  result.status = state.status;
  result.elapsedMs = state.elapsedMs;
  result.dodges = state.dodges;
  result.beacons = state.beacons;
  result.chipCollected = state.chipCollected;
  result.highlights = state.highlights.map((h) => h.id);
  return result;
}

function commandPlan(commands: Command[]): string {
  const groups: { text: string; count: number; skill: boolean }[] = [];
  for (const command of commands) {
    const text = `${command.direction ? directionText[command.direction] : '停'}${command.dodge ? '+闪避' : ''}${command.beacon ? '+信标' : ''}`;
    const skill = Boolean(command.dodge || command.beacon);
    const last = groups.at(-1);
    if (!skill && last && !last.skill && last.text === text) last.count++;
    else groups.push({ text, count: 1, skill });
  }
  return groups
    .map((group) => `${group.text}${group.count > 1 ? `×${group.count}` : ''}`)
    .join(' → ');
}

function document(metrics: Metrics[]): string {
  const lines = [
    '# 20 关设计与可复现通关方案',
    '',
    '以下是已退出游戏的普通关卡，仅用于规则回归。本文件由 [回放报告器](../tests/replay-report.test.ts) 读取 [关卡配置](../tests/fixtures/levels.ts) 与 [命令文件](../tests/fixtures/solutions.json) 生成。四章各五关，地图为 13 × 15 格；名字、设计意图、决策和失败原因以关卡配置为准。',
    '',
    '以下是自动搜索得到的高效可行解，不是人类首玩成绩，也不是最优解证明。正常出生后只发送玩家命令，从不修改坐标、敌人状态或胜负。回放证明可解；难度与手感由实际试玩另行判断，结果见 [验收记录](testing/README.md)。',
    '',
    '## 如何精确复现',
    '',
    '- 每个基本段持续 **0.12 秒**，内部执行六个 20ms 规则步。`右×2` 表示连续两个向右段（0.24 秒），`停×3` 表示停止三个段（0.36 秒）。',
    '- `左+闪避`、`停+信标` 等带技能段也只持续 0.12 秒，**技能仅在该段第一个 20ms 步发送一次**；方向保持整个段。带技能段从不与普通方向段合并。',
    '- `停` 只释放移动方向，不重置角色朝向。剩余动作在胜利后不会再推进，因此总段时长可略大于记录的通关时间。',
    '- 逐段列表可交给命令执行器精确重放。浏览器真人操作无需追求毫秒同步；这些列表不作为首玩教学提示。',
    '',
    '## 回放统计',
    '',
    '锁向次数统计实际 `dash` 事件；门变化只计实际开闭变化，不把待执行请求算成已切门。移动格数为逐 tick 实际位移累计，包含闪避；输入转向只计相邻非空方向改变，停顿不重置计数。完整事件时间、撞击格及信标落点保存在 [JSON 报告](testing/replay-metrics.json)。多敌攻击重叠统计至少两名存活敌人同时处于冲刺的规则时间；撞残骸按淘汰事件来源统计。这些指标描述动作结构，不能直接等同于独立策略决策次数。',
    '',
    '| 关 | 名称 | 用时 | 闪避 / 信标 | 锁向 | 门变化 | 移动格 | 输入转向 | 多敌攻击重叠 | 撞残骸 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const m of metrics)
    lines.push(
      `| ${m.level} | ${m.name} | ${seconds(m.elapsedMs)}s | ${m.dodges} / ${m.beacons} | ${m.charges.length} | ${m.gateChanges.length} | ${m.movedCells} | ${m.inputTurns} | ${seconds(m.overlapMs)}s | ${m.eliminations.filter((e) => e.obstacle === 'wreck').length} |`,
    );
  for (let chapter = 0; chapter < 4; chapter++) {
    lines.push('', `## 第 ${chapter + 1} 章 · ${LEVELS[chapter * 5]!.chapter}`);
    for (const level of LEVELS.slice(chapter * 5, chapter * 5 + 5)) {
      const replay = replays.find((r) => r.level === level.id)!;
      const m = metrics.find((r) => r.level === level.id)!;
      lines.push(
        '',
        `### ${String(level.id).padStart(2, '0')} · ${level.name}`,
        '',
        `敌人：${level.snakes.map((s, i) => `${i + 1}号${s.elite ? '强化' : ''}${kindText[s.kind]}`).join('、')}。机关：${level.gates?.length ? level.gates.map((g) => `${g.id}门（初始${g.initialClosed ? '关闭' : '打开'}）`).join('、') : '无闸门'}。${level.beaconEnabled ? '信标已启用。' : '信标未启用。'}`,
        '',
        `**装备与战术：** 工具可选${availableSkills(level)
          .map((id) => SKILLS[id].name)
          .join(
            '、',
          )}，信标${level.beaconEnabled ? '启用' : '未启用'}；战术星：${TACTICS[level.tactic ?? 'first-lure']}。`,
        '',
        `**设计意图：** ${level.intent}`,
        ...(level.chip
          ? [
              '',
              `**可选芯片：** (${level.chip.x},${level.chip.y})，拾取并通关后归档；主线回放${m.chipCollected ? '已收集' : '未收集'}。完整支线命令见 [芯片回放](../tests/fixtures/chip-solutions.json)。`,
            ]
          : []),
        '',
        `**主要决策：** ${level.decision}`,
        '',
        `**失败原因：** ${level.failure}`,
        '',
        `**可复现获胜方案：** ${commandPlan(replay.commands)}`,
        '',
        `**强化能力：** ${m.abilities.length ? m.abilities.map((a) => `${seconds(a.atMs)}s ${a.enemy}号${a.kind}`).join('、') : '该条回放未触发；不代表关卡没有强化能力'}。`,
        '',
        `**事件证据：** ${m.eliminations.map((e) => `${e.enemy}号在 ${seconds(e.atMs)}s 撞上${e.obstacle === 'wreck' ? '残骸' : '墙/门'} (${e.wall.x},${e.wall.y})`).join('；')}。${m.gateChanges.length ? `实际切门：${m.gateChanges.map((g) => `${seconds(g.atMs)}s ${g.gate}${g.closed ? '关' : '开'}`).join('、')}。` : ''}${m.beaconPlacements.length ? `信标：${m.beaconPlacements.map((b) => `${seconds(b.atMs)}s 投于 (${b.position.x},${b.position.y})`).join('、')}。` : ''}`,
      );
    }
  }
  lines.push(
    '',
    '## 更新与复验',
    '',
    '规则、关卡或命令文件变更后，按“修改 → 评审 → 验证”执行；生成新报告不能代替评审或实际试玩。',
    '',
    '```sh',
    '# 在评审通过后，重放并更新本页及 JSON 事件证据：',
    'REPORT_REPLAYS=1 npx vitest run tests/replay-report.test.ts',
    '# 常规测试会重新计算统计并确认 JSON 证据没有过期：',
    'npm test',
    '```',
    '',
  );
  return lines.join('\n');
}

it('逐关纯命令回放与设计报告保持一致', () => {
  expect(replays.map((r) => r.level)).toEqual(LEVELS.map((l) => l.id));
  const metrics = replays.map(measure);
  expect(
    metrics
      .find((m) => m.level === 8)!
      .eliminations.some((e) => e.obstacle === 'wreck'),
  ).toBe(true);
  expect(metrics.find((m) => m.level === 15)!.overlapMs).toBeGreaterThan(0);
  for (const [index, report] of metrics.entries()) {
    const replay = replays[index]!;
    expect(report.status, `第 ${report.level} 关`).toBe('won');
    expect(report.elapsedMs).toBe(replay.elapsedMs);
    expect(report.dodges).toBe(replay.dodges);
    expect(report.beacons).toBe(replay.beacons);
    expect(report.eliminations).toHaveLength(
      LEVELS[report.level - 1]!.snakes.length,
    );
  }
  if (process.env.REPORT_REPLAYS === '1') {
    writeFileSync(reportFile, `${JSON.stringify(metrics, null, 2)}\n`);
    writeFileSync(documentFile, document(metrics));
    console.info(
      metrics.map((m) => ({
        level: m.level,
        ms: m.elapsedMs,
        charges: m.charges.length,
        kills: m.eliminations.map((e) => e.atMs),
        gates: m.gateChanges.length,
        beacons: m.beacons,
        cells: m.movedCells,
        turns: m.inputTurns,
      })),
    );
  } else expect(JSON.parse(readFileSync(reportFile, 'utf8'))).toEqual(metrics);
});
