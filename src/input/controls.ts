import type { Command, Direction } from '../core/types';
import { joystickIntent } from './joystick';

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
  private captures = new Map<number, HTMLElement>();
  private stick?: HTMLElement;
  private stickPointer: number | null = null;
  private stickDirection: Direction | null = null;
  private stickBounds?: DOMRect;
  private tap: { source: string; direction: Direction } | null = null;
  private dodgeDirection: Direction | null = null;
  private abort = new AbortController();
  constructor(root: HTMLElement, active: () => boolean, pause: () => void) {
    const signal = this.abort.signal;
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (
          (event.code === 'Escape' || event.code === 'KeyP') &&
          !event.repeat
        ) {
          event.preventDefault();
          pause();
          return;
        }
        if (!active()) return;
        if (event.code === 'Enter') {
          const button =
            event.target instanceof HTMLElement
              ? event.target.closest<HTMLButtonElement>(
                  '[data-direction], [data-dodge], [data-beacon]',
                )
              : null;
          if (button && root.contains(button) && !button.disabled) {
            event.preventDefault();
            if (!event.repeat) {
              if (button.dataset.direction)
                this.hold(event.code, button.dataset.direction as Direction);
              else if (button.hasAttribute('data-dodge')) this.queueDodge();
              else this.queueBeacon('keyboard');
            }
          }
          return;
        }
        const direction = KEY_DIRECTION[event.code];
        if (direction || event.code === 'Space' || event.code === 'KeyE')
          event.preventDefault();
        if (event.repeat) return;
        if (direction) this.hold(event.code, direction);
        if (event.code === 'Space') this.queueDodge();
        if (event.code === 'KeyE') this.queueBeacon('keyboard');
      },
      { signal },
    );
    window.addEventListener('keyup', (event) => this.held.delete(event.code), {
      signal,
    });
    this.stick =
      root.querySelector<HTMLElement>('[data-joystick]') ?? undefined;
    if (this.stick) {
      const stick = this.stick;
      stick.addEventListener(
        'pointerdown',
        (event) => {
          if (!active() || this.stickPointer !== null) return;
          event.preventDefault();
          this.stickPointer = event.pointerId;
          this.stickBounds = stick.getBoundingClientRect();
          stick.setPointerCapture(event.pointerId);
          this.captures.set(event.pointerId, stick);
          stick.classList.add('engaged');
          this.moveStick(event);
        },
        { signal },
      );
      stick.addEventListener(
        'pointermove',
        (event) => {
          if (active() && event.pointerId === this.stickPointer) {
            event.preventDefault();
            this.moveStick(event);
          }
        },
        { signal },
      );
      const release = (event: PointerEvent): void => {
        if (event.pointerId !== this.stickPointer) return;
        const source = `pointer${event.pointerId}`;
        this.held.delete(source);
        this.captures.delete(event.pointerId);
        this.pointerButton(event.pointerId);
        if (event.type !== 'pointerup' && this.tap?.source === source)
          this.tap = null;
        this.resetStick();
      };
      for (const name of [
        'pointerup',
        'pointercancel',
        'lostpointercapture',
      ] as const)
        stick.addEventListener(name, release, { signal });
      stick.addEventListener('contextmenu', (event) => event.preventDefault(), {
        signal,
      });
      window.addEventListener('resize', () => this.clear(), { signal });
    }
    root
      .querySelectorAll<HTMLButtonElement>(
        '[data-direction], [data-dodge], [data-beacon]',
      )
      .forEach((button) => {
        if (button.closest('[data-joystick]')) return;
        button.addEventListener(
          'pointerdown',
          (event) => {
            if (!active() || button.disabled) return;
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            this.captures.set(event.pointerId, button);
            this.pointerButton(event.pointerId, button);
            const direction = button.dataset.direction as Direction | undefined;
            if (direction) this.hold(`pointer${event.pointerId}`, direction);
            else if (button.hasAttribute('data-dodge'))
              this.queueDodge(`pointer${event.pointerId}`);
            else this.queueBeacon(`pointer${event.pointerId}`);
          },
          { signal },
        );
        const release = (event: PointerEvent): void => {
          const source = `pointer${event.pointerId}`;
          const wasHeld = this.captures.has(event.pointerId);
          this.held.delete(source);
          this.captures.delete(event.pointerId);
          this.pointerButton(event.pointerId);
          if (wasHeld && event.type !== 'pointerup') {
            if (this.tap?.source === source) this.tap = null;
            if (this.dodgeSource === source) this.dodge = false;
            if (this.beaconSource === source) this.beacon = false;
          }
        };
        button.addEventListener(
          'pointermove',
          (event) => {
            const capture = this.captures.get(event.pointerId);
            if (!active() || !capture?.dataset.direction) return;
            const hit = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLButtonElement>('button[data-direction]');
            const next = hit && root.contains(hit) ? hit : undefined;
            if (this.pointers.get(event.pointerId) === next) return;
            this.pointerButton(event.pointerId, next);
            const source = `pointer${event.pointerId}`;
            this.held.delete(source);
            if (this.tap?.source === source) this.tap = null;
            if (next) this.hold(source, next.dataset.direction as Direction);
          },
          { signal },
        );
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
  private moveStick(event: PointerEvent): void {
    const stick = this.stick!,
      bounds = this.stickBounds!;
    const intent = joystickIntent(
      event.clientX - bounds.x - bounds.width / 2,
      event.clientY - bounds.y - bounds.height / 2,
      Math.min(bounds.width, bounds.height) / 2,
      this.stickDirection,
    );
    stick.style.setProperty('--stick-x', `${intent.x}px`);
    stick.style.setProperty('--stick-y', `${intent.y}px`);
    if (intent.direction === this.stickDirection) return;
    const source = `pointer${event.pointerId}`;
    this.held.delete(source);
    if (this.tap?.source === source) this.tap = null;
    this.stickDirection = intent.direction;
    this.pointerButton(
      event.pointerId,
      intent.direction
        ? stick.querySelector<HTMLButtonElement>(
            `[data-direction="${intent.direction}"]`,
          )!
        : undefined,
    );
    if (intent.direction) this.hold(source, intent.direction);
  }
  private resetStick(): void {
    this.stickPointer = null;
    this.stickDirection = null;
    this.stickBounds = undefined;
    this.stick?.classList.remove('engaged');
    this.stick?.style.setProperty('--stick-x', '0px');
    this.stick?.style.setProperty('--stick-y', '0px');
  }
  sample(): Command {
    const directions = [...this.held.values()];
    const result = {
      direction: this.dodge
        ? this.dodgeDirection
        : (directions.at(-1) ?? this.tap?.direction ?? null),
      dodge: this.dodge,
      beacon: this.beacon,
    };
    this.dodge = false;
    this.beacon = false;
    this.tap = null;
    return result;
  }
  private hold(source: string, direction: Direction): void {
    this.held.delete(source);
    this.held.set(source, direction);
    this.tap = { source, direction };
  }
  private pointerButton(id: number, button?: HTMLButtonElement): void {
    const previous = this.pointers.get(id);
    this.pointers.delete(id);
    if (button) {
      this.pointers.set(id, button);
      button.classList.add('pressed');
    }
    if (previous && ![...this.pointers.values()].includes(previous))
      previous.classList.remove('pressed');
  }
  private queueDodge(source = 'keyboard'): void {
    this.dodge = true;
    this.dodgeSource = source;
    this.dodgeDirection =
      [...this.held.values()].at(-1) ?? this.tap?.direction ?? null;
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
    this.tap = null;
    for (const [id, button] of this.captures) {
      if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
    }
    this.pointers.clear();
    this.captures.clear();
    this.resetStick();
    document
      .querySelectorAll('.pressed')
      .forEach((button) => button.classList.remove('pressed'));
  }
  destroy(): void {
    this.clear();
    this.abort.abort();
  }
}
