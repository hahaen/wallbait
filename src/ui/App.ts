import { setPaused, inInterference } from '../core/engine';
import { availableSkills, SKILLS } from '../core/loadout';
import { HIGHLIGHTS } from '../core/highlights';
import { beatsEndlessScore, createEndless } from '../core/endless';
import { RECHARGE_MS } from '../core/config';
import type { EndlessState, Level, UtilitySkill } from '../core/types';
import type { createGame } from '../game/createGame';
import { Sound } from '../game/audio';
import {
  dangerText,
  lossAdvice,
  lossTitle,
  utilityFeedback,
} from '../game/feedback';
import { Controls } from '../input/controls';
import { browserStorage, readSave, writeSave } from '../storage/save';
import { appleArt, heroArt } from './art';
import { utilityIcons, beaconIcon } from './icons';

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
  private start(
    seed = Math.floor(Math.random() * 0x100000000),
    brief = true,
  ): void {
    this.play(createEndless(seed, this.save.utility), brief);
  }
  private restart(brief: boolean): void {
    if (this.state) this.start(this.state.endless.seed, brief);
  }
  private play(state: EndlessState, brief: boolean): void {
    const { level } = state;
    const back = button('home', '返回首页', 'text-button');
    this.setScreen(
      'play',
      `<section class="play-screen screen"><header class="play-header"><div><small id="round-label" aria-live="polite">第 1 波</small><h1 tabindex="-1">撞墙了么</h1><small class="level-name">${level.name}</small></div>${button('pause', 'Ⅱ', 'pause-button')} </header>
      <div class="hud"><span id="enemy-count"></span><span id="clock">0.0s</span><span id="cooldown" class="ready">电量 ▰▰</span></div>
      <div class="arena-slot"><div id="arena" role="img" aria-busy="true" aria-label="无尽地图：镜头跟随红苹果，左上角显示全览"><span class="loading">正在摆好墙…</span></div></div>
      <div class="field-info"><span id="mechanisms" class="mechanisms"></span><span id="field-notes" class="field-notes" role="status" aria-live="polite"></span><span class="play-status" id="play-status" aria-live="polite"></span></div>
      <aside class="loss-inspection" hidden aria-label="失败现场说明"><b id="loss-title" tabindex="-1"></b><p id="loss-advice"></p><small>红圈 ×：碰撞格 · 金色框：致命敌人的路线</small><div>${button('result', '返回结算')}${button('retry', '再试一次', 'primary')}</div></aside>
      <div class="controls"><div class="dpad joystick" data-joystick role="group" aria-label="全向移动摇杆"><button data-direction="up" aria-label="向上移动">▲</button><button data-direction="left" aria-label="向左移动">◀</button><span class="stick-knob" aria-hidden="true"></span><button data-direction="right" aria-label="向右移动">▶</button><button data-direction="down" aria-label="向下移动">▼</button></div><div class="skills"><button class="skill dodge" data-dodge aria-label="闪避"><span class="skill-symbol" aria-hidden="true">↟</span><b>闪避</b><small id="dodge-text">1 格电</small></button><button class="skill beacon" data-beacon aria-label="信标"><span aria-hidden="true">${beaconIcon}</span><b>信标</b><small id="beacon-text">1 格电</small></button></div></div>
      <footer class="play-footer"><span>方向键 / WASD · 空格闪避 · E 信标 · P 暂停</span></footer></section>`,
    );
    this.root
      .querySelector('[data-action="pause"]')
      ?.setAttribute('aria-label', '暂停游戏');
    this.state = state;
    setPaused(state, true);
    this.autoStart = !brief;
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
            events.forEach((e) => this.sound.play(e.type));
            this.hud();
            if (events.some((e) => e.type === 'lost')) this.finishRound();
          },
        });
      })
      .catch(fail);
    this.refreshUtility();
    this.hud();
    this.dialog(
      `<div class="brief-content"><p class="result-kicker">${level.name} · ${level.width} × ${level.height} 格</p><h2 id="dialog-title">${brief ? '无尽挑战' : '正在准备'}</h2>${brief ? `<p>${level.focus}</p>${this.loadout(level)}<details class="brief-details"><summary>规则与纪录</summary><p>地图全程不换，镜头跟随苹果。被抓时结算：先比完成波数，同波比撞毁数。</p><p>小地图红点是苹果。波间出现两个进场区，粗框是当前选择。留守或朝另一个区走，就能决定从哪边接战。旧残骸会在几波后碎掉。</p></details>` : '<p>地图就绪后立即开始。</p>'}</div><div class="panel-actions"><button type="button" data-action="begin" class="primary" disabled>正在准备…</button>${back}</div>`,
      'preparation',
    );
  }
  private loadout(level: Level): string {
    return `<section class="loadout" aria-label="选择装备"><h3>选个工具</h3><div class="loadout-options">${availableSkills(
      level,
    )
      .map(
        (id) =>
          `<button data-action="equip:${id}" aria-pressed="${this.state?.utility === id}"><b>${SKILLS[id].symbol} ${SKILLS[id].name}</b><small>${{ dodge: '快速移动两格', pulse: '暂停近处的蛇', magnet: '推开面前残骸' }[id]}</small></button>`,
      )
      .join('')}</div></section>`;
  }
  private refreshUtility(): void {
    if (!this.state) return;
    const skill = SKILLS[this.state.utility];
    const node = this.root.querySelector<HTMLButtonElement>('[data-dodge]');
    node?.setAttribute('aria-label', skill.name);
    if (node) node.dataset.utility = this.state.utility;
    const name = node?.querySelector('b'),
      icon = node?.querySelector('span');
    if (name) name.textContent = skill.name;
    if (icon) icon.innerHTML = utilityIcons[this.state.utility];
    const keys = this.root.querySelector('.play-footer span');
    if (keys)
      keys.textContent = `方向键 / WASD · 空格${skill.name} · E 信标 · P 暂停`;
    for (const option of this.root.querySelectorAll<HTMLElement>(
      '[data-action^="equip:"]',
    ))
      option.setAttribute(
        'aria-pressed',
        String(option.dataset.action === `equip:${this.state.utility}`),
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
    text(
      'cooldown',
      `电量 ${'▰'.repeat(s.energy)}${'▱'.repeat(2 - s.energy)}${s.energy < 2 ? (inInterference(s) ? ' · 干扰' : ` ${Math.ceil((RECHARGE_MS - s.rechargeMs) / 1000)}s`) : ''}`,
    );
    const utility = utilityFeedback(s);
    const dodgeReady = utility.ready;
    const beaconReady = s.energy > 0 && !s.beacon;
    text('dodge-text', utility.text);
    const utilityNote = this.root.querySelector<HTMLElement>('#dodge-text');
    if (utilityNote) utilityNote.hidden = utility.ready;
    text(
      'beacon-text',
      s.beacon
        ? `${seconds(s.beacon.remainingMs)}s`
        : beaconReady
          ? ''
          : inInterference(s)
            ? '干扰停充'
            : '充电中',
    );
    this.root
      .querySelector('#cooldown')
      ?.classList.toggle('ready', s.energy > 0);
    for (const [selector, ready] of [
      ['.dodge', dodgeReady],
      ['.beacon', beaconReady],
    ] as const) {
      const skill = this.root.querySelector<HTMLElement>(selector);
      skill?.classList.toggle('cooling', !ready);
      skill?.setAttribute('aria-disabled', String(!ready));
    }
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
        inInterference(s) ? '干扰场：离开条纹区恢复回充' : '',
        s.beacon ? `信标 ${seconds(s.beacon.remainingMs)}s` : '',
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
    text('field-notes', recent ? `✓ ${HIGHLIGHTS[recent.id].title}` : '');
    const danger = dangerText(s);
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
      `<h2 id="dialog-title">歇一口气</h2><p>完成 ${run.cleared} 波 · 撞毁 ${run.defeated} 条</p>${button('resume', '继续游戏', 'primary')}${button('retry', '重试同一局')}${button('loadout', '更换装备并重开')}${button('home', '返回首页', 'text-button')}`,
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
      <details class="result-options"><summary>更多选择</summary>${button('inspect-loss', '查看失败现场')}${button('loadout', '更换装备')}</details></div>
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
      <ol class="instructions"><li><b>引到墙边。</b>蛇冲出后不会转弯。</li><li><b>横向闪开。</b>普通走位或闪避都行，别碰蛇头。</li><li><b>撞完一波，下一波接着来。</b>蛇身不伤人。</li></ol>
      <details class="brief-details"><summary>技能与机关</summary><p>闪避走两格；信标朝前投出，骗蛇追它。共用两格电，每 ${RECHARGE_MS / 1000} 秒恢复一格。</p><p>每局可选闪避、脉冲或磁推。脉冲暂停近处的蛇，磁推能推开面前的残骸。</p><p>踩字母踏板切换同字母门。空心残骸可通过，实心残骸会挡路。</p><p>嫩绿直追，奶黄预判，浅紫用信标骗。小星星表示强化。</p></details>
      <details class="brief-details"><summary>按键与纪录</summary><p>拖摇杆自由走位，方向键 / WASD 可组合斜走。空格用工具，E 放信标，P 暂停。</p><p>被抓后结算。先比完成波数，同波比撞毁蛇数。</p></details>${button('close', '知道了', 'primary')}`,
    );
  }
  private settings(): void {
    this.dialog(
      `<h2 id="dialog-title">按你的节奏来</h2><div class="setting-row"><span><b id="audio-label">游戏音效</b><small>工具、撞墙与被抓提示</small></span><button type="button" data-action="mute" class="toggle" role="switch" aria-labelledby="audio-label"></button></div><div class="setting-row"><span><b id="motion-label">减少动态效果</b><small>关闭震动镜头和位移插值</small></span><button type="button" data-action="motion" class="toggle" role="switch" aria-labelledby="motion-label"></button></div><p class="score-rule">无尽纪录和设置保存在当前浏览器。</p><p id="settings-save-warning" class="save-warning" role="status"></p>${button('close', '完成', 'primary')}`,
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
    if (action.startsWith('equip:')) {
      const skill = action.split(':')[1] as UtilitySkill;
      if (
        this.state?.paused &&
        this.state.elapsedMs === 0 &&
        availableSkills(this.state.level).includes(skill)
      ) {
        this.state.utility = skill;
        this.save.utility = skill;
        this.persist();
        this.controls?.clear();
        this.refreshUtility();
        this.hud();
      }
      return;
    }
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
        this.start(undefined, false);
        break;
      case 'loadout':
        this.restart(true);
        break;
      case 'retry':
        this.restart(false);
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
