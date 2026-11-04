import Phaser from 'phaser';
import {
  beaconLanding,
  solid,
  magnetMove,
  pulseTargets,
} from '../../core/engine';
import { BEACON_MS, VECTOR } from '../../core/config';
import type { GameEvent, GameState, Point, Snake } from '../../core/types';
import { ENEMY_SYMBOLS, groupEnemies } from '../feedback';
import {
  CHARACTER_FRAMES,
  APPLE_FRAME,
  CAUGHT_APPLE_FRAME,
} from '../characters';

const CELL = 32,
  INK = 0x3d2c24;
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
  private segments = new Map<number, Phaser.GameObjects.Image[]>();
  private heads = new Map<number, Phaser.GameObjects.Image>();
  private fruit: Phaser.GameObjects.Image;
  private endingMs = 0;
  private graphics: Phaser.GameObjects.Graphics;
  private inspection: Phaser.GameObjects.Graphics;
  private positions = new Map<string, Point>();
  private bursts: Burst[] = [];
  private labels = new Map<number, Phaser.GameObjects.Text>();
  constructor(
    private scene: Phaser.Scene,
    private state: GameState,
  ) {
    const background = scene.add.graphics();
    for (let y = 0; y < state.level.height; y++) {
      for (let x = 0; x < state.level.width; x++) {
        const px = x * CELL,
          py = y * CELL;
        background.fillStyle((x + y) % 2 ? 0xdfe8bb : 0xe3ebc4);
        background.fillRect(px, py, CELL, CELL);
        if (solid(state.level, { x, y })) {
          background.fillStyle(0x8a796b);
          background.fillRoundedRect(px + 1, py + 3, 30, 29, 7);
          background.fillStyle(0xb4a496);
          background.fillRoundedRect(px + 1, py + 1, 30, 27, 7);
          background.lineStyle(2.5, INK);
          background.strokeRoundedRect(px + 1, py + 1, 30, 29, 7);
          background.lineStyle(1.5, 0xd8cbbd, 0.8);
          background.lineBetween(px + 7, py + 6, px + 22, py + 6);
          if ((x * 3 + y) % 4 === 0) {
            background.lineStyle(1, 0x88766a, 0.6);
            background.lineBetween(px + 23, py + 15, px + 19, py + 20);
            background.lineBetween(px + 19, py + 20, px + 22, py + 24);
          }
        } else {
          background.lineStyle(1, 0xb4c28e, 0.38);
          background.strokeRect(px, py, CELL, CELL);
        }
      }
    }
    for (const gate of state.level.gates ?? []) {
      for (const p of [...gate.cells, ...gate.switches]) {
        scene.add
          .text(p.x * CELL + 3, p.y * CELL + 1, gate.id, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px',
            resolution: Math.min(window.devicePixelRatio || 1, 3),
            fontStyle: 'bold',
            color: '#fff5e4',
            backgroundColor: '#66513c',
            padding: { left: 1, right: 1 },
          })
          .setDepth(2);
      }
    }
    this.graphics = scene.add.graphics();
    this.inspection = scene.add.graphics().setDepth(3);
    this.fruit = scene.add
      .image(0, 0, 'characters', APPLE_FRAME)
      .setDisplaySize(48, 48)
      .setDepth(2);
    for (const snake of state.snakes) {
      this.segments.set(
        snake.id,
        Array.from({ length: 4 }, () =>
          scene.add
            .image(0, 0, 'characters', CHARACTER_FRAMES[snake.kind].body)
            .setDepth(0.8)
            .setVisible(false),
        ),
      );
      this.heads.set(
        snake.id,
        scene.add
          .image(0, 0, 'characters', CHARACTER_FRAMES[snake.kind].head)
          .setDisplaySize(56, 56)
          .setDepth(1),
      );
      const style = {
        resolution: Math.min(window.devicePixelRatio || 1, 3),
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#3d2c24',
        backgroundColor: '#fff5e4',
        padding: { left: 2, right: 2 },
      };
      this.labels.set(
        snake.id,
        scene.add.text(0, 0, '', style).setOrigin(0.5, 1).setDepth(3),
      );
    }
    this.draw(100, true);
  }
  events(events: GameEvent[], reducedMotion: boolean): void {
    for (const event of events) {
      if (event.type === 'lost' || event.type === 'won') this.endingMs = 0;
      if (event.type === 'dodge') this.positions.delete('apple');
      if (
        (event.type === 'wall' ||
          event.type === 'dodge' ||
          event.type === 'pulse' ||
          event.type === 'magnet') &&
        !reducedMotion
      )
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
  draw(delta: number, reducedMotion: boolean, inspectingLoss = false): void {
    const ended = this.state.status !== 'playing';
    if (ended) this.endingMs += delta;
    const g = this.graphics;
    g.clear();
    this.inspection.clear();
    this.mechanisms(reducedMotion);
    for (const s of this.state.snakes) {
      this.labels.get(s.id)!.setVisible(false);
      this.heads.get(s.id)!.setVisible(s.alive);
      for (const segment of this.segments.get(s.id)!) segment.setVisible(false);
      if (!s.alive) continue;
      const duration =
        reducedMotion || ended ? 1 : s.phase === 'dashing' ? 32 : 65;
      const head = this.position(`head${s.id}`, s, delta, duration);
      const points = [
        head,
        ...s.body.map((point, i) =>
          this.position(`${s.id}-${i}`, point, delta, duration),
        ),
      ];
      this.body(points, s);
      const caught = this.state.loss?.enemy === s.id && !inspectingLoss;
      const face = this.heads.get(s.id)!;
      face.setFrame(CHARACTER_FRAMES[s.kind][caught ? 'happy' : 'head']);
      face.setPosition(head.x, head.y - 1);
      face.setDisplaySize(56, 56);
      if (s.stunMs) {
        g.lineStyle(2, 0x9478b1, 0.8);
        g.strokeCircle(head.x, head.y, 19);
      }
    }
    const fruitPoint = this.position(
      'apple',
      this.state.apple,
      delta,
      reducedMotion || ended ? 1 : 40,
    );
    this.apple(fruitPoint, reducedMotion, inspectingLoss);
    this.enemyLabels();
    this.bursts = this.bursts.filter((b) => b.life > 0);
    for (const b of this.bursts) {
      b.life -= delta;
      g.lineStyle(
        3,
        b.type === 'wall' ? 0xefac40 : 0xf46c50,
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
    if (this.state.loss && inspectingLoss) this.lossMarker();
  }
  private placeLabel(
    label: Phaser.GameObjects.Text,
    text: string,
    x: number,
    y: number,
  ): void {
    label.setText(text).setVisible(true);
    label.setPosition(
      Phaser.Math.Clamp(
        x,
        label.width / 2 + 2,
        this.state.level.width * CELL - label.width / 2 - 2,
      ),
      Math.max(label.height + 2, y),
    );
  }
  private enemyLabels(): void {
    const alive = this.state.snakes.filter((s) => s.alive);
    for (const group of groupEnemies(alive, (s) => s)) {
      const leader = group.enemies[0]!;
      if (
        this.state.snakes.length === 1 &&
        leader.kind === 'normal' &&
        !leader.elite &&
        !leader.stunMs
      )
        continue;
      const p = this.positions.get(`head${leader.id}`)!;
      this.placeLabel(
        this.labels.get(leader.id)!,
        group.enemies
          .map(
            (s) =>
              `${s.id + 1}${ENEMY_SYMBOLS[s.kind]}${s.elite ? '+' : ''}${s.stunMs ? ' 暂停' : ''}`,
          )
          .join(' / '),
        p.x,
        p.y - 18,
      );
    }
  }
  private lossMarker(): void {
    const loss = this.state.loss!;
    const g = this.inspection;
    for (const p of loss.path) {
      g.lineStyle(3, 0xd79b2e, 0.95);
      g.strokeRoundedRect(p.x * CELL + 3, p.y * CELL + 3, 26, 26, 4);
    }
    const c = center(loss.cell);
    g.lineStyle(4, 0xc34b38);
    g.strokeCircle(c.x, c.y, 16);
    g.lineBetween(c.x - 8, c.y - 8, c.x + 8, c.y + 8);
    g.lineBetween(c.x + 8, c.y - 8, c.x - 8, c.y + 8);
    const snake = this.state.snakes.find((s) => s.id === loss.enemy);
    if (snake) {
      for (const other of this.state.snakes)
        if (other.x === snake.x && other.y === snake.y)
          this.labels.get(other.id)!.setVisible(false);
      this.placeLabel(
        this.labels.get(snake.id)!,
        `${snake.id + 1}${ENEMY_SYMBOLS[snake.kind]} 命中`,
        c.x,
        c.y - 25,
      );
    }
  }
  private mechanisms(reducedMotion: boolean): void {
    const g = this.graphics;
    for (const field of this.state.interference)
      this.interferenceArea(field, false);
    for (const snake of this.state.snakes) {
      if (!snake.alive || !snake.abilityTarget) continue;
      if (snake.phase === 'interfering')
        this.interferenceArea(snake.abilityTarget, true);
      if (snake.phase === 'sidestepping') {
        const c = center(snake.abilityTarget),
          origin = center(snake);
        g.lineStyle(2, 0xbd733c);
        g.strokeRoundedRect(c.x - 13, c.y - 13, 26, 26, 4);
        g.lineBetween(origin.x, origin.y, c.x, c.y);
        g.strokeCircle(c.x, c.y, 4);
      }
    }
    for (const definition of this.state.level.gates ?? []) {
      const gate = this.state.gates.find((s) => s.id === definition.id)!;
      for (const p of definition.switches) {
        const c = center(p);
        g.fillStyle(0xc6c88d);
        g.fillRoundedRect(c.x - 13, c.y - 12, 26, 25, 5);
        g.lineStyle(2, gate.pending !== null ? 0xd79b2e : 0x776747);
        g.strokeRoundedRect(c.x - 12, c.y - 11, 24, 23, 4);
        g.lineBetween(c.x - 7, c.y + 7, c.x + 7, c.y + 7);
      }
      for (const p of definition.cells) {
        const c = center(p);
        g.fillStyle(gate.closed ? 0xb6a77c : 0xd9ddb0, gate.closed ? 1 : 0.6);
        g.fillRoundedRect(c.x - 15, c.y - 15, 30, 30, 3);
        g.lineStyle(3, gate.pending !== null ? 0xd79b2e : 0x776747);
        g.strokeRoundedRect(c.x - 14, c.y - 14, 28, 28, 3);
        g.lineStyle(gate.closed ? 4 : 2, gate.closed ? 0x5c503b : 0x9f9e72);
        if (gate.closed) {
          for (const y of [-5, 3, 11])
            g.lineBetween(c.x - 10, c.y + y, c.x + 10, c.y + y - 8);
        } else {
          g.lineBetween(c.x - 10, c.y - 8, c.x - 10, c.y + 10);
          g.lineBetween(c.x + 10, c.y - 8, c.x + 10, c.y + 10);
        }
        if (gate.pending !== null) {
          g.fillStyle(0xd79b2e);
          g.fillCircle(c.x + 9, c.y - 9, 3);
        }
      }
    }
    const chip = this.state.level.chip;
    if (chip && !this.state.chipCollected) {
      const c = center(chip);
      g.lineStyle(2, 0xd79b2e);
      g.strokeRoundedRect(c.x - 11, c.y - 11, 22, 22, 3);
      g.fillStyle(0xd79b2e);
      g.fillRect(c.x - 6, c.y - 6, 12, 12);
      g.lineStyle(2, INK);
      g.lineBetween(c.x - 3, c.y, c.x + 3, c.y);
      for (const offset of [-6, 0, 6]) {
        g.lineStyle(1, 0xd79b2e);
        g.lineBetween(c.x + offset, c.y - 14, c.x + offset, c.y - 11);
        g.lineBetween(c.x + offset, c.y + 11, c.x + offset, c.y + 14);
      }
    }
    for (const wreck of this.state.wrecks) {
      const c = center(wreck);
      if (wreck.active) {
        g.fillStyle(0x49382d);
        g.fillRoundedRect(c.x - 15, c.y - 14, 30, 29, 4);
        g.fillStyle(0xb8aa8a);
        g.fillRoundedRect(c.x - 13, c.y - 12, 26, 24, 3);
      }
      g.lineStyle(wreck.active ? 3 : 1, 0xd79b2e, wreck.active ? 1 : 0.75);
      g.strokeRoundedRect(c.x - 13, c.y - 12, 26, 24, 3);
      g.lineBetween(c.x - 8, c.y - 7, c.x + 8, c.y + 7);
      g.lineBetween(c.x + 8, c.y - 7, c.x - 8, c.y + 7);
      if (!wreck.active) {
        // 空心框与四角缺口表示仍可通过，不只靠颜色区分。
        g.fillStyle(0xe1e9bf);
        for (const x of [-13, 13])
          for (const y of [-12, 12]) g.fillRect(c.x + x - 3, c.y + y - 3, 6, 6);
      }
    }
    if (
      this.state.utility === 'magnet' &&
      this.state.energy > 0 &&
      this.state.status === 'playing'
    ) {
      const move = magnetMove(this.state);
      if (move) {
        const a = center(move.from),
          b = center(move.to);
        g.lineStyle(2, 0x6b8e48);
        g.strokeRect(b.x - 12, b.y - 12, 24, 24);
        g.lineBetween(a.x, a.y, b.x, b.y);
        g.strokeCircle(b.x, b.y, 4);
      }
    }
    if (
      this.state.utility === 'pulse' &&
      this.state.energy > 0 &&
      this.state.status === 'playing'
    ) {
      for (const s of pulseTargets(this.state)) {
        const c = center(s);
        g.lineStyle(1, 0x6b8e48, 0.65);
        g.strokeCircle(c.x, c.y, 18);
      }
    }
    if (this.state.pulseMs > 0 && this.state.pulseOrigin) {
      const c = center(this.state.pulseOrigin);
      g.lineStyle(2, 0x6b8e48, 0.6);
      g.strokeCircle(
        c.x,
        c.y,
        reducedMotion ? 22 : 20 + (600 - this.state.pulseMs) / 15,
      );
    }
    if (
      this.state.level.beaconEnabled &&
      !this.state.beacon &&
      this.state.energy > 0 &&
      this.state.status === 'playing'
    ) {
      const landing = beaconLanding(this.state),
        c = center(landing);
      g.lineStyle(1, 0x876398, 0.8);
      g.strokeCircle(c.x, c.y, 7);
      for (const sign of [-1, 1]) {
        g.lineBetween(c.x + sign * 5, c.y, c.x + sign * 11, c.y);
        g.lineBetween(c.x, c.y + sign * 5, c.x, c.y + sign * 11);
      }
    }
    if (this.state.beacon) {
      const b = this.state.beacon,
        c = center(b);
      const pulse = reducedMotion ? 0 : (this.state.elapsedMs % 700) / 700;
      g.lineStyle(2, 0x876398, 1 - pulse * 0.7);
      g.strokeCircle(c.x, c.y, 11 + pulse * 15);
      g.fillStyle(0xb1a0c3);
      g.fillCircle(c.x, c.y, 9);
      g.lineStyle(3, 0x876398);
      g.lineBetween(c.x, c.y - 8, c.x, c.y + 8);
      g.lineBetween(c.x - 8, c.y, c.x + 8, c.y);
      g.fillStyle(0xfff7e7);
      g.fillCircle(c.x, c.y, 4);
      g.fillStyle(0x9478b1);
      g.fillRect(c.x - 12, c.y + 13, (24 * b.remainingMs) / BEACON_MS, 3);
    }
  }
  private interferenceArea(point: Point, preparing: boolean): void {
    const g = this.graphics;
    for (const p of [
      point,
      ...Object.values(VECTOR).map((v) => ({
        x: point.x + v.x,
        y: point.y + v.y,
      })),
    ]) {
      if (solid(this.state.level, p)) continue;
      const c = center(p);
      g.fillStyle(0x9478b1, preparing ? 0.08 : 0.22);
      g.fillRect(c.x - 14, c.y - 14, 28, 28);
      g.lineStyle(1, preparing ? 0x9478b1 : 0x9478b1, 0.8);
      g.strokeRect(c.x - 13, c.y - 13, 26, 26);
      for (const offset of [-6, 2, 10])
        g.lineBetween(c.x - 9, c.y + offset, c.x + 9, c.y + offset - 7);
    }
  }
  private body(points: Point[], snake: Snake): void {
    const segments = this.segments.get(snake.id)!;
    for (let i = 0; i < segments.length; i++) {
      const point = points[i + 1];
      if (!point) continue;
      segments[i]!.setVisible(true)
        .setPosition(point.x, point.y - 1)
        .setDisplaySize(50 - i * 2, 50 - i * 2);
    }
  }
  private apple(p: Point, reducedMotion: boolean, inspecting: boolean): void {
    const caught = Boolean(this.state.loss) && !inspecting;
    const t = reducedMotion ? 1 : Math.min(1, this.endingMs / 420);
    this.fruit.setFrame(caught ? CAUGHT_APPLE_FRAME : APPLE_FRAME);
    this.fruit.setDisplaySize(48, 48).setRotation(0).setAlpha(1);
    this.fruit.setPosition(p.x, p.y - 2);
    if (caught) {
      // 一个轻巧的受挫动作，保留可辨认的果形，不叠加诊断框。
      const squash = reducedMotion
        ? 0
        : Math.sin(Math.min(1, this.endingMs / 150) * Math.PI);
      this.fruit.setDisplaySize(48 + squash * 9, 48 - squash * 10);
      this.fruit.setPosition(
        p.x + 10 * t,
        p.y + 6 * t - (reducedMotion ? 0 : Math.sin(t * Math.PI) * 12),
      );
      this.fruit.setRotation(-0.25 * t);
      if (!reducedMotion && t < 1) {
        const g = this.graphics;
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5 - Math.PI / 2,
            distance = 12 + 24 * t;
          const x = p.x + Math.cos(angle) * distance,
            y = p.y + Math.sin(angle) * distance;
          g.lineStyle(2.5, i % 2 ? 0x9aba52 : 0xf2bd58, 1 - t);
          g.lineBetween(x - 2, y, x + 2, y);
          g.lineBetween(x, y - 2, x, y + 2);
        }
      }
    } else {
      const f = VECTOR[this.state.facing],
        side = { x: -f.y, y: f.x },
        g = this.graphics;
      g.fillStyle(0x6a793a, 0.8);
      g.fillTriangle(
        p.x + f.x * 23,
        p.y + f.y * 23,
        p.x + f.x * 19 + side.x * 2.5,
        p.y + f.y * 19 + side.y * 2.5,
        p.x + f.x * 19 - side.x * 2.5,
        p.y + f.y * 19 - side.y * 2.5,
      );
    }
  }
}
