import type { Direction, Point, SnakeKind, SnakeRules } from './types';

export const TICK_MS = 20;
export const MOVE_MS = 120;
export const DODGE_CELLS = 2;
export const COOLDOWN_MS = 2200;
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
    chargeMs: 900,
    dashMs: 40,
    dashCells: 9,
    recoverMs: 800,
    range: 7,
    aimMs: 0,
  },
  swift: {
    trackMs: 260,
    chargeMs: 820,
    dashMs: 20,
    dashCells: 10,
    recoverMs: 1000,
    range: 8,
    aimMs: 0,
  },
  cautious: {
    trackMs: 360,
    chargeMs: 1000,
    dashMs: 40,
    dashCells: 7,
    recoverMs: 600,
    range: 5,
    aimMs: 240,
  },
};
