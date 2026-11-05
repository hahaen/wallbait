import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createState, step } from '../src/core/engine';
import { LEVELS } from './fixtures/levels';
import { findReplay, type Replay } from './replay-search';

const examples = [
  { level: 12, phase: 'sidestepping' },
  { level: 14, phase: 'interfering' },
] as const;
const file = new URL('./fixtures/ability-solutions.json', import.meta.url);
if (process.env.GENERATE_ABILITIES === '1') {
  it('生成实际触发强化能力并通关的合法命令，独立于最快主线路线', () => {
    const replays = examples.map(({ level, phase }) =>
      findReplay(LEVELS[level - 1]!, { ability: phase }),
    );
    writeFileSync(file, JSON.stringify(replays, null, 2) + '\n');
  }, 300000);
} else {
  const replays = JSON.parse(readFileSync(file, 'utf8')) as Replay[];
  it.each(examples)(
    '第$level关实际展示$phase并正常获胜',
    ({ level, phase }) => {
      const replay = replays.find((r) => r.level === level)!;
      const state = createState(LEVELS[level - 1]!);
      let seen = false;
      for (const command of replay.commands) {
        for (let i = 0; i < 6; i++) {
          step(state, {
            direction: command.direction,
            dodge: i === 0 && command.dodge,
            beacon: i === 0 && command.beacon,
          });
          seen ||= state.snakes.some((s) => s.phase === phase);
        }
      }
      expect(seen).toBe(true);
      expect(state.status).toBe('won');
      expect(state.elapsedMs).toBe(replay.elapsedMs);
    },
  );
}
