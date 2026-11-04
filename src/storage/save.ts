import { LEVELS } from '../core/levels';
import { stars } from '../core/engine';
import type { GameState } from '../core/types';

export const SAVE_KEY = 'wallbait.save.v1';
export interface Best {
  timeMs: number;
  dodges: number;
  stars: number;
}
export interface Save {
  version: 1;
  unlocked: number;
  best: Record<string, Best>;
  muted: boolean;
  reducedMotion: boolean;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const defaults = (): Save => ({
  version: 1,
  unlocked: 1,
  best: {},
  muted: false,
  reducedMotion: false,
});
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
export function readSave(storage: StoragePort): Save {
  const save = defaults();
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SAVE_KEY) ?? 'null');
    if (!record(parsed) || parsed.version !== 1) return save;
    save.muted = parsed.muted === true;
    save.reducedMotion = parsed.reducedMotion === true;
    if (record(parsed.best))
      for (const level of LEVELS) {
        const best = parsed.best[String(level.id)];
        if (
          record(best) &&
          integer(best.timeMs, 20, 86400000) &&
          integer(best.dodges, 0, 100000) &&
          integer(best.stars, 1, 3)
        ) {
          save.best[String(level.id)] = {
            timeMs: best.timeMs,
            dodges: best.dodges,
            stars: best.stars,
          };
        }
      }
    // 解锁由连续通关记录恢复，损坏的 unlocked 不会锁死正常存档。
    while (save.unlocked < LEVELS.length && save.best[String(save.unlocked)])
      save.unlocked++;
  } catch {
    /* 不可用或损坏时使用内存存档，仍可游玩。 */
  }
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
export function recordWin(save: Save, state: GameState): void {
  if (state.status !== 'won') return;
  const key = String(state.level.id),
    previous = save.best[key];
  save.best[key] = {
    timeMs: Math.min(previous?.timeMs ?? Infinity, state.elapsedMs),
    dodges: Math.min(previous?.dodges ?? Infinity, state.dodges),
    stars: Math.max(previous?.stars ?? 0, stars(state)),
  };
  save.unlocked = Math.max(
    save.unlocked,
    Math.min(LEVELS.length, state.level.id + 1),
  );
}
// 访问 localStorage 属性本身也可能抛错，因此放在惰性边界内。
export const browserStorage: StoragePort = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
