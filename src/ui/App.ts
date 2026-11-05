import { setPaused } from '../core/engine';
import { HIGHLIGHTS } from '../core/highlights';
import { beatsEndlessScore, createEndless } from '../core/endless';
import type { DropKind, EndlessState } from '../core/types';
import type { createGame } from '../game/createGame';
import { Sound } from '../game/audio';
import { dangerText, lossAdvice, lossTitle } from '../game/feedback';
import { Controls } from '../input/controls';
import { browserStorage, readSave, writeSave } from '../storage/save';
import { appleArt, heroArt } from './art';
import { dropIcons } from './icons';

const dropNames: Record<DropKind, string> = {
  shield: '护盾',
  freeze: '冰冻',
  lure: '诱饵',
};
const seconds = (ms: number): string => (ms / 1000).toFixed(1);
const button = (action: string, text: string, cls = ''): string =>
  `<button type="button" data-action="${action}" class="${cls}">${text}</button>`;

export class App {
  private save = readSave(browserStorage);
  private sound = new Sound();
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
  constructor(private root: HTMLElement) {
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
    this.storageWarning = !writeSave(browserStorage, this.save);
  }
  private setScreen(screen: typeof this.screen, html: string): void {
    this.closeDialog();
    this.cleanupGame();
    this.screen = screen;
    this.root.innerHTML = html;
    this.root.dataset.screen = screen;
    this.root
      .querySelector<HTMLElement>('h1, h2')
      ?.focus({ preventScroll: true });
  }
  private home(): void {
    const best = this.save.endlessBest;
    this.setScreen(
      'home',
      `<section class="home screen">
      <div class="home-top"><span class="edition">一颗苹果 · 无尽挑战</span>${button('settings', '设置', 'quiet')}</div>
      <h1 tabindex="-1">撞墙了么<span class="title-spark" aria-hidden="true">!</span></h1>
      <p class="tagline">你追你的，墙就在那儿。</p>
      <div class="hero-art">${heroArt}</div>
      <div class="home-actions">${button('start', '开始游戏', 'primary')}${button('help', '怎么玩')}
      ${best ? `<p class="endless-best">无尽纪录 · 完成 ${best.cleared} 波 · 撞毁 ${best.defeated} 条</p>` : ''}</div>
    </section>`,
    );
  }
  private start(seed = Math.floor(Math.random() * 0x100000000)): void {
    this.play(createEndless(seed));
  }
  private restart(): void {
    if (this.state) this.start(this.state.endless.seed);
  }
  private play(state: EndlessState): void {
    const { level } = state;
    const back = button('home', '返回首页', 'text-button');
    this.setScreen(
      'play',
      `<section class="play-screen screen"><header class="play-header"><div><small id="round-label" aria-live="polite">第 1 波</small><h1 tabindex="-1">撞墙了么</h1><small class="level-name">${level.name}</small></div>${button('pause', 'Ⅱ', 'pause-button')} </header>
      <div class="hud"><span id="enemy-count"></span><span id="clock">0.0s</span><span id="shield-status">护盾 · 空</span></div>
      <div class="arena-slot"><div id="arena" role="img" aria-busy="true" aria-label="无尽地图：镜头跟随红苹果，左上角显示全览"><span class="loading">正在摆好墙…</span></div></div>
      <div class="field-info"><span id="mechanisms" class="mechanisms"></span><span id="field-notes" class="field-notes" role="status" aria-live="polite"></span><span class="play-status" id="play-status" aria-live="polite"></span></div>
      <aside class="loss-inspection" hidden aria-label="失败现场说明"><b id="loss-title" tabindex="-1"></b><p id="loss-advice"></p><small>红圈 ×：碰撞格 · 金色框：致命敌人的路线</small><div>${button('result', '返回结算')}${button('retry', '再试一次', 'primary')}</div></aside>
      <div class="controls"><div class="dpad joystick" data-joystick role="group" aria-label="全向移动摇杆"><button data-direction="up" aria-label="向上移动">▲</button><button data-direction="left" aria-label="向左移动">◀</button><span class="stick-knob" aria-hidden="true"></span><button data-direction="right" aria-label="向右移动">▶</button><button data-direction="down" aria-label="向下移动">▼</button></div><div class="drop-controls"><div id="drop-guide" class="drop-guide" role="status"></div><button type="button" class="skill lure" data-dodge disabled aria-label="放下诱饵"><span aria-hidden="true">${dropIcons.lure}</span><b>放诱饵</b><small id="lure-note">拾取后可用</small></button></div></div>
      <footer class="play-footer"><span>方向键 / WASD 移动 · 空格放诱饵 · P 暂停</span></footer></section>`,
    );
    this.root
      .querySelector('[data-action="pause"]')
      ?.setAttribute('aria-label', '暂停游戏');
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
      this.dialog(
        `<h2 id="dialog-title">游戏还没准备好</h2><p>重新加载试试，已存纪录会保留。</p>${button('reload', '重新加载页面', 'primary')}${back}`,
      );
    };
    void import('../game/createGame')
      .then(({ createGame }) => {
        if (this.state !== state) return;
        this.game = createGame(arena, {
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
    this.dialog(
      `<h2 id="dialog-title">正在准备</h2><p>地图就绪后立即开始。</p><button type="button" data-action="begin" class="primary" disabled>正在准备…</button>${back}`,
    );
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
      guide.innerHTML = drop
        ? `<span aria-hidden="true">${dropIcons[drop.kind]}</span><b>${dropNames[drop.kind]}</b><small>${drop.kind === 'lure' ? '踩上拾取' : '踩上生效'}</small>`
        : '<b>下一件道具</b><small>马上掉落</small>';
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
  private dialog(html: string, cls = ''): void {
    this.closeDialog();
    this.previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const dialog = document.createElement('dialog');
    dialog.className = `panel ${cls}`;
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    dialog.innerHTML = html;
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
    this.dialog(
      `<h2 id="dialog-title">歇一口气</h2><p>完成 ${run.cleared} 波 · 撞毁 ${run.defeated} 条</p>${button('resume', '继续游戏', 'primary')}${button('retry', '重试同一局')}${button('home', '返回首页', 'text-button')}`,
    );
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
    this.dialog(
      `<div class="result-content"><div class="result-apple sad">${appleArt}</div><p class="result-kicker">无尽挑战</p><h2 id="dialog-title">${this.endlessRecord ? '新的无尽纪录！' : '再骗它一次'}</h2>
      <div class="result-stats"><span><b>${s.endless.cleared}</b>完成波数</span><span><b>${s.endless.defeated}</b>撞毁蛇数</span></div>
      ${best && !this.endlessRecord ? `<p>个人纪录 · ${best.cleared} 波 / ${best.defeated} 条</p>` : ''}
      ${this.storageWarning ? '<p class="save-warning">保存暂不可用，刷新前请保留页面。</p>' : ''}
      <details class="result-options"><summary>更多选择</summary>${button('inspect-loss', '查看失败现场')}</details></div>
      <div class="panel-actions">${button('endless-new', '再来一局', 'primary')}<div class="action-row">${button('retry', '重试同一局')}${button('home', '返回首页', 'text-button')}</div></div>`,
      'lose',
    );
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
    this.dialog(
      `<h2 id="dialog-title">你是苹果，借墙脱身</h2><div class="help-art">${heroArt}</div>
      <ol class="instructions"><li><b>引到墙边。</b>蛇冲出后不会转弯。</li><li><b>横向闪开。</b>留一条侧路，别碰蛇头。</li><li><b>撞完一波，下一波接着来。</b>蛇身不伤人。</li></ol>
      <details class="brief-details"><summary>道具与机关</summary><p>附近会随机掉落道具。踩到护盾会挡一次撞击，踩到冰冻会暂停所有蛇。</p><p>捡到诱饵后，靠墙按「放诱饵」或空格，蛇会转去追你放下的位置。</p><p>踩字母踏板切换同字母门。空心残骸可通过，实心残骸会挡路。</p><p>嫩绿直追，奶黄预判，浅紫用诱饵骗。小星星表示强化。</p></details>
      <details class="brief-details"><summary>按键与纪录</summary><p>拖摇杆自由走位，方向键 / WASD 可组合斜走。空格放诱饵，P 暂停。</p><p>被抓后结算。先比完成波数，同波比撞毁蛇数。</p></details>${button('close', '知道了', 'primary')}`,
    );
  }
  private settings(): void {
    this.dialog(
      `<h2 id="dialog-title">按你的节奏来</h2><div class="setting-row"><span><b id="audio-label">游戏音效</b><small>拾取、撞墙与被抓提示</small></span><button type="button" data-action="mute" class="toggle" role="switch" aria-labelledby="audio-label"></button></div><div class="setting-row"><span><b id="motion-label">减少动态效果</b><small>关闭震动镜头和位移插值</small></span><button type="button" data-action="motion" class="toggle" role="switch" aria-labelledby="motion-label"></button></div><p class="score-rule">无尽纪录和设置保存在当前浏览器。</p><p id="settings-save-warning" class="save-warning" role="status"></p>${button('close', '完成', 'primary')}`,
    );
    this.refreshSettings();
  }
  private refreshSettings(): void {
    for (const [action, enabled, label] of [
      ['mute', !this.save.muted, this.save.muted ? '已静音' : '已开启'],
      [
        'motion',
        this.save.reducedMotion,
        this.save.reducedMotion ? '已开启' : '已关闭',
      ],
    ] as const) {
      const toggle = this.root.querySelector(`[data-action="${action}"]`)!;
      toggle.setAttribute('aria-checked', String(enabled));
      toggle.textContent = label;
    }
    const warning = this.root.querySelector('#settings-save-warning')!;
    const message = this.storageWarning
      ? '保存暂不可用，设置会在本次游玩生效。'
      : '';
    if (warning.textContent !== message) warning.textContent = message;
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
