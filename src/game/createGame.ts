import Phaser from 'phaser';
import { TICK_MS } from '../core/config';
import { step } from '../core/engine';
import type { Command, GameEvent, GameState } from '../core/types';
import { Arena } from './renderers/Arena';
import { VIEWPORT } from './config';

export interface GameOptions {
  state: GameState;
  command: () => Command;
  onTick: (events: GameEvent[]) => void;
  reducedMotion: () => boolean;
}
export function createGame(
  parent: HTMLElement,
  options: GameOptions,
): { destroy(): void; resetClock(): void } {
  let accumulator = 0,
    disposed = false;
  class PlayScene extends Phaser.Scene {
    private arena?: Arena;
    create(): void {
      this.arena = new Arena(this, options.state);
    }
    update(_time: number, delta: number): void {
      if (disposed || !this.arena) return;
      const state = options.state;
      if (state.paused || state.status !== 'playing') {
        accumulator = 0;
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
        step(state, options.command());
        accumulator -= TICK_MS;
        this.arena.events(state.events, options.reducedMotion());
        options.onTick(state.events);
      }
      // 终止帧直接对齐规则格，现场标记不能落在尚未追上的插值位置。
      this.arena.draw(
        Math.min(delta, 100),
        state.status !== 'playing' || options.reducedMotion(),
      );
    }
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#193440',
    render: { antialias: true, pixelArt: false },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      ...VIEWPORT,
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
