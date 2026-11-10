import type { EndlessScore } from '../core/types';

export const SAVE_KEY = 'wallbait.save.v3';
const PREVIOUS_SAVE_KEY = 'wallbait.save.v2';
const LEGACY_SAVE_KEY = 'wallbait.save.v1';

export interface Save {
  version: 3;
  muted: boolean;
  reducedMotion: boolean;
  endlessBest?: EndlessScore;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const defaults = (): Save => ({
  version: 3,
  muted: false,
  reducedMotion: false,
});
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
function readObject(
  storage: Pick<StoragePort, 'getItem'>,
  key: string,
): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? 'null');
    return record(value) ? value : null;
  } catch {
    return null;
  }
}
function readSettings(save: Save, data: Record<string, unknown>): void {
  save.muted = data.muted === true;
  save.reducedMotion = data.reducedMotion === true;
}
function readEndlessSave(save: Save, data: Record<string, unknown>): Save {
  readSettings(save, data);
  const best = data.endlessBest;
  if (
    record(best) &&
    count(best.cleared, 0) &&
    count(best.defeated, 1) &&
    best.defeated >= best.cleared &&
    best.defeated <= 3 * (best.cleared + 1)
  )
    save.endlessBest = { cleared: best.cleared, defeated: best.defeated };
  return save;
}
export function readSave(storage: Pick<StoragePort, 'getItem'>): Save {
  const save = defaults();
  const current = readObject(storage, SAVE_KEY);
  if (current?.version === 3) return readEndlessSave(save, current);

  // 从旧键继承设置与无尽纪录，普通关卡记录留在原存档。
  const previous = readObject(storage, PREVIOUS_SAVE_KEY);
  if (previous?.version === 2 && previous.campaign === 'foundry-v2')
    return readEndlessSave(save, previous);

  const legacy = readObject(storage, LEGACY_SAVE_KEY);
  if (legacy?.version === 1) readSettings(save, legacy);
  return save;
}
export function writeSave(storage: StoragePort, save: Save): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
// 访问 localStorage 属性本身也可能抛错，因此放在惰性边界内。
export const browserStorage: StoragePort = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
