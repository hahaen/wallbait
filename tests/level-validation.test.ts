import { expect, it } from 'vitest';
import { LEVELS, validateLevel } from './fixtures/levels';

it('拒绝门墙重叠、重复编号、出生门和禁用信标的侦察蛇', () => {
  const base = structuredClone(LEVELS[3]!);
  const overlap = structuredClone(base);
  overlap.gates![0]!.cells = [overlap.walls[0]!];
  expect(validateLevel(overlap)).toContain('门或踏板不可通行');
  const duplicate = structuredClone(base);
  duplicate.gates!.push(structuredClone(duplicate.gates![0]!));
  expect(validateLevel(duplicate)).toContain('门编号重复');
  const spawn = structuredClone(base);
  spawn.apple = spawn.gates![0]!.cells[0]!;
  expect(validateLevel(spawn)).toContain('出生被关闭门占用');
  expect(validateLevel({ ...LEVELS[4]!, beaconEnabled: false })).toContain(
    '侦察蛇关卡必须启用信标',
  );
});
it('拒绝关闭门把唯一开关隔在另一侧的死锁', () => {
  const level = structuredClone(LEVELS[3]!);
  level.gates![0]!.switches = [{ x: 4, y: 5 }];
  expect(validateLevel(level)).toContain('关闭门区域无法通过踏板到达');
});
