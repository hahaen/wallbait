import type { Direction } from '../core/types';

/** 四向吸附、中心死区与转向滞回。返回的位移只驱动摇杆外观。 */
export function joystickIntent(
  dx: number,
  dy: number,
  radius: number,
  previous: Direction | null,
): {
  direction: Direction | null;
  x: number;
  y: number;
} {
  const length = Math.hypot(dx, dy);
  if (radius <= 0 || length < radius * 0.18)
    return { direction: null, x: 0, y: 0 };
  const horizontal = previous === 'left' || previous === 'right';
  const vertical = previous === 'up' || previous === 'down';
  const useHorizontal = horizontal
    ? Math.abs(dx) * 1.18 >= Math.abs(dy)
    : vertical
      ? Math.abs(dx) > Math.abs(dy) * 1.18
      : Math.abs(dx) >= Math.abs(dy);
  const direction = useHorizontal
    ? dx >= 0
      ? 'right'
      : 'left'
    : dy >= 0
      ? 'down'
      : 'up';
  const scale = Math.min(length, radius * 0.45) / length;
  return { direction, x: dx * scale, y: dy * scale };
}
