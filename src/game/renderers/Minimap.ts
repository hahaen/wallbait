import type Phaser from 'phaser';
import type { GameState, Point } from '../../core/types';
import { CELL, DROP_COLORS, VIEWPORT } from '../config';

const inset = 8;
const padding = 4;
const origin = inset + padding;
const tile = 1.25;
const scale = tile / CELL;
const snakeColors = { normal: 0x61852d, swift: 0xbe821e, cautious: 0x83629b };

/** 固定在镜头左上角的地图缩略图。 */
export class Minimap {
  private ground: Phaser.GameObjects.Graphics;
  private markers: Phaser.GameObjects.Graphics;
  private width: number;
  private height: number;

  constructor(
    scene: Phaser.Scene,
    private state: GameState,
  ) {
    const { level } = state;
    this.width = level.width * tile;
    this.height = level.height * tile;
    this.ground = scene.add.graphics().setScrollFactor(0).setDepth(4);
    this.markers = scene.add.graphics().setScrollFactor(0).setDepth(5);
    const g = this.ground;
    const width = this.width + padding * 2;
    const height = this.height + padding * 2;
    g.fillStyle(0xfff5dc);
    g.fillRoundedRect(inset, inset, width, height, 6);
    g.lineStyle(1.5, 0x634a39);
    g.strokeRoundedRect(inset, inset, width, height, 6);
    g.fillStyle(0xe6ecc6);
    g.fillRect(origin, origin, this.width, this.height);
    g.fillStyle(0x8c7865);
    g.fillRect(origin, origin, this.width, tile);
    g.fillRect(origin, origin + this.height - tile, this.width, tile);
    g.fillRect(origin, origin + tile, tile, this.height - 2 * tile);
    g.fillRect(
      origin + this.width - tile,
      origin + tile,
      tile,
      this.height - 2 * tile,
    );
    for (const wall of level.walls)
      g.fillRect(origin + wall.x * tile, origin + wall.y * tile, tile, tile);
  }

  draw(
    fruit: Point,
    left: number,
    top: number,
    snakePosition: (id: number) => Point,
  ): void {
    const g = this.markers;
    const choice = this.state.endless?.waveChoice;
    g.clear();
    const opacity = (x: number, y: number): number => {
      const gap = Math.max(
        inset - x - 22,
        x - 22 - (origin + this.width + padding),
        inset - y - 22,
        y - 22 - (origin + this.height + padding),
      );
      return 0.16 + 0.84 * Math.min(1, Math.max(0, gap / 16));
    };
    let alpha = opacity(fruit.x - left, fruit.y - top);

    for (const gate of this.state.level.gates ?? []) {
      const closed = this.state.gates.find((g) => g.id === gate.id)?.closed;
      g.fillStyle(closed ? 0x805137 : 0x79984e);
      for (const cell of gate.cells)
        g.fillRect(origin + cell.x * tile, origin + cell.y * tile, tile, tile);
    }
    g.fillStyle(0xc18a39);
    for (const wreck of this.state.wrecks)
      if (wreck.active)
        g.fillRect(
          origin + wreck.x * tile,
          origin + wreck.y * tile,
          tile,
          tile,
        );

    const x = origin + left * scale;
    const y = origin + top * scale;
    g.lineStyle(1, 0x59462f, choice ? 0.35 : 1);
    g.strokeRect(x, y, VIEWPORT.width * scale, VIEWPORT.height * scale);
    choice?.regions.forEach((region, i) => {
      const selected = i === choice.selected;
      const color = selected ? 0x6a3f83 : 0x486473;
      const x = origin + region.x * tile + 1;
      const y = origin + region.y * tile + 1;
      const width = region.width * tile - 2;
      const height = region.height * tile - 2;
      g.fillStyle(color, selected ? 0.3 : 0.12);
      g.fillRect(x, y, width, height);
      g.lineStyle(selected ? 2.15 : 1.35, color);
      g.strokeRect(x, y, width, height);
    });
    const drop = this.state.endless?.drop;
    if (drop) {
      const x = origin + (drop.x + 0.5) * tile;
      const y = origin + (drop.y + 0.5) * tile;
      g.fillStyle(DROP_COLORS[drop.kind]);
      g.fillRect(x - 2, y - 2, 4, 4);
      g.lineStyle(1, 0x59462f);
      g.strokeRect(x - 2, y - 2, 4, 4);
    }
    for (const snake of this.state.snakes) {
      if (!snake.alive) continue;
      const { x, y } = snakePosition(snake.id);
      alpha = Math.min(alpha, opacity(x - left, y - top));
      g.fillStyle(snakeColors[snake.kind]);
      g.fillCircle(origin + x * scale, origin + y * scale, 1.8);
    }
    g.fillStyle(0xfff8e6);
    g.fillCircle(origin + fruit.x * scale, origin + fruit.y * scale, 3.7);
    g.fillStyle(0xc93425);
    g.fillCircle(origin + fruit.x * scale, origin + fruit.y * scale, 2.8);
    this.ground.setAlpha(alpha);
    g.setAlpha(choice ? 1 : alpha);
  }
}
