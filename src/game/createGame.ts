import Phaser from 'phaser';
import { TICK_MS } from '../core/config';
import { stepEndless } from '../core/endless';
import type { Command, EndlessState, GameEvent } from '../core/types';
import { Arena } from './renderers/Arena';
import { VIEWPORT } from './config';
import { CHARACTER_ATLAS, characterFrame } from './characters';

export interface GameOptions {
  state: EndlessState;
  command: () => Command;
  onTick: (events: GameEvent[]) => void;
  onReady: () => void;
  onError: () => void;
  reducedMotion: () => boolean;
  inspectingLoss?: () => boolean;
}
export function createGame(
  parent: HTMLElement,
  options: GameOptions,
): { destroy(): void; resetClock(): void } {
  const renderScale = Math.min(window.devicePixelRatio || 1, 3);
  let accumulator = 0,
    disposed = false;
  class PlayScene extends Phaser.Scene {
    private arena?: Arena;
    private failed = false;
    preload(): void {
      this.load.once('loaderror', () => {
        this.failed = true;
        options.onError();
      });
      this.load.image('characters', CHARACTER_ATLAS);
    }
    create(): void {
      if (this.failed) return;
      const texture = this.textures.get('characters');
      for (let frame = 0; frame < 11; frame++) {
        const { x, y, width, height } = characterFrame(frame);
        texture.add(frame, 0, x, y, width, height);
      }
      this.cameras.main.setOrigin(0, 0).setZoom(renderScale);
      this.arena = new Arena(this, options.state);
      this.arena.draw(0, true, false);
      options.onReady();
    }
    update(_time: number, delta: number): void {
      if (disposed || !this.arena) return;
      const state = options.state;
      if (state.paused || state.status !== 'playing') {
        accumulator = 0;
        if (!state.paused)
          this.arena.draw(
            Math.min(delta, 100),
            options.reducedMotion(),
            options.inspectingLoss?.() ?? false,
          );
        return;
      }
      accumulator += Math.min(delta, 100);
      let count = 0;
      while (
        accumulator >= TICK_MS &&
        count++ < 5 &&
        !state.paused &&
        state.status === 'playing'
      ) {
        stepEndless(state, options.command());
        accumulator -= TICK_MS;
        this.arena.afterStep(options.reducedMotion());
        options.onTick(state.events);
      }
      // 终止帧直接对齐规则格，现场标记不能落在尚未追上的插值位置。
      this.arena.draw(
        Math.min(delta, 100),
        options.reducedMotion(),
        options.inspectingLoss?.() ?? false,
        accumulator,
      );
    }
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#e1e9bc',
    render: { antialias: true, pixelArt: false },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: VIEWPORT.width * renderScale,
      height: VIEWPORT.height * renderScale,
    },
    scene: [PlayScene],
    audio: { noAudio: true },
    banner: false,
  });
  return {
    destroy: () => {
      disposed = true;
      game.destroy(true);
    },
    resetClock: () => {
      accumulator = 0;
      for (const scene of game.scene.getScenes())
        scene.cameras.main.shakeEffect.reset();
    },
  };
}
