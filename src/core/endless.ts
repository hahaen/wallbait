import { TICK_MS } from './config';
import { createState, routeDistances, same, spawnSnakes, step } from './engine';
import type {
  Command,
  EndlessScore,
  GameState,
  EndlessState,
  Level,
  Point,
  SnakeKind,
  Spawn,
  UtilitySkill,
  WaveRegion,
} from './types';

const WAVE_BREAK_MS = 2400;
const SPAWN_GRACE_MS = 900;
const MIN_SPAWN_DISTANCE = 6; // 在三类蛇的直冲触发范围之外。
const WRECK_WAVES = 3;
const endlessSnakePace = {
  normal: { trackMs: 360, dashMs: 140 },
  swift: { trackMs: 320, dashMs: 120 },
  cautious: { trackMs: 440, dashMs: 140 },
};

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
  {
    x: 27,
    y: 24,
    kind: 'normal',
    delayMs: SPAWN_GRACE_MS,
    rules: endlessSnakePace.normal,
  },
];
export const ENDLESS_MAP: Level = {
  id: 21,
  name: '回环石园',
  chapter: '无尽挑战',
  focus: '清完一波，可以留守，也可以走向小地图上的另一个进场区。',
  intent: '用固定大地图的环路和残骸持续创造新的撞墙机会。',
  width: 55,
  height: 61,
  apple: { x: 27, y: 30 },
  appleMoveMs: 140,
  facing: 'up',
  snakes: firstWave,
  beaconEnabled: true,
  utilitySkills: ['dodge', 'pulse', 'magnet'],
  parMs: 1,
  parDodges: 0,
  walls: [
    // 西北石阵、东北长墙、中部短墙、西南环路、东南门庭。
    ...line(12, 13, 7),
    ...line(18, 14, 4, true),
    ...line(13, 20, 6),
    ...line(21, 17, 5, true),
    ...line(15, 24, 5),
    ...line(26, 13, 6),
    ...line(34, 13, 6, true),
    ...line(35, 18, 6),
    ...line(31, 21, 6),
    ...line(41, 22, 5, true),
    ...line(25, 31, 5),
    ...line(20, 29, 5, true),
    ...line(16, 32, 4),
    ...line(32, 27, 5),
    ...line(36, 28, 3, true),
    ...line(36, 33, 5, true),
    ...line(37, 37, 5),
    ...line(13, 38, 7),
    ...line(13, 39, 5, true),
    ...line(13, 44, 6),
    ...line(21, 42, 5),
    ...line(25, 43, 5, true),
    ...line(18, 48, 5),
    ...line(30, 40, 5, true),
    ...line(31, 45, 4),
    ...line(37, 45, 5),
    ...line(41, 46, 3, true),
    ...line(31, 49, 6),
    // 北侧散石、东西折墙和南侧回廊。
    ...line(5, 5, 7),
    ...line(11, 6, 5, true),
    ...line(16, 8, 8),
    ...line(27, 4, 6),
    ...line(34, 7, 5),
    ...line(42, 5, 7),
    ...line(48, 6, 5, true),
    ...line(4, 16, 5, true),
    ...line(5, 16, 4),
    ...line(6, 27, 5, true),
    ...line(4, 35, 7, true),
    ...line(5, 41, 5),
    ...line(8, 46, 5),
    ...line(51, 14, 8, true),
    ...line(47, 21, 4),
    ...line(48, 26, 6, true),
    ...line(49, 31, 4),
    ...line(50, 36, 7, true),
    ...line(44, 44, 6),
    ...line(48, 47, 6, true),
    ...line(6, 54, 9),
    ...line(14, 51, 3, true),
    ...line(19, 56, 8),
    ...line(28, 51, 7),
    ...line(34, 52, 5, true),
    ...line(39, 55, 8),
  ],
  gates: [
    {
      id: 'A',
      cells: line(36, 31, 2, true),
      switches: [
        { x: 33, y: 31 },
        { x: 39, y: 33 },
      ],
      initialClosed: false,
    },
    {
      id: 'B',
      cells: line(35, 45, 2),
      switches: [
        { x: 34, y: 42 },
        { x: 37, y: 48 },
      ],
      initialClosed: true,
    },
  ],
};
const entrances = [2, 8, 14, 20, 26, 32, 38, 44, 50, 53].flatMap((x) =>
  [2, 8, 14, 20, 26, 32, 38, 44, 50, 56, 59].map((y) => ({ x, y })),
);
const taxi = (a: Point, b: Point): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const regionDivisions = 5;
const regionEdge = (size: number, n: number): number =>
  1 + Math.floor(((size - 2) * n) / regionDivisions);
const waveRegions: WaveRegion[] = Array.from(
  { length: regionDivisions * regionDivisions },
  (_, i) => {
    const col = i % regionDivisions;
    const row = Math.floor(i / regionDivisions);
    const x = regionEdge(ENDLESS_MAP.width, col);
    const y = regionEdge(ENDLESS_MAP.height, row);
    return {
      x,
      y,
      width: regionEdge(ENDLESS_MAP.width, col + 1) - x,
      height: regionEdge(ENDLESS_MAP.height, row + 1) - y,
    };
  },
);
function distanceToRegion(p: Point, region: WaveRegion): number {
  return (
    Math.max(region.x - p.x, 0, p.x - (region.x + region.width - 1)) +
    Math.max(region.y - p.y, 0, p.y - (region.y + region.height - 1))
  );
}
function pickWaveRegions(
  state: GameState,
): [WaveRegion, WaveRegion] | undefined {
  const { width } = state.level;
  const distances = routeDistances(state, state.apple);
  const nearby = waveRegions.map((region) => {
    let nearest = Infinity;
    let hasSpawn = false;
    for (let y = region.y; y < region.y + region.height; y++)
      for (let x = region.x; x < region.x + region.width; x++) {
        const distance = distances[y * width + x]!;
        if (distance < 0) continue;
        nearest = Math.min(nearest, distance);
        if (taxi(state.apple, { x, y }) >= MIN_SPAWN_DISTANCE) hasSpawn = true;
      }
    return { region, nearest, hasSpawn };
  });
  const [first, second] = nearby
    .filter((entry) => entry.hasSpawn)
    .sort((a, b) => a.nearest - b.nearest);
  return first && second ? [first.region, second.region] : undefined;
}
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
): EndlessState {
  return {
    ...createState(ENDLESS_MAP, utility),
    endless: {
      seed: seed >>> 0,
      wave: 1,
      cleared: 0,
      defeated: 0,
      nextWaveMs: 0,
    },
  };
}

function nextSpawns(
  state: GameState,
  wave: number,
  seed: number,
  region?: WaveRegion,
): Spawn[] {
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
  const candidates = entrances.filter(
    (p) =>
      (!region || distanceToRegion(p, region) === 0) &&
      distance(p) <= 14 &&
      safe(p),
  );
  const area = region ?? { x: 1, y: 1, width: width - 2, height: height - 2 };
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
      for (let y = area.y; y < area.y + area.height; y++)
        for (let x = area.x; x < area.x + area.width; x++) {
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
      rules: endlessSnakePace[kind],
    });
  }
  return spawns;
}

export function stepEndless(state: EndlessState, command: Command): void {
  const run = state.endless;
  if (state.paused || state.status !== 'playing') return;
  step(state, command);
  run.defeated += state.events.filter((event) => event.type === 'wall').length;
  if (state.status !== 'playing') return;
  if (run.nextWaveMs > 0) {
    const choice = run.waveChoice;
    if (choice) {
      const other = choice.selected === 0 ? 1 : 0;
      if (
        distanceToRegion(state.apple, choice.regions[other]) <
        distanceToRegion(state.apple, choice.regions[choice.selected])
      )
        choice.selected = other;
    }
    run.nextWaveMs = Math.max(0, run.nextWaveMs - TICK_MS);
    if (run.nextWaveMs > 0) return;
    const wave = run.wave + 1;
    state.wrecks = state.wrecks.filter(
      (w) => wave - (w.wave ?? wave) < WRECK_WAVES,
    );
    let spawns = nextSpawns(
      state,
      wave,
      run.seed,
      choice?.regions[choice.selected],
    );
    if (!spawns.length && choice)
      spawns = nextSpawns(
        state,
        wave,
        run.seed,
        choice.regions[choice.selected === 0 ? 1 : 0],
      );
    if (!spawns.length) spawns = nextSpawns(state, wave, run.seed);
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
    delete run.waveChoice;
    state.lureKills = [];
    state.eliminations = [];
    spawnSnakes(state, spawns);
  } else if (state.snakes.every((snake) => !snake.alive)) {
    run.cleared++;
    run.nextWaveMs = WAVE_BREAK_MS;
    const regions = pickWaveRegions(state);
    if (regions) run.waveChoice = { regions, selected: 0 };
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
