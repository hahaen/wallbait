import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createState, step, tacticComplete } from '../src/core/engine';
import { LEVELS } from '../src/core/levels';
import { availableSkills } from '../src/core/loadout';
import { findReplay } from './replay-search';
import type { Replay } from './replay-search';

const file = new URL('./fixtures/skill-solutions.json', import.meta.url);
if (process.env.GENERATE_SKILLS === '1') {
  it('为每种开放搭配与20关战术星生成正常命令方案', () => {
    const selected = process.env.REPLAY_LEVEL
      ? Number(process.env.REPLAY_LEVEL)
      : undefined;
    const replays: (Replay & { goal: 'loadout' | 'tactic' })[] = selected
      ? (
          JSON.parse(readFileSync(file, 'utf8')) as (Replay & {
            goal: 'loadout' | 'tactic';
          })[]
        ).filter((r) => r.level !== selected)
      : [];
    const save = (): void => {
      replays.sort(
        (a, b) =>
          a.level - b.level ||
          (a.goal === b.goal ? 0 : a.goal === 'tactic' ? 1 : -1),
      );
      writeFileSync(file, JSON.stringify(replays, null, 2) + '\n');
    };
    for (const level of LEVELS.filter((l) => !selected || l.id === selected)) {
      for (const utility of availableSkills(level).filter(
        (u) => u !== 'dodge',
      )) {
        process.stdout.write(`搜索 第${level.id}关 ${utility}\n`);
        const useUtility =
          (level.id === 6 && utility === 'pulse') ||
          (level.id === 11 && utility === 'magnet');
        const replay = findReplay(level, { utility, useUtility });
        console.info(`第${level.id}关 ${utility} ${replay.elapsedMs}ms`);
        replays.push({ ...replay, goal: 'loadout' });
        save();
      }
      process.stdout.write(`搜索 第${level.id}关 战术星\n`);
      const replay = findReplay(level, { tactic: true });
      console.info(`第${level.id}关 战术星 ${replay.elapsedMs}ms`);
      replays.push({ ...replay, goal: 'tactic' });
      save();
    }
    writeFileSync(file, JSON.stringify(replays, null, 2) + '\n');
  }, 1200000);
} else {
  it('全部开放搭配均可解，20关战术星可获得，并有实际使用新技能的通关样本', () => {
    const replays = JSON.parse(readFileSync(file, 'utf8')) as (Replay & {
      goal: 'loadout' | 'tactic';
    })[];
    const expected = LEVELS.flatMap((l) => [
      ...availableSkills(l)
        .filter((u) => u !== 'dodge')
        .map((u) => `${l.id}:${u}:loadout`),
      `${l.id}:dodge:tactic`,
    ]);
    expect(
      replays.map((r) => `${r.level}:${r.utility ?? 'dodge'}:${r.goal}`),
    ).toEqual(expected);
    let pulses = 0,
      pushes = 0;
    for (const replay of replays) {
      const s = createState(LEVELS[replay.level - 1]!, replay.utility);
      for (const c of replay.commands)
        for (let i = 0; i < 6; i++)
          step(s, {
            direction: c.direction,
            dodge: i === 0 && c.dodge,
            beacon: i === 0 && c.beacon,
          });
      expect(s.status, `${replay.level}:${replay.utility}:${replay.goal}`).toBe(
        'won',
      );
      expect(s.elapsedMs).toBe(replay.elapsedMs);
      if (replay.goal === 'tactic') expect(tacticComplete(s)).toBe(true);
      if (replay.level === 6 && replay.utility === 'pulse')
        expect(s.pulses).toBeGreaterThan(0);
      if (replay.level === 11 && replay.utility === 'magnet')
        expect(s.pushes).toBeGreaterThan(0);
      pulses += s.pulses;
      pushes += s.pushes;
    }
    expect(pulses).toBeGreaterThan(0);
    expect(pushes).toBeGreaterThan(0);
  });
}
