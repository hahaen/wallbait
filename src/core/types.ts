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
}
export type GameEvent =
  | { type: 'charge' | 'dash' | 'wall'; snake: number; x: number; y: number }
  | { type: 'dodge' | 'won' | 'lost'; x: number; y: number };
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
  gates: { id: string; closed: boolean; pending: boolean | null }[];
  lossReason: string | null;
  dodges: number;
  snakes: Snake[];
  events: GameEvent[];
}
export interface Command {
  direction: Direction | null;
  dodge?: boolean;
  beacon?: boolean;
}
