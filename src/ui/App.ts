import { setPaused } from '../core/engine';
import { HIGHLIGHTS } from '../core/highlights';
import { beatsEndlessScore, createEndless } from '../core/endless';
import type { DropKind, EndlessState } from '../core/types';
import type { createGame } from '../game/createGame';
import { Sound } from '../game/audio';
import { dangerText, lossAdvice, lossTitle } from '../game/feedback';
import { Controls } from '../input/controls';
import { browserStorage, readSave, writeSave } from '../storage/save';
import type { Save } from '../storage/save';
import { cloneArt, cloneTemplate } from './templates';

const dropNames: Record<DropKind, string> = {
  shield: '护盾',
  freeze: '冰冻',
  lure: '诱饵',
};
const seconds = (ms: number): string => (ms / 1000).toFixed(1);

interface AppOptions {
  atlasUrl: string;
  initialSave?: Save;
  persist?: (save: Save) => Promise<boolean>;
  audioEnabled?: boolean;
}

export class App {
  private save: Save;
  private sound: Sound;
  private state?: EndlessState;
  private game?: ReturnType<typeof createGame>;
  private controls?: Controls;
  private abort = new AbortController();
  private storageWarning = false;
  private screen: 'home' | 'play' = 'home';
  private previousFocus?: HTMLElement;
  private inspectingLoss = false;
  private gameReady = false;
  private autoStart = false;
  private resultTimer?: number;
  private resultPending = false;
  private endlessRecord = false;
  private pickupNotice?: { text: string; until: number };
  constructor(
    private root: HTMLElement,
    private options: AppOptions,
  ) {
    this.save = options.initialSave ?? readSave(browserStorage);
    this.sound = new Sound(options.audioEnabled);
    this.sound.muted = this.save.muted;
    const signal = this.abort.signal;
    root.addEventListener(
      'click',
      (event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>(
          '[data-action]',
        );
        if (target) {
          this.sound.unlock();
          this.act(target.dataset.action!);
        }
      },
      { signal },
    );
    root.addEventListener('pointerdown', () => this.sound.unlock(), { signal });
    window.addEventListener('keydown', () => this.sound.unlock(), { signal });
    window.addEventListener('blur', () => this.pause(), { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.pause();
          window.clearTimeout(this.resultTimer);
          this.resultTimer = undefined;
        } else if (this.resultPending) this.scheduleResult();
      },
      { signal },
    );
    root.addEventListener(
      'cancel',
      (event) => {
        event.preventDefault();
        if (this.root.querySelector('dialog [data-action="resume"]'))
          this.resume();
        else if (this.screen !== 'play') this.closeDialog();
      },
      { signal, capture: true },
    );
    this.home();
  }
  private cleanupGame(): void {
    window.clearTimeout(this.resultTimer);
    this.resultTimer = undefined;
    this.resultPending = false;
    this.endlessRecord = false;
    this.pickupNotice = undefined;
    this.controls?.destroy();
    this.controls = undefined;
    this.game?.destroy();
    this.game = undefined;
    this.state = undefined;
    this.inspectingLoss = false;
    this.gameReady = false;
    this.autoStart = false;
  }
  private persist(): void {
    if (this.options.persist) {
      void this.options.persist(this.save).then((saved) => {
        if (this.abort.signal.aborted) return;
        this.storageWarning = !saved;
        this.refreshSaveWarning();
      });
    } else {
      this.storageWarning = !writeSave(browserStorage, this.save);
    }
  }
  private setScreen(
    screen: typeof this.screen,
    content: DocumentFragment,
  ): void {
    this.closeDialog();
    this.cleanupGame();
    this.screen = screen;
    this.root.replaceChildren(content);
    this.root.dataset.screen = screen;
    this.root
      .querySelector<HTMLElement>('h1, h2')
      ?.focus({ preventScroll: true });
  }
  private home(): void {
    const best = this.save.endlessBest;
    const content = cloneTemplate('home');
    content
      .querySelector('.hero-art')!
      .append(cloneArt('hero-art', this.options.atlasUrl));
    if (best) {
      const record = content.querySelector<HTMLElement>('.endless-best')!;
      record.hidden = false;
      record.textContent = `无尽纪录 · 完成 ${best.cleared} 波 · 撞毁 ${best.defeated} 条`;
    }
    this.setScreen('home', content);
  }
  private start(seed = Math.floor(Math.random() * 0x100000000)): void {
    this.play(createEndless(seed));
  }
  private restart(): void {
    if (this.state) this.start(this.state.endless.seed);
  }
  private play(state: EndlessState): void {
    const content = cloneTemplate('play');
    content.querySelector('.level-name')!.textContent = state.level.name;
    content
      .querySelector('[data-dodge] span')!
      .append(cloneTemplate('icon-lure'));
    this.setScreen('play', content);
    this.state = state;
    setPaused(state, true);
    this.autoStart = true;
    this.controls = new Controls(
      this.root,
      () => this.gameReady && state.status === 'playing' && !state.paused,
      () => {
        if (this.inspectingLoss) this.result();
        else if (!state.paused) this.pause();
        else if (this.root.querySelector('dialog [data-action="resume"]'))
          this.resume();
      },
    );
    const arena = this.root.querySelector<HTMLElement>('#arena')!;
    const fail = (): void => {
      if (this.state !== state) return;
      this.gameReady = false;
      this.autoStart = false;
      setPaused(state, true);
      this.controls?.clear();
      arena.setAttribute('aria-busy', 'false');
      this.dialog(cloneTemplate('load-error'));
    };
    void import('../game/createGame')
      .then(({ createGame }) => {
        if (this.state !== state) return;
        this.game = createGame(arena, {
          atlasUrl: this.options.atlasUrl,
          state,
          onError: fail,
          inspectingLoss: () => this.inspectingLoss,
          onReady: () => {
            if (this.state !== state) return;
            this.gameReady = true;
            arena.setAttribute('aria-busy', 'false');
            arena.querySelector('.loading')?.remove();
            const begin = this.root.querySelector<HTMLButtonElement>(
              '[data-action="begin"]',
            );
            if (begin) {
              begin.disabled = false;
              begin.textContent = '开始挑战';
            }
            if (this.autoStart && !document.hidden) this.resume();
          },
          command: () => this.controls?.sample() ?? { direction: null },
          reducedMotion: () =>
            this.save.reducedMotion ||
            matchMedia('(prefers-reduced-motion: reduce)').matches,
          onTick: (events) => {
            if (this.state !== state) return;
            for (const event of events) {
              this.sound.play(event.type);
              if (event.type === 'pickup' || event.type === 'shield-break') {
                this.pickupNotice = {
                  text:
                    event.type === 'pickup'
                      ? `拾到${dropNames[event.kind]}`
                      : '护盾挡住了撞击',
                  until: state.elapsedMs + 1800,
                };
              }
            }
            this.hud();
            if (events.some((e) => e.type === 'lost')) this.finishRound();
          },
        });
      })
      .catch(fail);
    this.hud();
    this.dialog(cloneTemplate('loading'));
  }
  private hud(): void {
    const s = this.state;
    if (!s) return;
    const text = (id: string, value: string): void => {
      const node = this.root.querySelector(`#${id}`);
      if (node && node.textContent !== value) node.textContent = value;
    };
    text('round-label', `第 ${s.endless.wave} 波`);
    const waveBreak = s.endless.nextWaveMs;
    text(
      'enemy-count',
      waveBreak > 0
        ? `下波 ${seconds(Math.ceil(waveBreak / 100) * 100)}s`
        : `剩余 ${s.snakes.filter((v) => v.alive).length} 条`,
    );
    text('clock', `${seconds(s.elapsedMs)}s`);
    const { drop, shield, shieldGraceMs, hasLure, freezeMs } = s.endless;
    text(
      'shield-status',
      shield ? '护盾 · 就绪' : shieldGraceMs ? '护盾 · 已挡' : '护盾 · 空',
    );
    this.root
      .querySelector('#shield-status')
      ?.classList.toggle('ready', shield || shieldGraceMs > 0);
    const guide = this.root.querySelector<HTMLElement>('#drop-guide')!;
    const kind = drop?.kind ?? '';
    if (guide.dataset.kind !== kind) {
      guide.dataset.kind = kind;
      const content = cloneTemplate('drop-guide');
      const icon = content.querySelector('span')!;
      icon.hidden = !drop;
      if (drop) icon.append(cloneTemplate(`icon-${drop.kind}`));
      content.querySelector('b')!.textContent = drop
        ? dropNames[drop.kind]
        : '下一件道具';
      content.querySelector('small')!.textContent = drop
        ? drop.kind === 'lure'
          ? '踩上拾取'
          : '踩上生效'
        : '马上掉落';
      guide.replaceChildren(content);
    }
    const lure = this.root.querySelector<HTMLButtonElement>('[data-dodge]')!;
    if (lure.disabled === hasLure) lure.disabled = !hasLure;
    text('lure-note', hasLure ? '原地放下' : '拾取后可用');
    const gateText = s.gates
      .map(
        (gate) =>
          `${gate.id} ${gate.closed ? '闭' : '开'}${gate.pending === null ? '' : `→待${gate.pending ? '关' : '开'}`}`,
      )
      .join(' · ');
    text(
      'mechanisms',
      [
        gateText,
        s.beacon ? `诱饵 ${seconds(s.beacon.remainingMs)}s` : '',
        freezeMs ? (waveBreak ? '冰冻留到下波' : '蛇已冰冻') : '',
        s.wrecks.length
          ? s.wrecks.some((w) => !w.active)
            ? '残骸待生效'
            : ''
          : '',
      ]
        .filter(Boolean)
        .join('  |  '),
    );
    const recent = s.highlights
      .filter((h) => s.elapsedMs - h.atMs < 3000)
      .at(-1);
    text(
      'field-notes',
      this.pickupNotice && s.elapsedMs < this.pickupNotice.until
        ? this.pickupNotice.text
        : recent
          ? `✓ ${HIGHLIGHTS[recent.id].title}`
          : '',
    );
    const danger = freezeMs ? '' : dangerText(s);
    const choice = s.endless.waveChoice;
    const waveMessage = choice
      ? choice.selected === 0
        ? '本波清空 · 可移向另一框换区'
        : '本波清空 · 已选转场区'
      : '本波清空 · 下一波将至';
    text(
      'play-status',
      s.status === 'lost'
        ? '被逮住了，下次再骗它！'
        : waveBreak > 0
          ? waveMessage
          : danger,
    );
    this.root
      .querySelector('#play-status')
      ?.classList.toggle('danger', Boolean(danger) || s.status === 'lost');
  }
  private dialog(content: DocumentFragment, cls = ''): void {
    this.closeDialog();
    this.previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const dialog = document.createElement('dialog');
    dialog.className = `panel ${cls}`;
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    dialog.append(content);
    this.root.append(dialog);
    dialog.showModal();
    const title = dialog.querySelector<HTMLElement>('#dialog-title');
    title?.setAttribute('tabindex', '-1');
    title?.focus({ preventScroll: true });
  }
  private closeDialog(): void {
    const dialog = this.root.querySelector<HTMLDialogElement>('dialog');
    if (dialog) {
      dialog.close();
      dialog.remove();
      this.previousFocus?.focus({ preventScroll: true });
    }
  }
  private pause(): void {
    this.autoStart = false;
    if (!this.state || this.state.status !== 'playing' || this.state.paused)
      return;
    setPaused(this.state, true);
    this.controls?.clear();
    this.game?.resetClock();
    const run = this.state.endless;
    const content = cloneTemplate('pause');
    content.querySelector('.pause-score')!.textContent =
      `完成 ${run.cleared} 波 · 撞毁 ${run.defeated} 条`;
    this.dialog(content);
  }
  private resume(): void {
    if (!this.state?.paused || !this.gameReady) return;
    this.autoStart = false;
    this.controls?.clear();
    this.game?.resetClock();
    setPaused(this.state, false);
    this.closeDialog();
  }
  private finishRound(): void {
    const s = this.state;
    if (!s || s.status === 'playing' || this.resultPending) return;
    this.controls?.clear();
    this.resultPending = true;
    if (beatsEndlessScore(s.endless, this.save.endlessBest)) {
      this.endlessRecord = true;
      this.save.endlessBest = {
        cleared: s.endless.cleared,
        defeated: s.endless.defeated,
      };
      this.persist();
    }
    this.root.querySelector('.play-screen')?.classList.add('ending');
    const controls = this.root.querySelector<HTMLElement>('.controls');
    if (controls) controls.inert = true;
    const pause = this.root.querySelector<HTMLButtonElement>(
      '[data-action="pause"]',
    );
    if (pause) pause.disabled = true;
    this.scheduleResult();
  }
  private scheduleResult(): void {
    if (
      !this.resultPending ||
      this.resultTimer !== undefined ||
      document.hidden
    )
      return;
    const state = this.state;
    this.resultTimer = window.setTimeout(() => {
      this.resultTimer = undefined;
      if (this.state === state && this.resultPending && !document.hidden)
        this.result();
    }, 1200);
  }
  private result(): void {
    const s = this.state;
    if (!s || s.status === 'playing') return;
    window.clearTimeout(this.resultTimer);
    this.resultTimer = undefined;
    this.resultPending = false;
    this.controls?.clear();
    this.inspectingLoss = false;
    this.root
      .querySelector('.play-screen')
      ?.classList.remove('inspecting', 'ending');
    const inspection = this.root.querySelector<HTMLElement>('.loss-inspection');
    if (inspection) inspection.hidden = true;
    const best = this.save.endlessBest;
    const content = cloneTemplate('result');
    content
      .querySelector('.result-apple')!
      .append(cloneArt('apple-art', this.options.atlasUrl));
    content.querySelector('#dialog-title')!.textContent = this.endlessRecord
      ? '新的无尽纪录！'
      : '再骗它一次';
    content.querySelector('.result-cleared')!.textContent = String(
      s.endless.cleared,
    );
    content.querySelector('.result-defeated')!.textContent = String(
      s.endless.defeated,
    );
    if (best && !this.endlessRecord) {
      const record = content.querySelector<HTMLElement>('.result-best')!;
      record.hidden = false;
      record.textContent = `个人纪录 · ${best.cleared} 波 / ${best.defeated} 条`;
    }
    content.querySelector<HTMLElement>('#result-save-warning')!.hidden =
      !this.storageWarning;
    this.dialog(content, 'lose');
  }
  private inspectLoss(): void {
    const s = this.state;
    if (!s || s.status !== 'lost') return;
    this.controls?.clear();
    this.closeDialog();
    this.inspectingLoss = true;
    this.root.querySelector('.play-screen')?.classList.add('inspecting');
    const inspection =
      this.root.querySelector<HTMLElement>('.loss-inspection')!;
    inspection.hidden = false;
    const title = this.root.querySelector<HTMLElement>('#loss-title')!;
    title.textContent = lossTitle(s);
    this.root.querySelector('#loss-advice')!.textContent = lossAdvice(s);
    title.focus({ preventScroll: true });
  }
  private help(): void {
    const content = cloneTemplate('help');
    content
      .querySelector('.help-art')!
      .append(cloneArt('hero-art', this.options.atlasUrl));
    this.dialog(content);
  }
  private settings(): void {
    this.dialog(cloneTemplate('settings'));
    this.refreshSettings();
  }
  private refreshSettings(): void {
    for (const [action, enabled, label] of [
      [
        'mute',
        this.options.audioEnabled !== false && !this.save.muted,
        this.options.audioEnabled === false
          ? '不可用'
          : this.save.muted
            ? '已静音'
            : '已开启',
      ],
      [
        'motion',
        this.save.reducedMotion,
        this.save.reducedMotion ? '已开启' : '已关闭',
      ],
    ] as const) {
      const toggle = this.root.querySelector<HTMLButtonElement>(
        `[data-action="${action}"]`,
      )!;
      if (action === 'mute')
        toggle.disabled = this.options.audioEnabled === false;
      toggle.setAttribute('aria-checked', String(enabled));
      toggle.textContent = label;
    }
    this.refreshSaveWarning();
  }
  private refreshSaveWarning(): void {
    const warning = this.root.querySelector('#settings-save-warning');
    const message = this.storageWarning
      ? '保存暂不可用，设置会在本次游玩生效。'
      : '';
    if (warning && warning.textContent !== message)
      warning.textContent = message;
    const result = this.root.querySelector<HTMLElement>('#result-save-warning');
    if (result) result.hidden = !this.storageWarning;
  }
  private act(action: string): void {
    switch (action) {
      case 'inspect-loss':
        this.inspectLoss();
        break;
      case 'result':
        if (this.inspectingLoss) this.result();
        break;
      case 'home':
        this.home();
        break;
      case 'start':
        this.start();
        break;
      case 'pause':
        this.pause();
        break;
      case 'begin':
      case 'resume':
        this.resume();
        break;
      case 'endless-new':
        this.start();
        break;
      case 'retry':
        this.restart();
        break;
      case 'reload':
        window.location.reload();
        break;
      case 'help':
        this.help();
        break;
      case 'settings':
        this.settings();
        break;
      case 'close':
        this.closeDialog();
        break;
      case 'mute':
        this.save.muted = !this.save.muted;
        this.sound.muted = this.save.muted;
        this.sound.unlock();
        this.persist();
        this.refreshSettings();
        break;
      case 'motion':
        this.save.reducedMotion = !this.save.reducedMotion;
        this.persist();
        this.refreshSettings();
        break;
    }
  }
  destroy(): void {
    this.cleanupGame();
    this.abort.abort();
    this.sound.destroy();
  }
}
