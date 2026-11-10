import type { GameEvent } from '../core/types';

/** 程序音效，无网络资源。只在用户手势中创建/恢复 AudioContext。 */
export class Sound {
  private context?: AudioContext;
  muted = false;
  constructor(private enabled = true) {}
  unlock(): void {
    if (!this.enabled || this.muted) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended')
        void this.context.resume().catch(() => {});
    } catch {
      /* 音频不可用不影响游戏。 */
    }
  }
  play(type: GameEvent['type']): void {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const notes: Record<GameEvent['type'], [number, number]> = {
      dash: [240, 100],
      dodge: [600, 1000],
      wall: [100, 45],
      won: [520, 1040],
      lost: [200, 60],
      chip: [880, 1320],
      highlight: [660, 990],
      pulse: [180, 720],
      magnet: [420, 180],
      ability: [220, 330],
      pickup: [640, 960],
      'shield-break': [460, 180],
      lure: [360, 620],
    };
    try {
      const ctx = this.context,
        oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      const [start, end] = notes[type];
      const duration = type === 'won' ? 0.4 : 0.14;
      oscillator.type = type === 'wall' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(start, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        end,
        ctx.currentTime + duration,
      );
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + duration,
      );
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start();
      oscillator.stop(ctx.currentTime + duration);
    } catch {
      /* 部分浏览器/音频设备可能拒绝播放。 */
    }
  }
  destroy(): void {
    void this.context?.close().catch(() => {});
  }
}
