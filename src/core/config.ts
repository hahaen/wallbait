import type { Direction, Point, SnakeKind, SnakeRules } from './types';

export const TICK_MS = 20;
export const MOVE_MS = 120;
export const DODGE_CELLS = 2;
export const COOLDOWN_MS = 240;
export const MAX_ENERGY = 2;
export const RECHARGE_MS = 3000;
export const BEACON_MS = 2200;
export const BEACON_CELLS = 2;
export const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];
export const VECTOR: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
export const SNAKE_RULES: Record<SnakeKind, SnakeRules> = {
  normal: {
    trackMs: 300,
    dashMs: 100,
    dashCells: 4,
    recoverMs: 800,
    range: 5,
    aimMs: 120,
  },
  swift: {
    trackMs: 260,
    dashMs: 80,
    dashCells: 3,
    recoverMs: 1000,
    range: 5,
    aimMs: 100,
  },
  cautious: {
    trackMs: 360,
    dashMs: 100,
    dashCells: 5,
    recoverMs: 600,
    range: 5,
    aimMs: 240,
  },
};
