import { expect, it } from 'vitest';
import { createState } from '../src/core/engine';
import { LEVELS } from '../src/core/levels';
import { defaults, readSave, recordWin, writeSave } from '../src/storage/save';
import type { StoragePort } from '../src/storage/save';

const memory = (value: string | null): StoragePort => ({
  getItem: () => value,
  setItem: (_, next) => {
    value = next;
  },
});
it('默认、损坏、版本不兼容和存储异常都能启动', () => {
  for (const value of [
    null,
    '{bad',
    'null',
    '[]',
    '{"version":9}',
    '{"version":1,"best":{"1":{"timeMs":-1,"stars":99}}}',
  ])
    expect(readSave(memory(value))).toEqual(defaults());
  const broken = {
    getItem: () => {
      throw Error('denied');
    },
    setItem: () => {
      throw Error('quota');
    },
  };
  expect(readSave(broken)).toEqual(defaults());
  expect(writeSave(broken, defaults())).toBe(false);
});
it('进度与设置刷新恢复，重玩只提升各项最佳成绩', () => {
  const save = defaults(),
    state = createState(LEVELS[0]!);
  state.status = 'won';
  state.elapsedMs = 5000;
  state.dodges = 2;
  recordWin(save, state);
  state.elapsedMs = 9000;
  state.dodges = 1;
  recordWin(save, state);
  save.muted = true;
  const storage = memory(null);
  expect(writeSave(storage, save)).toBe(true);
  const restored = readSave(storage);
  expect(restored.unlocked).toBe(2);
  expect(restored.muted).toBe(true);
  expect(restored.best['1']).toEqual({ timeMs: 5000, dodges: 1, stars: 3 });
  state.status = 'lost';
  recordWin(save, state);
  expect(save.best['1']).toEqual(restored.best['1']);
});
