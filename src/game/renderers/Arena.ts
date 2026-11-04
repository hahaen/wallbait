import Phaser from 'phaser';
import { solid, warningPath } from '../../core/engine';
import { BEACON_MS, RECHARGE_MS, VECTOR } from '../../core/config';
import type {
  Direction,
  GameEvent,
  GameState,
  Point,
  Snake,
} from '../../core/types';

const CELL = 32,
  INK = 0x0b202b;
const COLORS = { normal: 0xffba66, swift: 0xf58e7c, cautious: 0xc6a1f2 };
const center = (p: Point): Point => ({
  x: (p.x + 0.5) * CELL,
  y: (p.y + 0.5) * CELL,
});
interface Burst extends Point {
  life: number;
  type: GameEvent['type'];
}

/** 只读规则状态：画面插值从不参与碰撞或计时。 */
export class Arena {
  private graphics: Phaser.GameObjects.Graphics;
  private positions = new Map<string, Point>();
  private bursts: Burst[] = [];
  constructor(
    private scene: Phaser.Scene,
    private state: GameState,
  ) {
    const background = scene.add.graphics();
    for (let y = 0; y < state.level.height; y++) {
      for (let x = 0; x < state.level.width; x++) {
        if (solid(state.level, { x, y })) {
          background.fillStyle(0x0b202b);
          background.fillRoundedRect(x * CELL + 1, y * CELL + 2, 30, 30, 5);
          background.fillStyle(0x4e6570);
          background.fillRoundedRect(x * CELL + 2, y * CELL + 1, 28, 26, 4);
          background.lineStyle(2, 0x80949a);
          background.lineBetween(
            x * CELL + 7,
            y * CELL + 6,
            x * CELL + 25,
            y * CELL + 6,
          );
          background.fillStyle(0x29404c);
          background.fillCircle(x * CELL + 7, y * CELL + 22, 2);
        } else {
          background.fillStyle((x + y) % 2 ? 0x193440 : 0x1d3945);
          background.fillRect(x * CELL, y * CELL, CELL, CELL);
          background.lineStyle(1, 0x36515b, 0.45);
          background.strokeRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }
    for (const gate of state.level.gates ?? []) {
      for (const p of [...gate.cells, ...gate.switches]) {
        scene.add
          .text(p.x * CELL + 3, p.y * CELL + 1, gate.id, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            color: '#f1fff6',
            backgroundColor: '#15343c',
            padding: { left: 1, right: 1 },
          })
          .setDepth(2);
      }
    }
    this.graphics = scene.add.graphics();
    this.draw(100, true);
  }
  events(events: GameEvent[], reducedMotion: boolean): void {
    for (const event of events) {
      if (event.type === 'dodge') this.positions.delete('apple');
      if ((event.type === 'wall' || event.type === 'dodge') && !reducedMotion)
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
    this.mechanisms(reducedMotion);
    for (const s of this.state.snakes)
      if (s.alive && (s.phase === 'charging' || s.phase === 'dashing'))
        this.warning(s);
    for (const s of this.state.snakes) {
      if (!s.alive) continue;
      const duration = reducedMotion ? 1 : s.phase === 'dashing' ? 20 : 65;
      for (let i = s.body.length - 1; i >= 0; i--) {
        const p = this.position(`${s.id}-${i}`, s.body[i]!, delta, duration);
        const size = 17 - i * 2;
        g.fillStyle(INK);
        g.fillRoundedRect(
          p.x - size / 2 - 1,
          p.y - size / 2,
          size + 2,
          size + 3,
          4,
        );
        g.fillStyle(COLORS[s.kind], 0.65);
        g.fillRoundedRect(p.x - size / 2, p.y - size / 2, size, size, 3);
        g.lineStyle(2, INK, 0.7);
        g.lineBetween(p.x - size / 2 + 3, p.y, p.x + size / 2 - 3, p.y);
      }
      this.snake(s, this.position(`head${s.id}`, s, delta, duration));
    }
    this.robot(
      this.position('apple', this.state.apple, delta, reducedMotion ? 1 : 40),
    );
    this.bursts = this.bursts.filter((b) => b.life > 0);
    for (const b of this.bursts) {
      b.life -= delta;
      g.lineStyle(
        3,
        b.type === 'wall' ? 0xffd486 : 0x9effdb,
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
  private mechanisms(reducedMotion: boolean): void {
    const g = this.graphics;
    for (const definition of this.state.level.gates ?? []) {
      const gate = this.state.gates.find((s) => s.id === definition.id)!;
      for (const p of definition.switches) {
        const c = center(p);
        g.fillStyle(0x294e54);
        g.fillRoundedRect(c.x - 13, c.y - 12, 26, 25, 5);
        g.lineStyle(2, gate.pending !== null ? 0xffd486 : 0x80e9cf);
        g.strokeRoundedRect(c.x - 12, c.y - 11, 24, 23, 4);
        g.lineBetween(c.x - 7, c.y + 7, c.x + 7, c.y + 7);
      }
      for (const p of definition.cells) {
        const c = center(p);
        g.fillStyle(gate.closed ? 0x436f72 : 0x244b53, gate.closed ? 1 : 0.6);
        g.fillRoundedRect(c.x - 15, c.y - 15, 30, 30, 3);
        g.lineStyle(3, gate.pending !== null ? 0xffd486 : 0x80e9cf);
        g.strokeRoundedRect(c.x - 14, c.y - 14, 28, 28, 3);
        g.lineStyle(gate.closed ? 4 : 2, gate.closed ? 0xc0eadc : 0x66918c);
        if (gate.closed) {
          for (const y of [-5, 3, 11])
            g.lineBetween(c.x - 10, c.y + y, c.x + 10, c.y + y - 8);
        } else {
          g.lineBetween(c.x - 10, c.y - 8, c.x - 10, c.y + 10);
          g.lineBetween(c.x + 10, c.y - 8, c.x + 10, c.y + 10);
        }
        if (gate.pending !== null) {
          g.fillStyle(0xffd486);
          g.fillCircle(c.x + 9, c.y - 9, 3);
        }
      }
    }
    if (this.state.beacon) {
      const b = this.state.beacon,
        c = center(b);
      const pulse = reducedMotion ? 0 : (this.state.elapsedMs % 700) / 700;
      g.lineStyle(2, 0xd2b1ff, 1 - pulse * 0.7);
      g.strokeCircle(c.x, c.y, 11 + pulse * 15);
      g.fillStyle(0x342d52);
      g.fillCircle(c.x, c.y, 9);
      g.lineStyle(3, 0xd4b4ff);
      g.lineBetween(c.x, c.y - 8, c.x, c.y + 8);
      g.lineBetween(c.x - 8, c.y, c.x + 8, c.y);
      g.fillStyle(0xf4e6ff);
      g.fillCircle(c.x, c.y, 4);
      g.fillStyle(0xc6a1f2);
      g.fillRect(c.x - 12, c.y + 13, (24 * b.remainingMs) / BEACON_MS, 3);
    }
  }
  private warning(s: Snake): void {
    const g = this.graphics,
      vector = VECTOR[s.locked];
    for (const p of warningPath(this.state, s)) {
      const c = center(p),
        side = { x: -vector.y, y: vector.x };
      g.fillStyle(0xffad4f, s.phase === 'charging' ? 0.42 : 0.65);
      g.fillRect(p.x * CELL + 1, p.y * CELL + 1, 30, 30);
      g.lineStyle(3, 0xffdd92, 0.95);
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
      g.fillRoundedRect(c.x - 15, c.y - 23, 30, 5, 2);
      g.fillStyle(0xffcf70);
      g.fillRoundedRect(
        c.x - 14,
        c.y - 22,
        28 * (1 - s.timer / s.rules.chargeMs),
        3,
        1,
      );
    }
  }
  private snake(s: Snake, p: Point): void {
    const g = this.graphics;
    g.fillStyle(INK);
    g.fillRoundedRect(p.x - 15, p.y - 13, 30, 29, 7);
    g.fillStyle(COLORS[s.kind]);
    if (s.kind === 'cautious') {
      g.fillPoints(
        [
          { x: p.x, y: p.y - 16 },
          { x: p.x + 15, y: p.y },
          { x: p.x, y: p.y + 15 },
          { x: p.x - 15, y: p.y },
        ],
        true,
      );
    } else if (s.kind === 'swift') {
      g.fillRoundedRect(p.x - 13, p.y - 13, 26, 26, 3);
    } else g.fillRoundedRect(p.x - 13, p.y - 13, 26, 26, 7);
    const direction: Direction =
      s.phase === 'charging' || s.phase === 'dashing' ? s.locked : s.facing;
    const f = VECTOR[direction],
      side = { x: -f.y, y: f.x };
    for (const sign of [-1, 1]) {
      const x = p.x + f.x * 7 + side.x * sign * 6,
        y = p.y + f.y * 7 + side.y * sign * 6;
      g.fillStyle(INK);
      g.fillCircle(x, y, 3.5);
      g.fillStyle(0xfff8d8);
      g.fillCircle(x + f.x, y + f.y, 1.5);
    }
    g.lineStyle(2.5, INK);
    if (s.kind === 'swift') {
      g.beginPath();
      g.moveTo(p.x + 1, p.y - 7);
      g.lineTo(p.x - 4, p.y);
      g.lineTo(p.x + 3, p.y);
      g.lineTo(p.x - 1, p.y + 6);
      g.strokePath();
    } else if (s.kind === 'cautious') {
      g.strokeCircle(p.x, p.y, 4);
    } else {
      g.lineBetween(
        p.x - f.x * 5 + side.x * 4,
        p.y - f.y * 5 + side.y * 4,
        p.x - f.x,
        p.y - f.y,
      );
      g.lineBetween(
        p.x - f.x,
        p.y - f.y,
        p.x - f.x * 5 - side.x * 4,
        p.y - f.y * 5 - side.y * 4,
      );
    }
    if (s.phase === 'recovering') {
      g.lineStyle(2, 0xb7d3e3, 0.9);
      g.lineBetween(p.x - 10, p.y + 17, p.x + 10, p.y + 17);
    }
  }
  private robot(p: Point): void {
    const g = this.graphics,
      f = VECTOR[this.state.facing];
    g.fillStyle(INK, 0.6);
    g.fillEllipse(p.x, p.y + 13, 28, 10);
    g.fillStyle(0x9af3d4);
    g.fillRoundedRect(p.x - 11, p.y + 7, 7, 9, 2);
    g.fillRoundedRect(p.x + 4, p.y + 7, 7, 9, 2);
    g.fillStyle(INK);
    g.fillRoundedRect(p.x - 15, p.y - 13, 30, 28, 8);
    g.fillStyle(0x67e4b7);
    g.fillRoundedRect(p.x - 13, p.y - 13, 26, 25, 7);
    g.fillStyle(0x183e49);
    g.fillRoundedRect(p.x - 10, p.y - 7, 20, 12, 4);
    g.fillStyle(0xe7fff5);
    g.fillRoundedRect(p.x - 6, p.y - 4, 3, 6, 1);
    g.fillRoundedRect(p.x + 3, p.y - 4, 3, 6, 1);
    g.lineStyle(2, 0x67e4b7);
    g.lineBetween(p.x, p.y - 12, p.x, p.y - 18);
    g.fillStyle(0xffdf89);
    g.fillCircle(p.x, p.y - 18, 3);
    // 小白三角显示朝向：截击者预测的正是这条轴线。
    const side = { x: -f.y, y: f.x };
    g.fillStyle(0xdcfff1);
    g.fillTriangle(
      p.x + f.x * 21,
      p.y + f.y * 21,
      p.x + f.x * 16 + side.x * 3,
      p.y + f.y * 16 + side.y * 3,
      p.x + f.x * 16 - side.x * 3,
      p.y + f.y * 16 - side.y * 3,
    );
    if (this.state.energy < 2) {
      g.fillStyle(0x0a2731);
      g.fillRect(p.x - 10, p.y + 17, 20, 2);
      g.fillStyle(0x6ce4b8);
      g.fillRect(
        p.x - 10,
        p.y + 17,
        (20 * this.state.rechargeMs) / RECHARGE_MS,
        2,
      );
    }
  }
}
