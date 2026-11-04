import { expect, it } from 'vitest';
import { joystickIntent } from '../src/input/joystick';

it('中心死区忽略手指轻微抖动，离开死区后四向吸附', () => {
  expect(joystickIntent(7, -7, 80, null).direction).toBeNull();
  expect(joystickIntent(60, 8, 80, null).direction).toBe('right');
  expect(joystickIntent(-60, 8, 80, null).direction).toBe('left');
  expect(joystickIntent(8, -60, 80, null).direction).toBe('up');
  expect(joystickIntent(8, 60, 80, null).direction).toBe('down');
});
it('斜向边界保留原方向，明确跨过边界才换向', () => {
  expect(joystickIntent(50, 54, 80, 'right').direction).toBe('right');
  expect(joystickIntent(50, 61, 80, 'right').direction).toBe('down');
  expect(joystickIntent(54, 50, 80, 'down').direction).toBe('down');
  expect(joystickIntent(61, 50, 80, 'down').direction).toBe('right');
});
it('拖出外圈仍保持输入，但旋钮位移被限制在安全范围', () => {
  const value = joystickIntent(300, -400, 80, null);
  expect(value.direction).toBe('up');
  expect(Math.hypot(value.x, value.y)).toBeCloseTo(36);
  expect(joystickIntent(20, 10, 0, 'right').direction).toBeNull();
});
