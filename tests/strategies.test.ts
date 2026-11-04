import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { LEVELS } from '../src/core/levels';
import { runStrategy, STRATEGIES, STRATEGY_LIMIT_MS } from './strategies';
import type { StrategyId, StrategyResult } from './strategies';

interface StrategyReport {
  id: StrategyId;
  title: string;
  algorithm: string;
  wins: number[];
  advancedWins: number[];
  runs: StrategyResult[];
}
interface Report {
  campaign: 'foundry-v2';
  limitMs: number;
  note: string;
  strategies: StrategyReport[];
}
const file = new URL('./fixtures/strategies.json', import.meta.url);
const generate = process.env.GENERATE_STRATEGIES === '1';
const saved: Report | null = generate
  ? null
  : (JSON.parse(readFileSync(file, 'utf8')) as Report);
const report: Report = {
  campaign: 'foundry-v2',
  limitMs: STRATEGY_LIMIT_MS,
  note: '固定算法的反套路检查，不等于人类难度证明；超时只表示 60 秒内没有胜利。每轮只执行玩家命令，没有设置坐标或敌人状态。',
  strategies: [],
};

it.each(STRATEGIES)('$title：20 关正常操作专项', (definition) => {
  const runs = LEVELS.map((level) => runStrategy(level, definition.id));
  const wins = runs
    .filter((run) => run.status === 'won')
    .map((run) => run.level);
  const result: StrategyReport = {
    ...definition,
    wins,
    advancedWins: wins.filter((level) => level >= 6),
    runs,
  };
  report.strategies.push(result);
  // 基线门槛预先固定，失败时保留真实报告，不通过调整算法掩盖简单解。
  if (definition.id === 'still') expect(wins).toEqual([]);
  expect(result.advancedWins.length).toBeLessThanOrEqual(5);
  if (saved)
    expect(result).toEqual(
      saved.strategies.find((strategy) => strategy.id === definition.id),
    );
});

afterAll(() => {
  if (generate) {
    writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    for (const result of report.strategies)
      console.info(
        `${result.title}: 胜利 [${result.wins.join(', ')}]；第 6–20 关 ${result.advancedWins.length}/15`,
      );
  } else {
    expect(saved?.campaign).toBe(report.campaign);
    expect(saved?.limitMs).toBe(STRATEGY_LIMIT_MS);
    expect(saved?.strategies.map((strategy) => strategy.id)).toEqual(
      STRATEGIES.map((strategy) => strategy.id),
    );
  }
});
