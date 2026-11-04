import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createState, step } from '../src/core/engine';
import { LEVELS } from '../src/core/levels';
import { findReplay } from './replay-search';
import type { Replay } from './replay-search';

const file = new URL('./fixtures/chip-solutions.json', import.meta.url);
if (process.env.GENERATE_CHIPS === '1') {
  it('搜索拾取芯片并通关的正常命令方案', () => {
    const replays = LEVELS.filter((l) => l.chip).map((level) => {
      const replay = findReplay(level, { chip: true, wreck: level.id === 18 });
      console.info(`第${level.id}关芯片方案 ${replay.elapsedMs}ms`);
      return replay;
    });
    writeFileSync(file, JSON.stringify(replays, null, 2) + '\n');
  }, 300000);
} else {
  it('三条芯片支线均能正常拾取并通关，第18关同时展示残骸接力', () => {
    const replays = JSON.parse(readFileSync(file, 'utf8')) as Replay[];
    expect(replays.map((r) => r.level)).toEqual([7, 11, 18]);
    for (const replay of replays) {
      const s = createState(LEVELS[replay.level - 1]!);
      let wreckHit = false;
      for (const c of replay.commands)
        for (let i = 0; i < 6; i++) {
          step(s, {
            direction: c.direction,
            dodge: i === 0 && c.dodge,
            beacon: i === 0 && c.beacon,
          });
          if (s.events.some((e) => e.type === 'wall' && e.obstacle === 'wreck'))
            wreckHit = true;
        }
      expect(s.status, `第${replay.level}关`).toBe('won');
      expect(s.chipCollected).toBe(true);
      expect(s.elapsedMs).toBe(replay.elapsedMs);
      if (replay.level === 18) expect(wreckHit).toBe(true);
    }
  });
}
