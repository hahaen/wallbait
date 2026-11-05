import { expect, it } from 'vitest';
import { joystickIntent } from '../src/input/joystick';

it('中心死区忽略手指抖动，离开死区后保留主轴和拖动角度', () => {
  expect(joystickIntent(7, -7, 80).movement).toBeNull();
  expect(joystickIntent(60, 8, 80).direction).toBe('right');
  expect(joystickIntent(-60, 8, 80).direction).toBe('left');
  expect(joystickIntent(8, -60, 80).direction).toBe('up');
  expect(joystickIntent(8, 60, 80).direction).toBe('down');
});
it('不同斜向保留不同斜率，跨过主轴边界时移动向量连续', () => {
  const shallow = joystickIntent(60, -20, 80).movement!;
  expect(shallow.y / shallow.x).toBeCloseTo(-1 / 3);
  const before = joystickIntent(50, 49, 80).movement!;
  const after = joystickIntent(49, 50, 80).movement!;
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.03);
});
it('拖出外圈仍保持输入，但旋钮位移被限制在安全范围', () => {
  const value = joystickIntent(300, -400, 80);
  expect(value.direction).toBe('up');
  expect(value.movement).toEqual({ x: 0.6, y: -0.8 });
  expect(Math.hypot(value.x, value.y)).toBeCloseTo(36);
  expect(joystickIntent(20, 10, 0).direction).toBeNull();
});
