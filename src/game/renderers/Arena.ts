import Phaser from 'phaser';
import { ahead, solid } from '../../core/engine';
import { VECTOR } from '../../core/config';
import type {
  Direction,
  GameEvent,
  GameState,
  Point,
  Snake,
} from '../../core/types';

const CELL = 32,
  INK = 0x3d3528;
const center = (p: Point): Point => ({
  x: (p.x + 0.5) * CELL,
  y: (p.y + 0.5) * CELL,
});
interface Burst extends Point {
  life: number;
  type: GameEvent['type'];
}
export class Arena {
  private graphics: Phaser.GameObjects.Graphics;
  private positions = new Map<string, Point>();
  private bursts: Burst[] = [];
  constructor(
    private scene: Phaser.Scene,
    private state: GameState,
  ) {
    const background = scene.add.graphics();
    for (let y = 0; y < state.level.height; y++)
      for (let x = 0; x < state.level.width; x++) {
        if (solid(state.level, { x, y })) {
          background.fillStyle(0x615e4d);
          background.fillRoundedRect(x * CELL + 1, y * CELL + 2, 30, 30, 6);
          background.fillStyle(0xaaa68c);
          background.fillRoundedRect(x * CELL + 3, y * CELL + 2, 26, 24, 5);
          background.lineStyle(2, 0xc9c5aa);
          background.lineBetween(
            x * CELL + 7,
            y * CELL + 7,
            x * CELL + 23,
            y * CELL + 7,
          );
        } else {
          background.fillStyle((x + y) % 2 ? 0xe3eabf : 0xdce5b5);
          background.fillRect(x * CELL, y * CELL, CELL, CELL);
          background.lineStyle(1, 0xc9d69c, 0.45);
          background.strokeRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    this.graphics = scene.add.graphics();
    this.draw(100, true);
  }
  events(events: GameEvent[], reducedMotion: boolean): void {
    for (const event of events) {
      if (event.type === 'wall' || event.type === 'dodge')
        this.bursts.push({ ...center(event), type: event.type, life: 360 });
      if (event.type === 'wall' && !reducedMotion)
        this.scene.cameras.main.shake(100, 0.004);
    }
  }
  private position(
    key: string,
    point: Point,
    delta: number,
    duration: number,
  ): Point {
    const target = center(point),
      current = this.positions.get(key) ?? target;
    const factor = Math.min(1, delta / duration);
    const result = {
      x: current.x + (target.x - current.x) * factor,
      y: current.y + (target.y - current.y) * factor,
    };
    this.positions.set(key, result);
    return result;
  }
  draw(delta: number, reducedMotion: boolean): void {
    const g = this.graphics;
    g.clear();
    for (const s of this.state.snakes)
      if (s.alive && (s.phase === 'charging' || s.phase === 'dashing'))
        this.warning(s);
    for (const s of this.state.snakes)
      if (s.alive) {
        const duration = reducedMotion ? 1 : s.phase === 'dashing' ? 20 : 65;
        for (let i = s.body.length - 1; i >= 0; i--) {
          const p = this.position(`${s.id}-${i}`, s.body[i]!, delta, duration);
          g.fillStyle(INK);
          g.fillCircle(p.x, p.y + 2, 11 - i * 0.7);
          g.fillStyle(
            s.kind === 'swift'
              ? 0x4c9251
              : s.kind === 'cautious'
                ? 0x91a855
                : 0xa8c955,
          );
          g.fillCircle(p.x, p.y, 9 - i * 0.7);
        }
        this.snake(s, this.position(`head${s.id}`, s, delta, duration));
      }
    this.apple(
      this.position('apple', this.state.apple, delta, reducedMotion ? 1 : 40),
    );
    this.bursts = this.bursts.filter((b) => b.life > 0);
    for (const b of this.bursts) {
      b.life -= delta;
      g.lineStyle(
        3,
        b.type === 'wall' ? 0xfff1ad : 0xffffff,
        Math.max(0, b.life / 360),
      );
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4,
          radius = 12 + (360 - b.life) / 12;
        g.lineBetween(
          b.x + Math.cos(angle) * radius,
          b.y + Math.sin(angle) * radius,
          b.x + Math.cos(angle) * (radius + 7),
          b.y + Math.sin(angle) * (radius + 7),
        );
      }
    }
  }
  private warning(s: Snake): void {
    const g = this.graphics,
      vector = VECTOR[s.locked];
    let p: Point = s;
    const length = s.phase === 'charging' ? s.rules.dashCells : s.remaining;
    for (let i = 0; i < length; i++) {
      p = ahead(p, s.locked);
      if (solid(this.state.level, p)) break;
      const c = center(p);
      g.fillStyle(0xf2a136, s.phase === 'charging' ? 0.48 : 0.7);
      g.fillRect(p.x * CELL + 1, p.y * CELL + 1, 30, 30);
      g.lineStyle(3, 0x9b4c1d, 0.8);
      const side = { x: -vector.y, y: vector.x };
      g.beginPath();
      g.moveTo(
        c.x - vector.x * 6 + side.x * 6,
        c.y - vector.y * 6 + side.y * 6,
      );
      g.lineTo(c.x + vector.x * 4, c.y + vector.y * 4);
      g.lineTo(
        c.x - vector.x * 6 - side.x * 6,
        c.y - vector.y * 6 - side.y * 6,
      );
      g.strokePath();
    }
    if (s.phase === 'charging') {
      const c = center(s);
      g.fillStyle(INK);
      g.fillRoundedRect(c.x - 15, c.y - 24, 30, 5, 2);
      g.fillStyle(0xf9bd42);
      g.fillRoundedRect(
        c.x - 14,
        c.y - 23,
        28 * (1 - s.timer / s.rules.chargeMs),
        3,
        1,
      );
    }
  }
  private snake(s: Snake, p: Point): void {
    const g = this.graphics;
    g.fillStyle(INK);
    g.fillCircle(p.x, p.y + 2, 15);
    g.fillStyle(
      s.kind === 'swift'
        ? 0x4d9e65
        : s.kind === 'cautious'
          ? 0x9aaa58
          : 0xafd35b,
    );
    g.fillCircle(p.x, p.y - 1, 13);
    g.fillStyle(0xdaf2a1, 0.7);
    g.fillEllipse(p.x - 4, p.y - 7, 13, 5);
    const direction: Direction =
      s.phase === 'charging' || s.phase === 'dashing' ? s.locked : s.facing;
    const f = VECTOR[direction],
      side = { x: -f.y, y: f.x };
    for (const sign of [-1, 1]) {
      const x = p.x + f.x * 6 + side.x * sign * 6,
        y = p.y + f.y * 6 + side.y * sign * 6;
      g.fillStyle(0xfffae7);
      g.fillCircle(x, y, 4);
      g.fillStyle(INK);
      g.fillCircle(x + f.x, y + f.y, 2.5);
      if (s.kind === 'cautious') {
        g.lineStyle(2, INK);
        g.lineBetween(x - 3, y - 5, x + 3, y - 5);
      }
    }
    if (s.kind === 'swift') {
      g.lineStyle(2, 0xffeb84);
      g.beginPath();
      g.moveTo(p.x - 6, p.y - 3);
      g.lineTo(p.x, p.y);
      g.lineTo(p.x - 3, p.y + 3);
      g.lineTo(p.x + 4, p.y + 5);
      g.strokePath();
    }
    if (s.phase === 'recovering') {
      g.lineStyle(2, INK, 0.5);
      g.lineBetween(p.x - 4, p.y + 8, p.x + 4, p.y + 8);
    }
  }
  private apple(p: Point): void {
    const g = this.graphics;
    g.fillStyle(0x777b4b, 0.2);
    g.fillEllipse(p.x, p.y + 12, 28, 10);
    g.fillStyle(INK);
    g.fillCircle(p.x - 5, p.y + 1, 12);
    g.fillCircle(p.x + 5, p.y + 1, 12);
    g.fillStyle(0xec6348);
    g.fillCircle(p.x - 5, p.y, 10);
    g.fillCircle(p.x + 5, p.y, 10);
    g.fillEllipse(p.x, p.y + 5, 23, 15);
    g.lineStyle(3, INK);
    g.lineBetween(p.x, p.y - 9, p.x - 1, p.y - 17);
    g.fillStyle(0x4f7d3c);
    g.fillEllipse(p.x + 6, p.y - 14, 12, 6);
    g.fillStyle(0xffecd8);
    g.fillEllipse(p.x - 9, p.y - 4, 4, 7);
    g.fillStyle(INK);
    g.fillCircle(p.x - 4, p.y + 1, 1.7);
    g.fillCircle(p.x + 5, p.y + 1, 1.7);
    g.lineStyle(1.8, INK);
    g.beginPath();
    g.moveTo(p.x - 2, p.y + 6);
    g.lineTo(p.x + 1, p.y + 8);
    g.lineTo(p.x + 4, p.y + 6);
    g.strokePath();
  }
}
