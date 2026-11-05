import atlasUrl from '../assets/characters/bean-mascots.webp';

/** 透明手绘贴图：4×4等分，前11格为角色，其余留空。 */
export const CHARACTER_ATLAS = atlasUrl;
export const ATLAS_SIZE = 1254;
// 同一套软萌手绘造型：嫩绿、奶黄、浅紫，各自的头、身体和开心表情配色一致。
export const CHARACTER_FRAMES = {
  normal: { head: 0, happy: 1, body: 2 },
  swift: { head: 4, happy: 5, body: 6 },
  cautious: { head: 8, happy: 9, body: 10 },
} as const;
export const APPLE_FRAME = 3;
export const CAUGHT_APPLE_FRAME = 7;

export function characterFrame(frame: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const column = frame % 4,
    row = Math.floor(frame / 4),
    x = Math.round((column * ATLAS_SIZE) / 4),
    y = Math.round((row * ATLAS_SIZE) / 4);
  return {
    x,
    y,
    width: Math.round(((column + 1) * ATLAS_SIZE) / 4) - x,
    height: Math.round(((row + 1) * ATLAS_SIZE) / 4) - y,
  };
}

/** 首页与实际对局共用一张角色图集，不再另画一套角色。 */
export function characterArt(frame: number): string {
  const { x, y, width, height } = characterFrame(frame);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" overflow="hidden" aria-hidden="true"><image href="${atlasUrl}" width="${ATLAS_SIZE}" height="${ATLAS_SIZE}"/></svg>`;
}
