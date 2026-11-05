import { expect, it } from 'vitest';
import { defaults, readSave, SAVE_KEY, writeSave } from '../src/storage/save';
import type { StoragePort } from '../src/storage/save';

const previousKey = 'wallbait.save.v2';
const legacyKey = 'wallbait.save.v1';
const memory = (entries: Record<string, string> = {}): StoragePort => {
  const data = new Map(Object.entries(entries));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
};

it('默认、损坏、版本不兼容和存储异常都能启动', () => {
  for (const value of ['{bad', 'null', '[]', '{"version":9}'])
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

it('继承旧版设置和无尽纪录，保存后旧键内容原样保留', () => {
  const previous = JSON.stringify({
    version: 2,
    campaign: 'foundry-v2',
    muted: true,
    reducedMotion: true,
    utility: 'magnet',
    endlessBest: { cleared: 6, defeated: 16 },
    best: { 1: { stars: 3, timeMs: 1000, dodges: 0, beacons: 0 } },
    collections: { 7: { chip: true, highlights: ['no-dodge'] } },
  });
  const legacy = JSON.stringify({ version: 1, muted: false });
  const storage = memory({ [previousKey]: previous, [legacyKey]: legacy });
  const save = readSave(storage);
  expect(save).toEqual({
    version: 3,
    muted: true,
    reducedMotion: true,
    endlessBest: { cleared: 6, defeated: 16 },
  });
  expect(storage.getItem(SAVE_KEY)).toBeNull();
  save.muted = false;
  expect(writeSave(storage, save)).toBe(true);
  expect(readSave(storage)).toEqual(save);
  expect(storage.getItem(previousKey)).toBe(previous);
  expect(storage.getItem(legacyKey)).toBe(legacy);
});

it('旧键分别容错，v1 只继承设置', () => {
  const storage = memory({
    [SAVE_KEY]: '{bad',
    [legacyKey]: JSON.stringify({ version: 1, muted: true }),
  });
  const getItem = storage.getItem;
  storage.getItem = (key) => {
    if (key === previousKey) throw Error('previous inaccessible');
    return getItem(key);
  };
  expect(readSave(storage)).toEqual({ ...defaults(), muted: true });
});

it('从旧版读取时忽略不兼容的关卡集、旧装备字段和无效纪录', () => {
  const storage = memory({
    [previousKey]: JSON.stringify({
      version: 2,
      campaign: 'another-campaign',
      muted: true,
    }),
  });
  expect(readSave(storage)).toEqual(defaults());
  storage.setItem(
    previousKey,
    JSON.stringify({
      version: 2,
      campaign: 'foundry-v2',
      utility: 'unknown',
      endlessBest: { cleared: 4, defeated: 2 },
    }),
  );
  expect(readSave(storage)).toEqual(defaults());
});
