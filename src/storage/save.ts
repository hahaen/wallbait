import { LEVELS } from '../core/levels';
import { stars } from '../core/engine';
import { HIGHLIGHTS } from '../core/highlights';
import type { GameState, HighlightId, UtilitySkill } from '../core/types';

export const SAVE_KEY = 'wallbait.save.v2';
export const LEGACY_SAVE_KEY = 'wallbait.save.v1';
export const CAMPAIGN = 'foundry-v2';
export interface Best {
  timeMs: number;
  dodges: number;
  beacons: number;
  stars: number;
  scoring?: 'tactics-v1';
  legacyStars?: number;
}
export interface Save {
  version: 2;
  campaign: typeof CAMPAIGN;
  unlocked: number;
  best: Record<string, Best>;
  collections: Record<string, { chip: boolean; highlights: HighlightId[] }>;
  muted: boolean;
  reducedMotion: boolean;
  legacyCompleted: number;
  utility: UtilitySkill;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const defaults = (): Save => ({
  version: 2,
  campaign: CAMPAIGN,
  unlocked: 1,
  best: {},
  collections: {},
  muted: false,
  reducedMotion: false,
  legacyCompleted: 0,
  utility: 'dodge',
});
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
function readObject(
  storage: StoragePort,
  key: string,
): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? 'null');
    return record(value) ? value : null;
  } catch {
    return null;
  }
}
function validLegacyBest(
  value: unknown,
): value is Pick<Best, 'timeMs' | 'dodges' | 'stars'> &
  Record<string, unknown> {
  return (
    record(value) &&
    integer(value.timeMs, 20, 86400000) &&
    integer(value.dodges, 0, 100000) &&
    integer(value.stars, 1, 3)
  );
}
export function readSave(storage: StoragePort): Save {
  const save = defaults();
  // 只读旧键，不覆盖、不删除；旧版成绩不能用于新关卡解锁或评分。
  const legacy = readObject(storage, LEGACY_SAVE_KEY);
  if (legacy?.version === 1) {
    save.muted = legacy.muted === true;
    save.reducedMotion = legacy.reducedMotion === true;
    if (record(legacy.best)) {
      const legacyBest = legacy.best;
      save.legacyCompleted = LEVELS.filter((level) =>
        validLegacyBest(legacyBest[String(level.id)]),
      ).length;
    }
  }
  const parsed = readObject(storage, SAVE_KEY);
  if (parsed?.version === 2 && parsed.campaign === CAMPAIGN) {
    if (parsed.utility === 'pulse' || parsed.utility === 'magnet')
      save.utility = parsed.utility;
    save.muted = parsed.muted === true;
    save.reducedMotion = parsed.reducedMotion === true;
    if (integer(parsed.legacyCompleted, 0, LEVELS.length))
      save.legacyCompleted = Math.max(
        save.legacyCompleted,
        parsed.legacyCompleted,
      );
    if (record(parsed.best))
      for (const level of LEVELS) {
        const best = parsed.best[String(level.id)];
        if (validLegacyBest(best) && integer(best.beacons, 0, 100000)) {
          save.best[String(level.id)] = {
            timeMs: best.timeMs,
            dodges: best.dodges,
            beacons: best.beacons,
            stars: best.stars,
            ...(best.scoring === 'tactics-v1'
              ? { scoring: 'tactics-v1' as const }
              : {}),
            ...(integer(best.legacyStars, 1, 3)
              ? { legacyStars: best.legacyStars }
              : {}),
          };
        }
      }
    if (record(parsed.collections))
      for (const level of LEVELS) {
        const entry = parsed.collections[String(level.id)];
        if (!save.best[String(level.id)] || !record(entry)) continue;
        const ids = entry.highlights;
        const highlights = Array.isArray(ids)
          ? Object.keys(HIGHLIGHTS).filter((id): id is HighlightId =>
              ids.includes(id),
            )
          : [];
        const chip = Boolean(level.chip && entry.chip === true);
        if (chip || highlights.length)
          save.collections[String(level.id)] = { chip, highlights };
      }
    // 解锁由连续通关记录恢复，损坏的 unlocked 不会锁死正常存档。
    while (save.unlocked < LEVELS.length && save.best[String(save.unlocked)])
      save.unlocked++;
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
    old = save.best[key],
    previous = old?.scoring === 'tactics-v1' ? old : undefined;
  save.best[key] = {
    timeMs: Math.min(previous?.timeMs ?? Infinity, state.elapsedMs),
    dodges: Math.min(previous?.dodges ?? Infinity, state.dodges),
    beacons: Math.min(previous?.beacons ?? Infinity, state.beacons),
    stars: Math.max(previous?.stars ?? 0, stars(state)),
    scoring: 'tactics-v1',
    ...((old?.legacyStars ?? (old?.scoring ? undefined : old?.stars))
      ? { legacyStars: old?.legacyStars ?? old?.stars }
      : {}),
  };
  const collected = save.collections[key];
  const highlights = [
    ...new Set([
      ...(collected?.highlights ?? []),
      ...state.highlights.map((h) => h.id),
    ]),
  ];
  const chip = Boolean(
    state.level.chip && (collected?.chip || state.chipCollected),
  );
  if (chip || highlights.length) save.collections[key] = { chip, highlights };
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
