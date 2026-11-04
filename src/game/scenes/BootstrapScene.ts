import Phaser from 'phaser';
import { THEME, VIEWPORT } from '../config';

// 开发启动页：只验证 Phaser 初始化和竖屏缩放，不代表首版玩法已完成。
export class BootstrapScene extends Phaser.Scene {
  constructor() {
    super('bootstrap');
  }

  create(): void {
    const centerX = VIEWPORT.width / 2;
    const fontFamily =
      'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

    this.add
      .text(centerX, 300, '撞墙了么', {
        fontFamily,
        fontSize: '42px',
        fontStyle: 'bold',
        color: THEME.ink,
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, 356, '你追你的，墙就在那儿。', {
        fontFamily,
        fontSize: '19px',
        color: THEME.ink,
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, 440, '开发骨架已就绪\n下一步：移动、追踪与冲刺', {
        fontFamily,
        fontSize: '16px',
        color: THEME.muted,
        align: 'center',
        lineSpacing: 10,
      })
      .setOrigin(0.5);
  }
}
