import type { Direction, Point } from '../core/types';

/** 保留完整拖动角度，另给出工具朝向和摇杆的显示位移。 */
export function joystickIntent(
  dx: number,
  dy: number,
  radius: number,
): {
  direction: Direction | null;
  movement: Point | null;
  x: number;
  y: number;
} {
  const length = Math.hypot(dx, dy);
  if (radius <= 0 || length < radius * 0.18)
    return { direction: null, movement: null, x: 0, y: 0 };
  const direction =
    Math.abs(dx) >= Math.abs(dy)
      ? dx >= 0
        ? 'right'
        : 'left'
      : dy >= 0
        ? 'down'
        : 'up';
  const scale = Math.min(length, radius * 0.45) / length;
  return {
    direction,
    movement: { x: dx / length, y: dy / length },
    x: dx * scale,
    y: dy * scale,
  };
}
