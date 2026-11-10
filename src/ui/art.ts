import {
  characterArt,
  APPLE_FRAME,
  CHARACTER_FRAMES,
} from '../game/characters';

function sprite(source: string, x: number, y: number, size: number): string {
  return source.replace(
    '<svg ',
    `<svg x="${x}" y="${y}" width="${size}" height="${size}" `,
  );
}
export function createArt(atlasUrl: string): {
  appleArt: string;
  heroArt: string;
} {
  const character = (frame: number) => characterArt(frame, atlasUrl);
  const appleArt = character(APPLE_FRAME);
  const heroArt = `<svg viewBox="0 0 420 270" role="img" aria-label="绿蛇追着红苹果，苹果闪开，让蛇一头撞向石墙"><defs><pattern id="garden-grid" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#e1e9bc"/><path d="M30 0H0V30" fill="none" stroke="#b8c68f" stroke-opacity=".5"/></pattern></defs><rect x="14" y="30" width="392" height="222" rx="36" fill="#dac9ac"/><rect x="14" y="22" width="392" height="222" rx="34" fill="url(#garden-grid)" stroke="#3d2c24" stroke-width="5"/><path d="M159 172h191" stroke="#e7b549" stroke-width="22" opacity=".6"/><path d="m336 156 18 16-18 16" fill="none" stroke="#e6a631" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>${sprite(character(CHARACTER_FRAMES.normal.body), 32, 168, 52)}${sprite(character(CHARACTER_FRAMES.normal.body), 58, 158, 60)}${sprite(character(CHARACTER_FRAMES.normal.body), 86, 140, 64)}${sprite(character(CHARACTER_FRAMES.normal.body), 113, 132, 68)}${sprite(character(CHARACTER_FRAMES.normal.head), 137, 118, 86)}${sprite(appleArt, 225, 54, 102)}<path d="m266 174 11-10 11 10m-22 14 11-10 11 10" fill="none" stroke="#fff5e4" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><g fill="#b3a292" stroke="#3d2c24" stroke-width="4"><rect x="358" y="106" width="32" height="39" rx="9"/><rect x="358" y="147" width="32" height="39" rx="9"/><rect x="358" y="188" width="32" height="39" rx="9"/></g><path d="m349 121-10-10m13-5-2-13m18 9 5-11" stroke="#e9b344" stroke-width="5" stroke-linecap="round"/><path d="m188 66 7-15m6 23 13-7" stroke="#f27650" stroke-width="5" stroke-linecap="round"/></svg>`;
  return { appleArt, heroArt };
}
