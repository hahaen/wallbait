import type Phaser from 'phaser';
import { FREEZE_MS, LURE_MS } from '../../core/config';
import type { DropKind, Point } from '../../core/types';
import { DROP_COLORS } from '../config';

type Graphics = Phaser.GameObjects.Graphics;

const CREAM = 0xfffae9;
const GOLD_INK = 0x94602d;
const ICE_INK = 0x46788d;
const LURE_INK = 0x664378;
const TAU = Math.PI * 2;

function arc(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  from: number,
  to: number,
): void {
  g.beginPath().arc(x, y, r, from, to).strokePath();
}

function sparkle(g: Graphics, x: number, y: number, size: number): void {
  const tip = size * 0.25;
  g.fillPoints(
    [
      { x, y: y - size },
      { x: x + tip, y: y - tip },
      { x: x + size, y },
      { x: x + tip, y: y + tip },
      { x, y: y + size },
      { x: x - tip, y: y + tip },
      { x: x - size, y },
      { x: x - tip, y: y - tip },
    ],
    true,
  );
}

export function drawShield(
  back: Graphics,
  front: Graphics,
  { x, y }: Point,
  charged: boolean,
): void {
  const cy = y - 2;
  if (!charged) {
    // 破碎的边缘保留到脱身时间结束。
    front.lineStyle(2.5, GOLD_INK, 0.55);
    arc(front, x, cy, 25, 0.28, 1.05);
    arc(front, x, cy, 25, 2.22, 3.06);
    arc(front, x, cy, 25, 4.18, 5.15);
    return;
  }
  back.fillStyle(DROP_COLORS.shield, 0.26);
  back.fillCircle(x, cy, 25);
  back.fillStyle(0xd5a24c, 0.18);
  back.fillEllipse(x, y + 23, 42, 7);

  front.lineStyle(2.8, GOLD_INK, 0.93);
  front.strokeCircle(x, cy, 25);
  front.lineStyle(1.8, DROP_COLORS.shield, 0.95);
  front.strokeCircle(x, cy, 22.5);
  front.lineStyle(3.4, CREAM, 0.96);
  arc(front, x, cy, 22.8, 3.4, 4.57);
  front.lineStyle(2.2, CREAM, 0.68);
  arc(front, x, cy, 23, 0.49, 1.24);
  front.fillStyle(CREAM, 0.96);
  sparkle(front, x + 18, cy - 17, 4.8);
  front.fillStyle(DROP_COLORS.shield, 0.92);
  sparkle(front, x - 21, cy + 13, 3.1);
}

function crystal(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha: number,
  amber = false,
): void {
  const tip = { x: x - width * 0.28, y: y - height };
  const left = { x: x - width * 0.57, y: y - height * 0.46 };
  const right = { x: x + width * 0.52, y: y - height * 0.53 };
  const bottom = { x: x + width * 0.16, y };
  g.fillStyle(amber ? 0xe8aa50 : 0x8bcbe2, alpha);
  g.fillPoints([tip, left, bottom, right], true);
  g.fillStyle(amber ? 0xffe5a0 : 0xe9fbff, alpha);
  g.fillTriangle(tip.x, tip.y, left.x, left.y, bottom.x, bottom.y);
  g.lineStyle(1.5, amber ? GOLD_INK : ICE_INK, alpha);
  g.strokePoints([tip, left, bottom, right], true);
}

export function drawFrost(
  back: Graphics,
  front: Graphics,
  { x, y }: Point,
  remainingMs: number,
  reducedMotion: boolean,
): void {
  const elapsed = FREEZE_MS - remainingMs;
  const rise = reducedMotion
    ? 1
    : 1 - 0.32 * (1 - Math.min(1, elapsed / 170)) ** 2;
  const alpha = reducedMotion ? 1 : Math.min(1, 0.65 + remainingMs / 320);

  back.fillStyle(0x6ab7d4, 0.2 * alpha);
  back.fillEllipse(x, y + 20, 49, 18);
  back.fillStyle(0xdeeff7, 0.92 * alpha);
  back.fillEllipse(x, y + 17, 42, 13);
  back.lineStyle(2, ICE_INK, 0.56 * alpha);
  back.strokeEllipse(x, y + 17, 42, 13);
  crystal(back, x - 18, y + 11, 10, 25 * rise, alpha);
  crystal(front, x - 18, y + 22, 12, 17 * rise, alpha);
  crystal(front, x + 20, y + 22, 15, 21 * rise, alpha);
  crystal(front, x + 12, y + 25, 9, 12 * rise, alpha);
  const glint = { x: x + 22, y: y - 15 };
  front.fillStyle(ICE_INK, alpha);
  sparkle(front, glint.x, glint.y, 5.8);
  front.fillStyle(0xecfcff, alpha);
  sparkle(front, glint.x, glint.y, 4);
}

export function drawLure(
  g: Graphics,
  { x, y }: Point,
  remainingMs: number,
  reducedMotion: boolean,
): void {
  const elapsed = LURE_MS - remainingMs;
  if (!reducedMotion) {
    for (const delay of [0, 460]) {
      if (elapsed < delay) continue;
      const t = ((elapsed - delay) % 920) / 920;
      g.lineStyle(2.2 - t, 0x9462b0, (1 - t) * 0.59);
      g.strokeEllipse(x, y + 8, 31 + 43 * t, 14 + 21 * t);
    }
  }
  const t = Math.min(1, elapsed / 250);
  const size = reducedMotion
    ? 1
    : 1 - 0.32 * (1 - t) ** 2 + 0.13 * Math.sin(t * Math.PI);
  const top = y - 4 * size;
  g.fillStyle(0x8f66a8, 0.23);
  g.fillEllipse(x, y + 11, 39, 13);
  g.fillStyle(0xd7b9eb);
  g.fillEllipse(x, y + 9, 30, 11);
  g.lineStyle(1.8, LURE_INK, 0.8);
  g.strokeEllipse(x, y + 9, 30, 11);

  // 果香诱饵：紫色果糖压在底座上，和地图上的待拾取图标区分。
  g.fillStyle(0xb085ce);
  g.fillEllipse(x, top, 23 * size, 20 * size);
  g.fillStyle(DROP_COLORS.lure);
  g.fillEllipse(x - size, top - 2 * size, 18 * size, 13 * size);
  g.lineStyle(2.4, LURE_INK);
  g.strokeEllipse(x, top, 23 * size, 20 * size);
  g.lineBetween(x, top - 10 * size, x + 2 * size, top - 15 * size);
  g.fillStyle(0xba9ad9);
  g.fillEllipse(x + 5 * size, top - 14 * size, 9 * size, 4.5 * size);
  g.lineStyle(1.2, LURE_INK);
  g.strokeEllipse(x + 5 * size, top - 14 * size, 9 * size, 4.5 * size);
  g.fillStyle(CREAM);
  g.fillEllipse(x - 4 * size, top - 4 * size, 5 * size, 2.7 * size);
  const glint = reducedMotion ? 0 : Math.sin(elapsed / 190) * 2.5;
  g.fillStyle(0x9770b4);
  sparkle(g, x + 16, y - 13 + glint, 3.8);
  g.fillStyle(CREAM);
  sparkle(g, x + 16, y - 13 + glint, 2.1);
}

export const DROP_BURST_MS = 560;

export function drawDropBurst(
  g: Graphics,
  { x, y }: Point,
  kind: DropKind,
  breaking: boolean,
  progress: number,
): void {
  const spread = 1 - (1 - progress) ** 2;
  const alpha = 1 - progress;
  for (let i = 0; i < (breaking ? 8 : 6); i++) {
    const angle =
      (i * TAU) / (breaking ? 8 : 6) + (breaking ? progress * 0.58 : -0.4);
    const radius = (breaking ? 24 : 10) + spread * (28 + (i % 3) * 5);
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius - progress * 6;
    const size = (i % 2 ? 3.5 : 5.5) * (1 - 0.58 * progress);
    if (breaking || kind === 'freeze') {
      crystal(g, px, py + size, size * 1.4, size * 2, alpha, breaking);
    } else {
      g.fillStyle(kind === 'lure' ? LURE_INK : GOLD_INK, alpha);
      sparkle(g, px, py, size + 1.3);
      g.fillStyle(i % 2 ? CREAM : DROP_COLORS[kind], alpha);
      sparkle(g, px, py, size);
    }
  }
}
