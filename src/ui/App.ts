import {
  createState,
  setPaused,
  stars,
  tacticComplete,
  inInterference,
} from '../core/engine';
import { availableSkills, SKILLS, TACTICS } from '../core/loadout';
import { HIGHLIGHTS } from '../core/highlights';
import { LEVELS } from '../core/levels';
import {
  beatsEndlessScore,
  createEndless,
  ENDLESS_UNLOCK,
} from '../core/endless';
import { RECHARGE_MS } from '../core/config';
import type { GameState, Level, UtilitySkill } from '../core/types';
import type { createGame } from '../game/createGame';
import { Sound } from '../game/audio';
import {
  dangerText,
  lossAdvice,
  lossTitle,
  utilityFeedback,
} from '../game/feedback';
import { Controls } from '../input/controls';
import {
  CURRENT_SCORING,
  browserStorage,
  readSave,
  recordWin,
  writeSave,
} from '../storage/save';
import { appleArt, heroArt } from './art';
import { utilityIcons, beaconIcon } from './icons';

const ZONES = [
  ['草地热身', '先找一堵墙，再给自己留条侧路。'],
  ['石墙小径', '绕过转角，把每一格电用在合适的时候。'],
  ['岔路花园', '蛇多了也别急，一条一条骗。'],
  ['最后一闪', '离出口不远了，给自己留好最后一条退路。'],
];
const currentStars = (
  best: { stars: number; scoring?: string } | undefined,
): number => (best?.scoring === CURRENT_SCORING ? best.stars : 0);
const seconds = (ms: number): string => (ms / 1000).toFixed(1);
const starText = (value: number): string =>
  '★'.repeat(value) + '☆'.repeat(3 - value);
const button = (action: string, text: string, cls = ''): string =>
  `<button type="button" data-action="${action}" class="${cls}">${text}</button>`;

export class App {
  private save = readSave(browserStorage);
  private sound = new Sound();
  private state?: GameState;
  private game?: ReturnType<typeof createGame>;
  private controls?: Controls;
  private abort = new AbortController();
  private storageWarning = false;
  private screen: 'home' | 'levels' | 'play' = 'home';
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
    const completed = Object.keys(this.save.best).length;
    const totalStars = Object.values(this.save.best).reduce(
      (sum, b) => sum + currentStars(b),
      0,
    );
    const best = this.save.endlessBest;
    this.setScreen(
      'home',
      `<section class="home screen">
      <div class="home-top"><span class="edition">一颗苹果 · 二十关</span>${button('settings', '设置', 'quiet')}</div>
      <h1 tabindex="-1">撞墙了么<span class="title-spark" aria-hidden="true">!</span></h1>
      <p class="tagline">你追你的，墙就在那儿。</p>
      <div class="hero-art">${heroArt}</div>
      <div class="home-actions">${button(completed ? 'continue' : 'start', completed ? `继续挑战 · 第 ${this.save.unlocked} 关` : '开始游戏', 'primary')}
      ${
        this.save.unlocked >= ENDLESS_UNLOCK
          ? button('endless', '无尽挑战', 'endless-entry')
          : '<button type="button" class="endless-entry" disabled>无尽挑战 · 第 5 关后解锁</button>'
      }
      ${best ? `<p class="endless-best">无尽纪录 · 完成 ${best.cleared} 波 · 撞毁 ${best.defeated} 条</p>` : ''}
      <div class="action-row">${button('levels', '选择关卡')}${button('help', '怎么玩')}</div>
      ${completed ? button('start', '从第一关开始', 'text-button') : ''}</div>
      ${this.save.legacyCompleted ? `<p class="legacy-note">旧版 ${this.save.legacyCompleted} 关记录已保留，进阶挑战重新计分。</p>` : ''}<footer class="home-footer"><span>${completed === 20 ? '20 关已通关，自由重玩' : `已通关 ${completed} / 20`}</span><span class="stars">${totalStars} / 60 ★</span></footer>
    </section>`,
    );
  }
  private collectionNotes(): string {
    const earned = new Set(
      Object.values(this.save.collections).flatMap((c) => c.highlights),
    );
    const chips = LEVELS.filter((l) => l.chip);
    const collected = chips.filter(
      (l) => this.save.collections[String(l.id)]?.chip,
    ).length;
    return `<section class="collection-notes" aria-label="试验档案"><h2>试验档案 <small>芯片 ${collected} / ${chips.length} · 精彩操作 ${earned.size} / ${Object.keys(HIGHLIGHTS).length}</small></h2>
      <div class="highlight-archive">${Object.entries(HIGHLIGHTS)
        .map(
          ([id, h]) =>
            `<p class="${earned.has(id as keyof typeof HIGHLIGHTS) ? 'earned' : ''}"><b>${earned.has(id as keyof typeof HIGHLIGHTS) ? '✓' : '○'} ${h.title}</b><small>${h.description}</small></p>`,
        )
        .join('')}</div>
      ${chips.map((l) => `<article class="memory-card"><b>第 ${l.id} 关 · ${this.save.collections[String(l.id)]?.chip ? l.chip!.title : '待回收芯片'}</b><p>${this.save.collections[String(l.id)]?.chip ? l.chip!.memory : '可选支线，拾取并通关后解锁这段记忆。'}</p></article>`).join('')}</section>`;
  }
  private levels(): void {
    this.setScreen(
      'levels',
      `<section class="level-screen screen"><header class="page-header">${button('home', '‹ 首页', 'quiet')}<h1 tabindex="-1">选一堵墙</h1><span>${Object.values(this.save.best).reduce((n, b) => n + currentStars(b), 0)} ★</span></header>
      <p class="page-intro">引到墙边，闪开。</p>
      ${[0, 1, 2, 3]
        .map(
          (chapter) =>
            `<section class="chapter"><h2><span>第 ${chapter + 1} 章</span>${LEVELS[chapter * 5]!.chapter}</h2><div class="level-grid">${LEVELS.slice(
              chapter * 5,
              chapter * 5 + 5,
            )
              .map((l) => {
                const best = this.save.best[String(l.id)],
                  locked = l.id > this.save.unlocked;
                return `<button class="level ${locked ? 'locked' : ''} ${l.id === this.save.unlocked ? 'current' : ''}" data-action="level:${l.id}" ${locked ? 'disabled' : ''} aria-label="第 ${l.id} 关 ${l.name}${locked ? '，未解锁' : `，${currentStars(best)} 星`}"><b>${String(l.id).padStart(2, '0')}</b><span>${l.name}</span><small class="stars">${locked ? '未解锁' : best && best.scoring !== CURRENT_SCORING ? `历史 ${starText(best.stars)}` : starText(currentStars(best))}</small>${l.chip ? `<small class="chip-label">${this.save.collections[String(l.id)]?.chip ? '芯片 ✓' : '芯片 ◇'}</small>` : ''}</button>`;
              })
              .join('')}</div></section>`,
        )
        .join('')}
      <details class="brief-details"><summary>星级怎么算</summary><p>过关、时间、本关目标各一星。旧成绩保留为历史。</p></details><details class="archive-details"><summary>收藏与记录</summary>${this.collectionNotes()}</details></section>`,
    );
  }
  private start(id: number, brief = true): void {
    if (id < 1 || id > this.save.unlocked) return;
    this.play(createState(LEVELS[id - 1]!, this.save.utility), brief);
  }
  private startEndless(
    seed = Math.floor(Math.random() * 0x100000000),
    brief = true,
  ): void {
    if (this.save.unlocked < ENDLESS_UNLOCK) return;
    this.play(
      createEndless(seed, this.save.utility, this.save.unlocked),
      brief,
    );
  }
  private restart(brief: boolean): void {
    if (this.state?.endless) this.startEndless(this.state.endless.seed, brief);
    else if (this.state) this.start(this.state.level.id, brief);
  }
  private play(state: GameState, brief: boolean): void {
    const { level, endless } = state;
    const id = level.id;
    const back = endless
      ? button('home', '返回首页', 'text-button')
      : button('levels', '返回选关', 'text-button');
    this.setScreen(
      'play',
      `<section class="play-screen screen" data-zone="${endless ? 0 : Math.floor((id - 1) / 5)}"><header class="play-header"><div><small id="round-label"${endless ? ' aria-live="polite"' : ''}>${endless ? '第 1 波' : `第 ${String(id).padStart(2, '0')} 关 / 20`}</small><h1 tabindex="-1">撞墙了么</h1><small class="level-name">${level.name}</small></div>${button('pause', 'Ⅱ', 'pause-button')} </header>
      <div class="hud"><span id="enemy-count"></span><span id="clock">0.0s</span><span id="cooldown" class="ready">电量 ▰▰</span></div>
      <div class="arena-slot"><div id="arena" role="img" aria-busy="true" aria-label="${endless ? '无尽地图：镜头跟随红苹果，左上角显示全览' : '对局地图：红苹果、三种蛇、石墙、字母闸门、残骸与可选收藏'}"><span class="loading">正在摆好墙…</span></div></div>
      <div class="field-info"><span id="mechanisms" class="mechanisms"></span><span id="field-notes" class="field-notes" role="status" aria-live="polite"></span><span class="play-status" id="play-status" aria-live="polite"></span></div>
      <aside class="loss-inspection" hidden aria-label="失败现场说明"><b id="loss-title" tabindex="-1"></b><p id="loss-advice"></p><small>红圈 ×：碰撞格 · 金色框：致命敌人的路线</small><div>${button('result', '返回结算')}${button('retry', '再试一次', 'primary')}</div></aside>
      <div class="controls"><div class="dpad joystick" data-joystick role="group" aria-label="全向移动摇杆"><button data-direction="up" aria-label="向上移动">▲</button><button data-direction="left" aria-label="向左移动">◀</button><span class="stick-knob" aria-hidden="true"></span><button data-direction="right" aria-label="向右移动">▶</button><button data-direction="down" aria-label="向下移动">▼</button></div><div class="skills"><button class="skill dodge" data-dodge aria-label="闪避"><span class="skill-symbol" aria-hidden="true">↟</span><b>闪避</b><small id="dodge-text">1 格电</small></button><button class="skill beacon" data-beacon aria-label="信标" ${level.beaconEnabled ? '' : 'disabled'}><span aria-hidden="true">${beaconIcon}</span><b>信标</b><small id="beacon-text">${level.beaconEnabled ? '1 格电' : '未启用'}</small></button></div></div>
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
        `<h2 id="dialog-title">游戏还没准备好</h2><p>重新加载试试，已存进度会保留。</p>${button('reload', '重新加载页面', 'primary')}${back}`,
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
              begin.textContent = endless ? '开始挑战' : '进入试验';
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
            if (events.some((e) => e.type === 'won' || e.type === 'lost'))
              this.finishRound();
          },
        });
      })
      .catch(fail);
    this.refreshUtility();
    this.hud();
    if (endless) {
      this.dialog(
        `<div class="brief-content"><p class="result-kicker">${level.name} · ${level.width} × ${level.height} 格</p><h2 id="dialog-title">${brief ? '无尽挑战' : '准备重试'}</h2>${brief ? `<p>${level.focus}</p>${this.loadout(level)}<details class="brief-details"><summary>规则与纪录</summary><p>地图全程不换，镜头跟随苹果。被抓时结算：先比完成波数，同波比撞毁数。</p><p>小地图红点是苹果。波间出现两个进场区，粗框是当前选择。留守或朝另一个区走，就能决定从哪边接战。旧残骸会在几波后碎掉。</p></details>` : '<p>就绪后立即重试同一局。</p>'}</div><div class="panel-actions"><button type="button" data-action="begin" class="primary" disabled>正在准备…</button>${back}</div>`,
        'preparation',
      );
      return;
    }
    this.dialog(
      `<div class="brief-content"><p class="result-kicker">第 ${level.id} 关 · ${level.name}</p><h2 id="dialog-title">${brief ? '试验准备' : '准备重试'}</h2>${brief ? `<p>${level.focus}</p>${level.chip ? '<p class="chip-note">◇ 可选收藏，通关后保存。</p>' : ''}${availableSkills(level).length > 1 ? this.loadout(level) : ''}<details class="brief-details"><summary>目标与操作</summary><p>目标 ${level.parMs / 1000} 秒 · ${TACTICS[level.tactic ?? 'first-lure']}</p><p>${level.decision ?? '把蛇引到墙边，再横向闪开。'}</p><p class="zone-note">${ZONES[Math.floor((id - 1) / 5)]![0]} · ${ZONES[Math.floor((id - 1) / 5)]![1]}</p><p class="score-rule">${id < 5 ? '空格使用闪避；信标从第5关启用。' : '各用一格电；空格使用所选工具，E投信标。'}第6关解锁脉冲，第9关解锁磁推。</p></details>` : '<p>正在重新摆好试验场，就绪后立即开始。</p>'}</div><div class="panel-actions"><button type="button" data-action="begin" class="primary" disabled>正在准备…</button>${button('levels', '返回选关', 'text-button')}</div>`,
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
    if (s.endless) text('round-label', `第 ${s.endless.wave} 波`);
    const waveBreak = s.endless?.nextWaveMs ?? 0;
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
    const beaconReady = s.energy > 0 && !s.beacon && s.level.beaconEnabled;
    text('dodge-text', utility.text);
    const utilityNote = this.root.querySelector<HTMLElement>('#dodge-text');
    if (utilityNote) utilityNote.hidden = utility.ready;
    text(
      'beacon-text',
      !s.level.beaconEnabled
        ? '未启用'
        : s.beacon
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
    text(
      'field-notes',
      [
        s.level.chip ? (s.chipCollected ? '◇ 芯片已携带' : '◇ 芯片待回收') : '',
        recent ? `✓ ${HIGHLIGHTS[recent.id].title}` : '',
      ]
        .filter(Boolean)
        .join(' ｜ '),
    );
    const danger = dangerText(s);
    const choice = s.endless?.waveChoice;
    const waveMessage = choice
      ? choice.selected === 0
        ? '本波清空 · 可移向另一框换区'
        : '本波清空 · 已选转场区'
      : '本波清空 · 下一波将至';
    text(
      'play-status',
      s.status === 'won'
        ? '撞墙了！'
        : s.status === 'lost'
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
    if (run) {
      this.dialog(
        `<h2 id="dialog-title">歇一口气</h2><p>完成 ${run.cleared} 波 · 撞毁 ${run.defeated} 条</p>${button('resume', '继续游戏', 'primary')}${button('retry', '重试同一局')}${button('loadout', '更换装备并重开')}${button('home', '返回首页', 'text-button')}`,
      );
      return;
    }
    this.dialog(
      `<h2 id="dialog-title">歇一口气</h2><details class="brief-details"><summary>目标与操作</summary><p>${this.state.level.focus}</p><p>目标 ${this.state.level.parMs / 1000} 秒 · ${TACTICS[this.state.level.tactic ?? 'first-lure']}</p><p>方向键 / WASD 移动，空格使用${SKILLS[this.state.utility].name}，E 放信标。两个工具共用电量，每 3 秒恢复一格。</p><p>门的字母与踏板配对；空心残骸可通过，实心残骸会挡路。</p></details>${button('resume', '继续游戏', 'primary')}${button('retry', '重新挑战')}${button('loadout', '更换装备并重开')}${button('levels', '返回选关', 'text-button')}`,
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
    if (s.status === 'won') {
      recordWin(this.save, s);
      this.persist();
    } else if (
      s.endless &&
      beatsEndlessScore(s.endless, this.save.endlessBest)
    ) {
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
    const won = s.status === 'won',
      complete = won && s.level.id === 20;
    this.inspectingLoss = false;
    this.root
      .querySelector('.play-screen')
      ?.classList.remove('inspecting', 'ending');
    const inspection = this.root.querySelector<HTMLElement>('.loss-inspection');
    if (inspection) inspection.hidden = true;
    if (s.endless) {
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
      return;
    }
    this.dialog(
      `<div class="result-content"><div class="result-apple ${won ? '' : 'sad'}">${appleArt}</div><p class="result-kicker">${complete ? '二十关，全都撞过了！' : won ? `第 ${s.level.id} 关完成` : '差一点，就闪开了'}</p><h2 id="dialog-title">${complete ? '墙都记住你了！' : won ? '撞墙了吧！' : '再骗它一次'}</h2>
      ${won ? `<div class="result-stars" aria-label="本关 ${stars(s)} 星">${starText(stars(s))}</div><p class="result-time">${seconds(s.elapsedMs)} 秒 · ${s.snakes.length} 条蛇全撞墙</p>` : `<p class="loss-cause">${lossTitle(s)}</p><p>${lossAdvice(s)}</p>`}
      ${this.storageWarning ? '<p class="save-warning">保存暂不可用，刷新前请保留页面。</p>' : ''}
      <details class="result-options"><summary>${won ? '成绩与装备' : '更多选择'}</summary>
      ${won ? `<div class="result-stats"><span><b>${seconds(s.elapsedMs)}s</b>通关用时</span><span><b>${s.dodges + s.pulses + s.pushes} / ${s.beacons}</b>${SKILLS[s.utility].name} / 信标</span></div><p class="score-rule">${s.elapsedMs <= s.level.parMs ? '✓' : '○'} ${s.level.parMs / 1000} 秒内通关 · ${tacticComplete(s) ? '✓' : '○'} ${TACTICS[s.level.tactic ?? 'first-lure']}</p><div class="result-highlights" aria-label="本局精彩操作">${s.highlights.map((h) => `<span>✓ ${HIGHLIGHTS[h.id].title}</span>`).join('')}</div>` : ''}
      ${s.level.chip ? `<p class="chip-note">${won && s.chipCollected ? `芯片已归档 · ${s.level.chip.title}<br>${s.level.chip.memory}` : s.chipCollected ? '芯片未带出 · 通关后才保存。' : '可选芯片未拾取，可重玩回收。'}</p>` : ''}
      ${button('loadout', '更换装备')}</details></div>
      <div class="panel-actions">${complete ? button('levels', '自由重玩', 'primary') : won ? button('next', '下一关', 'primary') : button('retry', '再试一次', 'primary')}
      <div class="action-row">${won ? button('retry', '重试本关', 'text-button') : button('inspect-loss', '查看失败现场', 'text-button')}${button('levels', '返回选关', 'text-button')}</div></div>`,
      won ? 'win' : 'lose',
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
      <ol class="instructions"><li><b>引到墙边。</b>蛇冲出后不会转弯。</li><li><b>横向闪开。</b>普通走位或闪避都行，别碰蛇头。</li><li><b>全撞墙，就过关。</b>蛇身不伤人。</li></ol>
      <details class="brief-details"><summary>技能与机关</summary><p>闪避走两格；信标朝前投出，骗蛇追它。共用两格电，每 ${RECHARGE_MS / 1000} 秒恢复一格。</p><p>第6关可选脉冲，暂停近处的蛇；第9关可选磁推，推开面前残骸。</p><p>踩字母踏板切换同字母门。空心残骸可通过，实心残骸会挡路。</p><p>嫩绿直追，奶黄预判，浅紫用信标骗。小星星表示强化。</p></details>
      <details class="brief-details"><summary>按键与收藏</summary><p>拖摇杆自由走位，方向键 / WASD 可组合斜走。空格用工具，E 放信标，P 暂停。</p><p>过关、时间、本关目标各一星。收藏通关后保存，选关页可查看。</p></details>${button('close', '知道了', 'primary')}`,
    );
  }
  private settings(): void {
    this.dialog(
      `<h2 id="dialog-title">按你的节奏来</h2><div class="setting-row"><span><b id="audio-label">游戏音效</b><small>闪避、撞墙与过关提示</small></span><button type="button" data-action="mute" class="toggle" role="switch" aria-labelledby="audio-label"></button></div><div class="setting-row"><span><b id="motion-label">减少动态效果</b><small>关闭震动镜头和位移插值</small></span><button type="button" data-action="motion" class="toggle" role="switch" aria-labelledby="motion-label"></button></div><p class="score-rule">进度保存在当前浏览器。</p><p id="settings-save-warning" class="save-warning" role="status"></p>${button('close', '完成', 'primary')}`,
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
    if (action.startsWith('level:')) {
      this.start(Number(action.split(':')[1]));
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
      case 'levels':
        this.levels();
        break;
      case 'start':
        this.start(1);
        break;
      case 'continue':
        this.start(this.save.unlocked);
        break;
      case 'pause':
        this.pause();
        break;
      case 'begin':
      case 'resume':
        this.resume();
        break;
      case 'endless':
        this.startEndless();
        break;
      case 'endless-new':
        this.startEndless(undefined, false);
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
      case 'next':
        if (this.state?.status === 'won') this.start(this.state.level.id + 1);
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
