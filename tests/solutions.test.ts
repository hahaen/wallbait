import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createState, step } from '../src/core/engine';
import { LEVELS } from '../src/core/levels';
import { findReplay } from './replay-search';
import type { Replay } from './replay-search';

const file = new URL('./fixtures/solutions.json', import.meta.url);
if (process.env.GENERATE_REPLAYS === '1') {
  it('生成 20 关可复现操作解', () => {
    const solutions = LEVELS.map((level) => {
      const result = findReplay(level);
      console.info(
        `第 ${level.id} 关：${result.elapsedMs}ms / ${result.dodges} 次闪避`,
      );
      return result;
    });
    writeFileSync(file, JSON.stringify(solutions, null, 2) + '\n');
  }, 300000);
} else {
  const replays = JSON.parse(readFileSync(file, 'utf8')) as Replay[];
  it('回放覆盖全部 20 关，不跳关、不缺关', () =>
    expect(replays.map((r) => r.level)).toEqual(LEVELS.map((l) => l.id)));
  it.each(replays)('第 $level 关从正常出生执行操作至胜利', (replay) => {
    const state = createState(LEVELS[replay.level - 1]!);
    for (const command of replay.commands)
      for (let i = 0; i < 6; i++)
        step(state, {
          direction: command.direction,
          dodge: i === 0 && command.dodge,
        });
    expect(state.status).toBe('won');
    expect(state.elapsedMs).toBe(replay.elapsedMs);
    expect(state.dodges).toBe(replay.dodges);
    expect(state.snakes.every((s) => !s.alive)).toBe(true);
  });
}
