import Phaser from 'phaser';
import {
  beaconLanding,
  same,
  solid,
  magnetMove,
  pulseTargets,
} from '../../core/engine';
import { BEACON_MS, VECTOR } from '../../core/config';
import type {
  DropKind,
  GameEvent,
  GameState,
  Point,
  Snake,
} from '../../core/types';
import { wallContains } from '../../core/walls';
import { groupEnemies } from '../feedback';
import { CELL, DROP_COLORS, VIEWPORT } from '../config';
import { Minimap } from './Minimap';
import {
  drawDropBurst,
  drawFrost,
  drawLure,
  drawShield,
  DROP_BURST_MS,
} from './dropEffects';
import {
  CHARACTER_FRAMES,
  APPLE_FRAME,
  CAUGHT_APPLE_FRAME,
} from '../characters';

const INK = 0x3d2c24;
const center = (p: Point): Point => ({
  x: (p.x + 0.5) * CELL,
  y: (p.y + 0.5) * CELL,
});
interface Burst extends Point {
  life: number;
  type: GameEvent['type'];
  kind?: DropKind;
}

/** 只读规则状态：画面插值从不参与碰撞或计时。 */
export class Arena {
  private segments = new Map<number, Phaser.GameObjects.Image[]>();
  private heads = new Map<number, Phaser.GameObjects.Image>();
  private snakes?: Snake[];
  private fruit: Phaser.GameObjects.Image;
  private fruitFrom: Point;
  private fruitTarget: Point;
  private fruitMoveStartedMs = 0;
  private fruitMoveDurationMs = 0;
  private fruitElapsedMs = 0;
  private endingMs = 0;
  private graphics: Phaser.GameObjects.Graphics;
  private accents: Phaser.GameObjects.Graphics;
  private inspection: Phaser.GameObjects.Graphics;
  private signals: Phaser.GameObjects.Graphics;
  private minimap?: Minimap;
  private positions = new Map<string, Point>();
  private bursts: Burst[] = [];
  constructor(
    private scene: Phaser.Scene,
    private state: GameState,
  ) {
    const background = scene.add.graphics();
    const outlines = state.level.wallOutlines ?? [];
    this.fruitFrom = this.fruitTarget = state.apple;
    for (let y = 0; y < state.level.height; y++) {
      for (let x = 0; x < state.level.width; x++) {
        const px = x * CELL,
          py = y * CELL;
        background.fillStyle((x + y) % 2 ? 0xdfe8bb : 0xe3ebc4);
        background.fillRect(px, py, CELL, CELL);
        if (
          solid(state.level, { x, y }) &&
          !outlines.some((outline) => wallContains(outline, { x, y }))
        ) {
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
    for (const outline of outlines) {
      const points = outline.map(({ x, y }) => ({ x: x * CELL, y: y * CELL }));
      background.fillStyle(0x8a796b);
      background.fillPoints(
        points.map(({ x, y }) => ({ x, y: y + 2 })),
        true,
      );
      background.fillStyle(0xb4a496);
      background.fillPoints(points, true);
      background.lineStyle(2.5, INK);
      background.strokePoints(points, true);
      background.lineStyle(1.5, 0xd8cbbd, 0.9);
      for (const [i, a] of points.entries()) {
        const b = points[(i + 1) % points.length]!;
        const dx = b.x - a.x,
          dy = b.y - a.y,
          length = Math.hypot(dx, dy);
        if (dx < 10) continue;
        // 顺时针轮廓的朝上石面有一条向内收的亮边。
        const insetX = (-dy * 4) / length,
          insetY = (dx * 4) / length;
        background.lineBetween(
          a.x + dx * 0.18 + insetX,
          a.y + dy * 0.18 + insetY,
          b.x - dx * 0.18 + insetX,
          b.y - dy * 0.18 + insetY,
        );
      }
    }
    if (state.endless) {
      // 一局只绘制一次静态大地图，逐帧仅移动贴图和绘制动态物体。
      background.generateTexture(
        'endless-ground',
        state.level.width * CELL,
        state.level.height * CELL,
      );
      background.destroy();
      scene.add.image(0, 0, 'endless-ground').setOrigin(0).setDepth(-1);
      this.minimap = new Minimap(scene, state);
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
    this.accents = scene.add.graphics().setDepth(2.25);
    this.inspection = scene.add.graphics().setDepth(3);
    this.signals = scene.add.graphics().setDepth(2.5);
    this.fruit = scene.add
      .image(0, 0, 'characters', APPLE_FRAME)
      .setDisplaySize(48, 48)
      .setDepth(2);
    this.draw(100, true);
  }
  private syncSnakes(): void {
    if (this.snakes === this.state.snakes) return;
    for (const head of this.heads.values()) head.destroy();
    for (const segments of this.segments.values())
      for (const segment of segments) segment.destroy();
    this.heads.clear();
    this.segments.clear();
    this.positions.clear();
    this.snakes = this.state.snakes;
    for (const snake of this.snakes) {
      this.segments.set(
        snake.id,
        Array.from({ length: 4 }, () =>
          this.scene.add
            .image(0, 0, 'characters', CHARACTER_FRAMES[snake.kind].body)
            .setDepth(0.8)
            .setVisible(false),
        ),
      );
      this.heads.set(
        snake.id,
        this.scene.add
          .image(0, 0, 'characters', CHARACTER_FRAMES[snake.kind].head)
          .setDisplaySize(56, 56)
          .setDepth(1),
      );
    }
  }
  afterStep(reducedMotion: boolean): void {
    if (!same(this.state.apple, this.fruitTarget)) {
      this.fruitFrom = this.fruitTarget;
      this.fruitTarget = this.state.apple;
      this.fruitMoveStartedMs = this.state.elapsedMs;
      this.fruitMoveDurationMs = this.state.moveTimer;
      this.fruitElapsedMs = 0;
    }
    for (const event of this.state.events) {
      if (event.type === 'lost' || event.type === 'won') this.endingMs = 0;
      if (event.type === 'dodge')
        this.fruitFrom = this.fruitTarget = this.state.apple;
      if (
        (event.type === 'pickup' || event.type === 'shield-break') &&
        !reducedMotion
      ) {
        this.bursts.push({
          ...center(event),
          type: event.type,
          kind: event.type === 'pickup' ? event.kind : 'shield',
          life: DROP_BURST_MS,
        });
      } else if (
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
  private fruitPosition(stepRemainderMs: number, snap: boolean): Point {
    if (snap) this.fruitFrom = this.fruitTarget;
    const to = center(this.fruitTarget);
    if (same(this.fruitFrom, this.fruitTarget)) return to;
    // 固定步时钟覆盖整段移动，暂停恢复时保留已绘制的进度。
    this.fruitElapsedMs = Math.max(
      this.fruitElapsedMs,
      this.state.elapsedMs - this.fruitMoveStartedMs + stepRemainderMs,
    );
    const t = Math.min(1, this.fruitElapsedMs / this.fruitMoveDurationMs);
    const from = center(this.fruitFrom);
    return {
      x: Phaser.Math.Linear(from.x, to.x, t),
      y: Phaser.Math.Linear(from.y, to.y, t),
    };
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
  draw(
    delta: number,
    reducedMotion: boolean,
    inspectingLoss = false,
    stepRemainderMs = 0,
  ): void {
    this.syncSnakes();
    const ended = this.state.status !== 'playing';
    if (ended) this.endingMs += delta;
    const g = this.graphics;
    g.clear();
    this.accents.clear();
    this.inspection.clear();
    this.signals.clear();
    this.mechanisms(reducedMotion);
    const freezeMs = inspectingLoss ? 0 : (this.state.endless?.freezeMs ?? 0);
    for (const s of this.state.snakes) {
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
      if (freezeMs) {
        face.setTint(0xd4efff);
        drawFrost(g, this.accents, head, freezeMs, reducedMotion || ended);
      } else {
        if (face.isTinted) face.clearTint();
        if (s.stunMs) {
          g.fillStyle(0xa6dff3, 0.6);
          g.fillCircle(head.x, head.y, 24);
          g.lineStyle(3, 0x4d92ac);
          g.strokeCircle(head.x, head.y, 24);
        }
      }
    }
    const fruitPoint = this.fruitPosition(
      stepRemainderMs,
      reducedMotion || ended,
    );
    if (this.state.endless) this.followFruit(fruitPoint, !ended);
    this.apple(fruitPoint, reducedMotion, inspectingLoss);
    this.enemyBadges();
    this.bursts = this.bursts.filter((b) => b.life > 0);
    for (const b of this.bursts) {
      b.life -= delta;
      if (b.kind) {
        if (!reducedMotion && !inspectingLoss && b.life > 0)
          drawDropBurst(
            this.accents,
            b,
            b.kind,
            b.type === 'shield-break',
            1 - b.life / DROP_BURST_MS,
          );
        continue;
      }
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
  private followFruit(fruit: Point, showEnemies: boolean): void {
    const { width, height } = VIEWPORT;
    const left = Phaser.Math.Clamp(
      fruit.x - width / 2,
      0,
      this.state.level.width * CELL - width,
    );
    const top = Phaser.Math.Clamp(
      fruit.y - height / 2,
      0,
      this.state.level.height * CELL - height,
    );
    this.scene.cameras.main.setScroll(left, top);
    this.minimap?.draw(fruit, left, top, (id) =>
      this.positions.get(`head${id}`)!,
    );
    if (!showEnemies) return;
    // 只标记已经进场的蛇的位置；不会提示直冲方向或路径。
    for (const snake of this.state.snakes) {
      if (!snake.alive) continue;
      const p = this.positions.get(`head${snake.id}`)!;
      if (
        p.x >= left &&
        p.x <= left + width &&
        p.y >= top &&
        p.y <= top + height
      )
        continue;
      const x = Phaser.Math.Clamp(p.x, left + 13, left + width - 13);
      const y = Phaser.Math.Clamp(p.y, top + 13, top + height - 13);
      const angle = Math.atan2(p.y - y, p.x - x);
      const points = [0, 2.4, -2.4].map((offset) => ({
        x: x + Math.cos(angle + offset) * 8,
        y: y + Math.sin(angle + offset) * 8,
      }));
      this.signals.fillStyle(
        { normal: 0xb5d98d, swift: 0xf7d78b, cautious: 0xd4bce8 }[snake.kind],
      );
      this.signals.lineStyle(1.8, INK);
      this.signals.fillPoints(points, true);
      this.signals.strokePoints(points, true);
    }
  }
  private enemyBadges(): void {
    const alive = this.state.snakes.filter((s) => s.alive);
    for (const group of groupEnemies(alive, (s) => s)) {
      if (!group.enemies.some((s) => s.elite)) continue;
      const p = this.positions.get(`head${group.enemies[0]!.id}`)!;
      const x = Phaser.Math.Clamp(
          p.x + 20,
          CELL + 7,
          (this.state.level.width - 1) * CELL - 7,
        ),
        y = Math.max(p.y - 14, CELL + 7);
      // 用小星星表示强化，不把编号、类型或状态文字贴在豆豆身上。
      const points = Array.from({ length: 10 }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5,
          radius = i % 2 ? 2.7 : 5.8;
        return {
          x: x + Math.cos(angle) * radius,
          y: y + Math.sin(angle) * radius,
        };
      });
      this.signals.fillStyle(0xffd56a);
      this.signals.lineStyle(1.4, 0x896137);
      this.signals.fillPoints(points, true);
      this.signals.strokePoints(points, true);
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
  }
  private mechanisms(reducedMotion: boolean): void {
    const g = this.graphics;
    const drop = this.state.endless?.drop;
    if (drop) this.dropMarker(center(drop), drop.kind);
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
      if (this.state.endless) {
        drawLure(
          g,
          c,
          b.remainingMs,
          reducedMotion || this.state.status !== 'playing',
        );
        return;
      }
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
  private dropMarker({ x, y }: Point, kind: DropKind): void {
    const g = this.graphics;
    g.fillStyle(DROP_COLORS[kind]);
    g.fillRoundedRect(x - 15, y - 15, 30, 30, 8);
    g.lineStyle(2, INK);
    g.strokeRoundedRect(x - 15, y - 15, 30, 30, 8);
    if (kind === 'shield') {
      g.strokePoints(
        [
          { x, y: y - 9 },
          { x: x + 8, y: y - 5 },
          { x: x + 6, y: y + 4 },
          { x, y: y + 9 },
          { x: x - 6, y: y + 4 },
          { x: x - 8, y: y - 5 },
        ],
        true,
      );
      g.lineBetween(x - 4, y, x - 1, y + 3);
      g.lineBetween(x - 1, y + 3, x + 4, y - 3);
    } else if (kind === 'freeze') {
      g.lineBetween(x, y - 9, x, y + 9);
      g.lineBetween(x - 8, y - 5, x + 8, y + 5);
      g.lineBetween(x - 8, y + 5, x + 8, y - 5);
    } else {
      g.strokeCircle(x, y, 8);
      g.strokeCircle(x, y, 3);
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
    const run = this.state.endless;
    if (!inspecting && (run?.shield || run?.shieldGraceMs))
      drawShield(this.graphics, this.accents, p, run.shield);
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
