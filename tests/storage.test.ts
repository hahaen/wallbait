import { expect, it } from 'vitest';
import { createState, stars } from '../src/core/engine';
import { LEVELS } from '../src/core/levels';
import {
  CAMPAIGN,
  defaults,
  LEGACY_SAVE_KEY,
  readSave,
  recordWin,
  SAVE_KEY,
  writeSave,
} from '../src/storage/save';
import type { StoragePort } from '../src/storage/save';

const memory = (entries: Record<string, string> = {}): StoragePort => {
  const data = new Map(Object.entries(entries));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
};
it('默认、损坏、版本或关卡集不兼容和存储异常都能启动', () => {
  for (const value of [
    '{bad',
    'null',
    '[]',
    '{"version":9}',
    '{"version":2,"campaign":"another-campaign"}',
    '{"version":2,"campaign":"foundry-v2","best":{"1":{"timeMs":-1,"stars":99}}}',
  ])
    expect(readSave(memory({ [SAVE_KEY]: value }))).toEqual(defaults());
  expect(readSave(memory())).toEqual(defaults());
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
it('新版恢复进度与设置，重玩独立提升用时、两类技能次数和星级', () => {
  const save = defaults(),
    state = createState(LEVELS[0]!);
  state.status = 'won';
  state.elapsedMs = 5000;
  state.dodges = 2;
  state.beacons = 1;
  const firstStars = stars(state);
  recordWin(save, state);
  state.elapsedMs = 9000;
  state.dodges = 1;
  state.beacons = 3;
  const secondStars = stars(state);
  recordWin(save, state);
  save.muted = true;
  save.reducedMotion = true;
  const storage = memory();
  expect(writeSave(storage, save)).toBe(true);
  const restored = readSave(storage);
  expect(restored.unlocked).toBe(2);
  expect(restored.muted).toBe(true);
  expect(restored.reducedMotion).toBe(true);
  expect(restored.best['1']).toEqual({
    timeMs: 5000,
    dodges: 1,
    beacons: 1,
    stars: Math.max(firstStars, secondStars),
    scoring: 'tactics-v1',
  });
  state.status = 'lost';
  recordWin(save, state);
  expect(save.best['1']).toEqual(restored.best['1']);
});
it('迁移只继承设置，旧版原始记录保持逐字不变且不解锁新版', () => {
  const legacy = JSON.stringify({
    version: 1,
    unlocked: 20,
    muted: true,
    reducedMotion: true,
    best: Object.fromEntries(
      LEVELS.map((level) => [
        String(level.id),
        { timeMs: 2000, dodges: 0, stars: 3 },
      ]),
    ),
  });
  const storage = memory({ [LEGACY_SAVE_KEY]: legacy });
  const migrated = readSave(storage);
  expect(migrated).toEqual({
    ...defaults(),
    muted: true,
    reducedMotion: true,
    legacyCompleted: 20,
  });
  expect(storage.getItem(SAVE_KEY)).toBeNull();
  expect(writeSave(storage, migrated)).toBe(true);
  expect(storage.getItem(LEGACY_SAVE_KEY)).toBe(legacy);
  expect(readSave(storage)).toEqual(migrated);
});
it('新版设置优先于旧版，旧版坏数据不污染新版分数', () => {
  const storage = memory({
    [LEGACY_SAVE_KEY]: JSON.stringify({
      version: 1,
      muted: true,
      reducedMotion: true,
      best: { 1: { timeMs: 1000, dodges: 0, stars: 3 }, 2: { stars: 99 } },
    }),
    [SAVE_KEY]: JSON.stringify({
      ...defaults(),
      unlocked: 20,
      best: {
        1: { timeMs: 12000, dodges: 1, beacons: 2, stars: 2 },
        2: { timeMs: 10000, dodges: 0, stars: 3 },
        3: { timeMs: 9000, dodges: 0, beacons: -1, stars: 3 },
        99: { timeMs: 9000, dodges: 0, beacons: 0, stars: 3 },
      },
    }),
  });
  const restored = readSave(storage);
  expect(restored.muted).toBe(false);
  expect(restored.reducedMotion).toBe(false);
  expect(restored.legacyCompleted).toBe(1);
  expect(restored.unlocked).toBe(2);
  expect(restored.best).toEqual({
    1: { timeMs: 12000, dodges: 1, beacons: 2, stars: 2 },
  });
});
it('新版损坏时仍能读取旧设置，单个存储键不可读不影响另一键', () => {
  const legacy = JSON.stringify({ version: 1, muted: true });
  expect(
    readSave(memory({ [SAVE_KEY]: '{bad', [LEGACY_SAVE_KEY]: legacy })),
  ).toEqual({ ...defaults(), muted: true });
  const storage = memory({
    [SAVE_KEY]: JSON.stringify({ ...defaults(), muted: true }),
  });
  const getItem = storage.getItem;
  storage.getItem = (key) => {
    if (key === LEGACY_SAVE_KEY) throw Error('legacy inaccessible');
    return getItem(key);
  };
  expect(readSave(storage)).toEqual({ ...defaults(), muted: true });
});
it('存档明确绑定新版关卡集且写入只使用新版键', () => {
  const writes: string[] = [];
  const storage: StoragePort = {
    getItem: () => null,
    setItem: (key) => {
      writes.push(key);
    },
  };
  expect(defaults().campaign).toBe(CAMPAIGN);
  expect(writeSave(storage, defaults())).toBe(true);
  expect(writes).toEqual([SAVE_KEY]);
});

it('技能偏好校验、历史星级封存与新战术计分独立保存', () => {
  const old = {
    ...defaults(),
    utility: 'unknown',
    best: { 1: { timeMs: 1000, dodges: 0, beacons: 0, stars: 3 } },
  };
  const storage = memory({ [SAVE_KEY]: JSON.stringify(old) });
  const save = readSave(storage);
  expect(save.utility).toBe('dodge');
  expect(save.unlocked).toBe(2);
  expect(save.best['1']!.stars).toBe(3);
  const s = createState(LEVELS[0]!);
  s.status = 'won';
  s.elapsedMs = 20000;
  s.charges = 2;
  recordWin(save, s);
  expect(save.best['1']).toMatchObject({
    timeMs: 20000,
    stars: 1,
    legacyStars: 3,
    scoring: 'tactics-v1',
  });
  save.utility = 'magnet';
  writeSave(storage, save);
  expect(readSave(storage)).toEqual(save);
});
