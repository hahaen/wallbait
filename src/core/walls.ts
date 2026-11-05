import type { Point } from './types';

/** 轮廓顶点以格边为原点，障碍格由其中心是否落在轮廓内决定。 */
export function wallContains(outline: Point[], cell: Point): boolean {
  const x = cell.x + 0.5,
    y = cell.y + 0.5;
  let inside = false;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!,
      b = outline[(i + 1) % outline.length]!;
    const straddles = a.y > y !== b.y > y;
    if (straddles && x < a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y))
      inside = !inside;
  }
  return inside;
}

const cross = (a: Point, b: Point, c: Point): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** 两端在空地时，检查中心连线是否触及斜墙轮廓。 */
export function crossesWall(outline: Point[], from: Point, to: Point): boolean {
  const a = { x: from.x + 0.5, y: from.y + 0.5 },
    b = { x: to.x + 0.5, y: to.y + 0.5 };
  return outline.some((c, i) => {
    const d = outline[(i + 1) % outline.length]!;
    return (
      Math.max(a.x, b.x) >= Math.min(c.x, d.x) &&
      Math.max(c.x, d.x) >= Math.min(a.x, b.x) &&
      Math.max(a.y, b.y) >= Math.min(c.y, d.y) &&
      Math.max(c.y, d.y) >= Math.min(a.y, b.y) &&
      cross(a, b, c) * cross(a, b, d) <= 0 &&
      cross(c, d, a) * cross(c, d, b) <= 0
    );
  });
}
