export type Direction = 'up' | 'right' | 'down' | 'left';
export type SnakeKind = 'normal' | 'swift' | 'cautious';
export type Phase = 'tracking' | 'charging' | 'dashing' | 'recovering';
export interface Point {
  x: number;
  y: number;
}
export interface SnakeRules {
  trackMs: number;
  chargeMs: number;
  dashMs: number;
  dashCells: number;
  recoverMs: number;
  range: number;
  aimMs: number;
}
export interface Spawn extends Point {
  kind: SnakeKind;
  delayMs?: number;
  rules?: Partial<SnakeRules>;
}
export interface Gate {
  id: string;
  cells: Point[];
  switches: Point[];
  initialClosed: boolean;
}
export type HighlightId =
  'wreck-chain' | 'double-decoy' | 'no-dodge' | 'close-call';
export interface Highlight {
  id: HighlightId;
  atMs: number;
}
export interface MemoryChip extends Point {
  title: string;
  memory: string;
}
export interface Level {
  id: number;
  name: string;
  chapter: string;
  focus: string;
  intent: string;
  decision?: string;
  failure?: string;
  width: number;
  height: number;
  walls: Point[];
  gates?: Gate[];
  beaconEnabled?: boolean;
  chip?: MemoryChip;
  apple: Point;
  facing: Direction;
  snakes: Spawn[];
  parMs: number;
  parDodges: number;
}
export interface Snake extends Point {
  id: number;
  kind: SnakeKind;
  rules: SnakeRules;
  phase: Phase;
  alive: boolean;
  facing: Direction;
  locked: Direction;
  timer: number;
  aim: number;
  aimDirection: Direction | null;
  remaining: number;
  body: Point[];
  attackPath: Point[];
  attackBeacon: number | null;
  closeEscape: boolean;
}
export type GameEvent =
  | { type: 'charge' | 'dash'; snake: number; x: number; y: number }
  | {
      type: 'wall';
      snake: number;
      x: number;
      y: number;
      obstacle: 'wall' | 'wreck';
    }
  | { type: 'dodge' | 'chip' | 'won' | 'lost'; x: number; y: number }
  | { type: 'highlight'; id: HighlightId; x: number; y: number };
export interface LossDetails {
  enemy: number;
  kind: 'contact' | 'tracking' | 'dash';
  cell: Point;
  path: Point[];
}
export interface GameState {
  level: Level;
  status: 'playing' | 'won' | 'lost';
  paused: boolean;
  elapsedMs: number;
  apple: Point;
  facing: Direction;
  moveTimer: number;
  cooldownMs: number;
  energy: number;
  rechargeMs: number;
  beacon: (Point & { remainingMs: number }) | null;
  beacons: number;
  chipCollected: boolean;
  highlights: Highlight[];
  lureKills: { beacon: number; snake: number }[];
  gates: { id: string; closed: boolean; pending: boolean | null }[];
  wrecks: (Point & { active: boolean })[];
  lossReason: string | null;
  loss: LossDetails | null;
  dodges: number;
  snakes: Snake[];
  events: GameEvent[];
}
export interface Command {
  direction: Direction | null;
  dodge?: boolean;
  beacon?: boolean;
}
