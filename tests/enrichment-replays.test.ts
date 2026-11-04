import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createState, step } from '../src/core/engine';
import { LEVELS } from '../src/core/levels';
import { findReplay } from './replay-search';
import type { Command } from '../src/core/types';
import type { Replay } from './replay-search';

const file = new URL('./fixtures/chip-solutions.json', import.meta.url);
if (process.env.GENERATE_CHIPS === '1') {
  it('搜索拾取芯片并通关的正常命令方案', () => {
    const replays = LEVELS.filter((l) => l.chip).map((level) => {
      // 指定正常走位前奏，把第一只锁向中央短墙；后续仍搜索合法命令。
      const directions =
        level.id === 11
          ? ([
              'left',
              'left',
              'up',
              'up',
              'up',
              'up',
              'right',
              'up',
              'up',
            ] as const)
          : (['up', 'left', 'left', 'up', 'up', 'right', 'up', 'up'] as const);
      const prefix: Command[] =
        level.id === 7
          ? []
          : [
              { direction: 'left', dodge: true },
              ...directions.map((direction) => ({ direction })),
              ...Array.from({ length: level.id === 11 ? 2 : 3 }, () => ({
                direction: null,
              })),
            ];
      if (level.id === 11) {
        // 左侧取芯片后穿过尚未生效的中央口，再经右侧绕路引敌回到残骸侧面。
        prefix.push(
          ...(
            [
              'left',
              'left',
              'left',
              'right',
              'right',
              'right',
              'right',
              'right',
              'right',
              'right',
              'down',
              'down',
              'down',
              'right',
            ] as const
          ).map((direction) => ({ direction })),
          ...Array.from({ length: 19 }, () => ({ direction: null })),
          ...(['left', 'up', 'up', 'up', 'left', 'left'] as const).map(
            (direction) => ({ direction }),
          ),
          ...Array.from({ length: 20 }, () => ({ direction: null })),
        );
      }
      const replay = findReplay(
        level,
        {
          chip: true,
          wreck: level.id !== 7,
          ...(level.id !== 7
            ? { wreckAt: { x: 6, y: level.id === 11 ? 6 : 7 } }
            : {}),
        },
        prefix,
      );
      console.info(`第${level.id}关芯片方案 ${replay.elapsedMs}ms`);
      return replay;
    });
    writeFileSync(file, JSON.stringify(replays, null, 2) + '\n');
  }, 300000);
} else {
  it('三条芯片支线均能正常拾取并通关，11/18同时展示残骸接力', () => {
    const replays = JSON.parse(readFileSync(file, 'utf8')) as Replay[];
    expect(replays.map((r) => r.level)).toEqual([7, 11, 18]);
    for (const replay of replays) {
      const s = createState(LEVELS[replay.level - 1]!);
      let centralHit = false;
      for (const c of replay.commands)
        for (let i = 0; i < 6; i++) {
          step(s, {
            direction: c.direction,
            dodge: i === 0 && c.dodge,
            beacon: i === 0 && c.beacon,
          });
          if (
            s.events.some(
              (e) =>
                e.type === 'wall' &&
                e.obstacle === 'wreck' &&
                e.x === 6 &&
                e.y === (replay.level === 11 ? 6 : 7),
            )
          )
            centralHit = true;
        }
      expect(s.status, `第${replay.level}关`).toBe('won');
      expect(s.chipCollected).toBe(true);
      expect(s.elapsedMs).toBe(replay.elapsedMs);
      if (replay.level !== 7) expect(centralHit).toBe(true);
    }
  });
}
