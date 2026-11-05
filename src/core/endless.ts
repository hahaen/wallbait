import { TICK_MS } from './config';
import { createState, routeDistances, same, spawnSnakes, step } from './engine';
import type {
  Command,
  EndlessScore,
  GameState,
  Level,
  Point,
  SnakeKind,
  Spawn,
  UtilitySkill,
} from './types';

export const ENDLESS_UNLOCK = 6; // 第 5 关通关后。
const WAVE_BREAK_MS = 1200;
const SPAWN_GRACE_MS = 900;
const MIN_SPAWN_DISTANCE = 6; // 在三类蛇的直冲触发范围之外。
const WRECK_WAVES = 3;

const line = (
  x: number,
  y: number,
  length: number,
  vertical = false,
): Point[] =>
  Array.from({ length }, (_, i) => ({
    x: x + (vertical ? 0 : i),
    y: y + (vertical ? i : 0),
  }));
const firstWave: Spawn[] = [
  { x: 19, y: 16, kind: 'normal', delayMs: SPAWN_GRACE_MS },
];
export const ENDLESS_MAP: Level = {
  id: 21,
  name: '回环石园',
  chapter: '无尽挑战',
  focus: '清完一波，下一波从附近进场。旧残骸还能用来诱蛇。',
  intent: '用固定大地图的环路和残骸持续创造新的撞墙机会。',
  width: 39,
  height: 45,
  apple: { x: 19, y: 22 },
  facing: 'up',
  snakes: firstWave,
  beaconEnabled: true,
  parMs: 1,
  parDodges: 0,
  walls: [
    // 西北石阵、东北长墙、中部短墙、西南环路、东南门庭。
    ...line(4, 5, 7),
    ...line(10, 6, 4, true),
    ...line(5, 12, 6),
    ...line(13, 9, 5, true),
    ...line(7, 16, 5),
    ...line(18, 5, 6),
    ...line(26, 5, 6, true),
    ...line(27, 10, 6),
    ...line(23, 13, 6),
    ...line(33, 14, 5, true),
    ...line(17, 23, 5),
    ...line(12, 21, 5, true),
    ...line(8, 24, 4),
    ...line(24, 19, 5),
    ...line(28, 20, 3, true),
    ...line(28, 25, 5, true),
    ...line(29, 29, 5),
    ...line(5, 30, 7),
    ...line(5, 31, 5, true),
    ...line(5, 36, 6),
    ...line(13, 34, 5),
    ...line(17, 35, 5, true),
    ...line(10, 40, 5),
    ...line(22, 32, 5, true),
    ...line(23, 37, 4),
    ...line(29, 37, 5),
    ...line(33, 38, 3, true),
    ...line(23, 41, 6),
  ],
  gates: [
    {
      id: 'A',
      cells: line(28, 23, 2, true),
      switches: [
        { x: 25, y: 23 },
        { x: 31, y: 25 },
      ],
      initialClosed: false,
    },
    {
      id: 'B',
      cells: line(27, 37, 2),
      switches: [
        { x: 26, y: 34 },
        { x: 29, y: 40 },
      ],
      initialClosed: true,
    },
  ],
};
const entrances = [2, 8, 14, 20, 26, 32, 37].flatMap((x) =>
  [2, 8, 14, 20, 26, 32, 38, 43].map((y) => ({ x, y })),
);
const taxi = (a: Point, b: Point): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const lateWaves: SnakeKind[][] = [
  ['normal', 'swift'],
  ['swift', 'cautious'],
  ['normal', 'swift', 'cautious'],
  ['cautious', 'normal', 'normal'],
  ['swift', 'normal', 'swift'],
  ['normal', 'cautious', 'cautious'],
];

function randomFor(seed: number, wave: number): () => number {
  let value = (seed ^ Math.imul(wave, 0x9e3779b9)) >>> 0;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

export function createEndless(
  seed: number,
  utility: UtilitySkill,
  unlocked: number,
): GameState {
  const utilitySkills: UtilitySkill[] = ['dodge', 'pulse'];
  if (unlocked >= 9) utilitySkills.push('magnet');
  const state = createState({ ...ENDLESS_MAP, utilitySkills }, utility);
  state.endless = {
    seed: seed >>> 0,
    wave: 1,
    cleared: 0,
    defeated: 0,
    nextWaveMs: 0,
  };
  return state;
}

function nextSpawns(state: GameState, wave: number, seed: number): Spawn[] {
  const random = randomFor(seed, wave);
  const { width, height, gates } = state.level;
  const reserved = (gates ?? []).flatMap((gate) => [
    ...gate.cells,
    ...gate.switches,
  ]);
  const distances = routeDistances(state, state.apple);
  const distance = (p: Point): number => distances[p.y * width + p.x]!;
  const safe = (p: Point): boolean =>
    distance(p) >= MIN_SPAWN_DISTANCE &&
    taxi(state.apple, p) >= MIN_SPAWN_DISTANCE &&
    !reserved.some((cell) => same(p, cell)) &&
    !state.wrecks.some((wreck) => same(p, wreck)) &&
    !(state.beacon && same(p, state.beacon));
  const candidates = entrances.filter((p) => distance(p) <= 14 && safe(p));
  const spawns: Spawn[] = [];
  const kinds: SnakeKind[] =
    wave === 2
      ? ['normal', 'swift']
      : wave === 3
        ? ['normal', 'cautious']
        : wave < 7
          ? ['normal', 'swift', 'cautious']
          : lateWaves[Math.floor(random() * lateWaves.length)]!;
  const spread = (p: Point): boolean => spawns.every((s) => taxi(s, p) >= 4);
  for (const [i, kind] of kinds.entries()) {
    let choices = candidates.filter(spread);
    // 在边角或入口被残骸占据时，改用邻近可达的空地。
    if (!choices.length) {
      choices = [];
      for (let y = 1; y < height - 1; y++)
        for (let x = 1; x < width - 1; x++) {
          const p = { x, y };
          if (safe(p) && spread(p)) choices.push(p);
        }
    }
    const score = (p: Point): number =>
      Math.abs(distance(p) - 8) -
      (spawns.length
        ? 0.25 * Math.min(14, ...spawns.map((s) => taxi(s, p)))
        : 0);
    const choice = choices
      .map((p) => ({ p, rank: score(p) + random() * 3 }))
      .sort((a, b) => a.rank - b.rank)[0]?.p;
    if (!choice) break;
    spawns.push({
      ...choice,
      kind,
      elite: wave >= 5 && (i === 0 || (wave >= 9 && i === 1 && random() < 0.5)),
      delayMs: SPAWN_GRACE_MS + i * 240,
    });
  }
  return spawns;
}

export function stepEndless(state: GameState, command: Command): void {
  const run = state.endless;
  if (!run || state.paused || state.status !== 'playing') return;
  step(state, command);
  run.defeated += state.events.filter((event) => event.type === 'wall').length;
  if (state.status !== 'playing') return;
  if (run.nextWaveMs > 0) {
    run.nextWaveMs = Math.max(0, run.nextWaveMs - TICK_MS);
    if (run.nextWaveMs > 0) return;
    const wave = run.wave + 1;
    state.wrecks = state.wrecks.filter(
      (w) => wave - (w.wave ?? wave) < WRECK_WAVES,
    );
    let spawns = nextSpawns(state, wave, run.seed);
    // 极端残局下提前清走最旧残骸，避免待在封闭角落时整局卡住。
    while (!spawns.length && state.wrecks.length) {
      state.wrecks.shift();
      spawns = nextSpawns(state, wave, run.seed);
    }
    if (!spawns.length) {
      run.nextWaveMs = TICK_MS;
      return;
    }
    run.wave = wave;
    state.lureKills = [];
    state.eliminations = [];
    spawnSnakes(state, spawns);
  } else if (state.snakes.every((snake) => !snake.alive)) {
    run.cleared++;
    run.nextWaveMs = WAVE_BREAK_MS;
  }
}

export function beatsEndlessScore(
  score: EndlessScore,
  best?: EndlessScore,
): boolean {
  return best
    ? score.cleared > best.cleared ||
        (score.cleared === best.cleared && score.defeated > best.defeated)
    : score.defeated > 0;
}
