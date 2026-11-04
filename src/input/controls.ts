import type { Command, Direction } from '../core/types';

const KEY_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
};
export class Controls {
  private held = new Map<string, Direction>();
  private dodge = false;
  private dodgeDirection: Direction | null = null;
  private abort = new AbortController();
  constructor(root: HTMLElement, active: () => boolean, pause: () => void) {
    const signal = this.abort.signal;
    window.addEventListener(
      'keydown',
      (event) => {
        if (
          (event.code === 'Escape' || event.code === 'KeyP') &&
          !event.repeat
        ) {
          event.preventDefault();
          pause();
          return;
        }
        if (!active() || event.ctrlKey || event.metaKey || event.altKey) return;
        const direction = KEY_DIRECTION[event.code];
        if (direction || event.code === 'Space') event.preventDefault();
        if (event.repeat) return;
        if (direction) this.held.set(event.code, direction);
        if (event.code === 'Space') this.queueDodge();
      },
      { signal },
    );
    window.addEventListener('keyup', (event) => this.held.delete(event.code), {
      signal,
    });
    root
      .querySelectorAll<HTMLButtonElement>('[data-direction], [data-dodge]')
      .forEach((button) => {
        button.addEventListener(
          'pointerdown',
          (event) => {
            if (!active()) return;
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            const direction = button.dataset.direction as Direction | undefined;
            if (direction)
              this.held.set(`pointer${event.pointerId}`, direction);
            else this.queueDodge();
            button.classList.add('pressed');
          },
          { signal },
        );
        const release = (event: PointerEvent): void => {
          this.held.delete(`pointer${event.pointerId}`);
          button.classList.remove('pressed');
        };
        for (const name of [
          'pointerup',
          'pointercancel',
          'lostpointercapture',
        ] as const)
          button.addEventListener(name, release, { signal });
        button.addEventListener(
          'contextmenu',
          (event) => event.preventDefault(),
          { signal },
        );
      });
  }
  sample(): Command {
    const directions = [...this.held.values()];
    const result = {
      direction: this.dodge ? this.dodgeDirection : (directions.at(-1) ?? null),
      dodge: this.dodge,
    };
    this.dodge = false;
    return result;
  }
  private queueDodge(): void {
    this.dodge = true;
    this.dodgeDirection = [...this.held.values()].at(-1) ?? null;
  }
  clear(): void {
    this.held.clear();
    this.dodge = false;
    this.dodgeDirection = null;
    document
      .querySelectorAll('.pressed')
      .forEach((button) => button.classList.remove('pressed'));
  }
  destroy(): void {
    this.clear();
    this.abort.abort();
  }
}
