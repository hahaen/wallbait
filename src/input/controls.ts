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
  private beacon = false;
  private dodgeSource: string | null = null;
  private beaconSource: string | null = null;
  private pointers = new Map<number, HTMLButtonElement>();
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
        if (direction || event.code === 'Space' || event.code === 'KeyE')
          event.preventDefault();
        if (event.repeat) return;
        if (direction) this.held.set(event.code, direction);
        if (event.code === 'Space') this.queueDodge();
        if (event.code === 'KeyE') this.queueBeacon('keyboard');
      },
      { signal },
    );
    window.addEventListener('keyup', (event) => this.held.delete(event.code), {
      signal,
    });
    root
      .querySelectorAll<HTMLButtonElement>(
        '[data-direction], [data-dodge], [data-beacon]',
      )
      .forEach((button) => {
        button.addEventListener(
          'pointerdown',
          (event) => {
            if (!active() || button.disabled) return;
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            this.pointers.set(event.pointerId, button);
            const direction = button.dataset.direction as Direction | undefined;
            if (direction)
              this.held.set(`pointer${event.pointerId}`, direction);
            else if (button.hasAttribute('data-dodge'))
              this.queueDodge(`pointer${event.pointerId}`);
            else this.queueBeacon(`pointer${event.pointerId}`);
            button.classList.add('pressed');
          },
          { signal },
        );
        const release = (event: PointerEvent): void => {
          const source = `pointer${event.pointerId}`;
          const wasHeld = this.pointers.has(event.pointerId);
          this.held.delete(source);
          this.pointers.delete(event.pointerId);
          if (wasHeld && event.type !== 'pointerup') {
            if (this.dodgeSource === source) this.dodge = false;
            if (this.beaconSource === source) this.beacon = false;
          }
          if (![...this.pointers.values()].includes(button))
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
      beacon: this.beacon,
    };
    this.dodge = false;
    this.beacon = false;
    return result;
  }
  private queueDodge(source = 'keyboard'): void {
    this.dodge = true;
    this.dodgeSource = source;
    this.dodgeDirection = [...this.held.values()].at(-1) ?? null;
  }
  private queueBeacon(source: string): void {
    this.beacon = true;
    this.beaconSource = source;
  }
  clear(): void {
    this.held.clear();
    this.dodge = false;
    this.beacon = false;
    this.dodgeDirection = null;
    this.dodgeSource = null;
    this.beaconSource = null;
    for (const [id, button] of this.pointers) {
      if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
    }
    this.pointers.clear();
    document
      .querySelectorAll('.pressed')
      .forEach((button) => button.classList.remove('pressed'));
  }
  destroy(): void {
    this.clear();
    this.abort.abort();
  }
}
