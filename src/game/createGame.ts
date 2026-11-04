import Phaser from 'phaser';
import { THEME, VIEWPORT } from './config';
import { BootstrapScene } from './scenes/BootstrapScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: THEME.background,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
    },
    scene: [BootstrapScene],
  });
}
