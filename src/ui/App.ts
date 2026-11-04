import { createState, setPaused, stars } from '../core/engine';
import { LEVELS } from '../core/levels';
import { BEACON_MS, RECHARGE_MS } from '../core/config';
import type { GameState } from '../core/types';
import type { createGame } from '../game/createGame';
import { Sound } from '../game/audio';
import { dangerText, enemyName, lossAdvice, lossTitle } from '../game/feedback';
import { Controls } from '../input/controls';
import {
  browserStorage,
  readSave,
  recordWin,
  writeSave,
} from '../storage/save';
import { robotArt, heroArt } from './art';

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
        if (document.hidden) this.pause();
      },
      { signal },
    );
    root.addEventListener(
      'cancel',
      (event) => {
        event.preventDefault();
        if (this.state?.paused) this.resume();
        else if (this.screen !== 'play') this.closeDialog();
      },
      { signal, capture: true },
    );
    this.home();
  }
  private cleanupGame(): void {
    this.controls?.destroy();
    this.controls = undefined;
    this.game?.destroy();
    this.game = undefined;
    this.state = undefined;
    this.inspectingLoss = false;
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
      (sum, b) => sum + b.stars,
      0,
    );
    this.setScreen(
      'home',
      `<section class="home screen">
      <div class="home-top"><span class="edition">试验场进阶版 / 20 关</span>${button('settings', '设置', 'quiet')}</div>
      <h1 tabindex="-1">撞墙了么<span class="title-spark" aria-hidden="true">!</span></h1>
      <p class="tagline">你追你的，墙就在那儿。</p>
      <div class="hero-art">${heroArt}</div>
      <p class="home-pitch">小小阿零，大有办法。</p>
      <p class="home-instruction">设局 · 切门 · 留电，让墙来收场</p>
      <div class="home-actions">${button(completed ? 'continue' : 'start', completed ? `继续挑战 · 第 ${this.save.unlocked} 关` : '开始游戏', 'primary')}
      <div class="action-row">${button('levels', '选择关卡')}${button('help', '怎么玩')}</div>
      ${completed ? button('start', '从第一关开始', 'text-button') : ''}</div>
      ${this.save.legacyCompleted ? `<p class="legacy-note">旧版 ${this.save.legacyCompleted} 关记录已保留，进阶挑战重新计分。</p>` : ''}<footer class="home-footer"><span>${completed === 20 ? '20 关已通关，自由重玩' : `已通关 ${completed} / 20`}</span><span class="stars">${totalStars} / 60 ★</span></footer>
    </section>`,
    );
  }
  private levels(): void {
    this.setScreen(
      'levels',
      `<section class="level-screen screen"><header class="page-header">${button('home', '‹ 首页', 'quiet')}<h1 tabindex="-1">选一堵墙</h1><span>${Object.values(this.save.best).reduce((n, b) => n + b.stars, 0)} ★</span></header>
      <p class="page-intro">四区试炼，逐关解锁。已通关的关卡可自由重玩。</p>
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
                return `<button class="level ${locked ? 'locked' : ''} ${l.id === this.save.unlocked ? 'current' : ''}" data-action="level:${l.id}" ${locked ? 'disabled' : ''} aria-label="第 ${l.id} 关 ${l.name}${locked ? '，未解锁' : `，${best?.stars ?? 0} 星`}"><b>${String(l.id).padStart(2, '0')}</b><span>${l.name}</span><small class="stars">${locked ? '未解锁' : starText(best?.stars ?? 0)}</small></button>`;
              })
              .join('')}</div></section>`,
        )
        .join('')}
      <p class="footnote">过关一星，时间达标一星，闪避次数达标一星。</p></section>`,
    );
  }
  private start(id: number, brief = true): void {
    if (id < 1 || id > this.save.unlocked) return;
    const level = LEVELS[id - 1]!;
    this.setScreen(
      'play',
      `<section class="play-screen screen"><header class="play-header"><div><small>第 ${String(id).padStart(2, '0')} / 20 关</small><h1 tabindex="-1">${level.name}</h1></div>${button('pause', 'Ⅱ', 'pause-button')} </header>
      <div class="hud"><span id="enemy-count"></span><span id="clock">0.0s</span><span id="cooldown" class="ready">电量 ▰▰</span><span id="mechanisms" class="mechanisms"></span></div>
      <div class="arena-slot"><div id="arena" role="img" aria-label="对局地图：青色机器人阿零、机械追逐者、墙、配对闸门与橙色危险通道"><span class="loading">正在摆好墙…</span></div></div>
      <div class="play-status" id="play-status" aria-live="polite">${level.focus}</div>
      <aside class="loss-inspection" hidden aria-label="失败现场说明"><b id="loss-title" tabindex="-1"></b><p id="loss-advice"></p><small>红圈 ×：碰撞格 · 金色框：致命敌人的路线</small><div>${button('result', '返回结算')}${button('retry', '再试一次', 'primary')}</div></aside>
      <div class="controls"><div class="dpad" aria-label="四向移动"><button data-direction="up" aria-label="向上移动">▲</button><button data-direction="left" aria-label="向左移动">◀</button><span aria-hidden="true">移动</span><button data-direction="right" aria-label="向右移动">▶</button><button data-direction="down" aria-label="向下移动">▼</button></div><div class="skills"><button class="skill dodge" data-dodge aria-label="闪避"><span aria-hidden="true">↟</span><b>闪避</b><small id="dodge-text">1 格电</small></button><button class="skill beacon" data-beacon aria-label="信标" ${level.beaconEnabled ? '' : 'disabled'}><span aria-hidden="true">⌖</span><b>信标</b><small id="beacon-text">${level.beaconEnabled ? '1 格电' : '未启用'}</small></button></div></div>
      <footer class="play-footer"><span>方向键 / WASD · 空格闪避 · E 信标 · P 暂停</span><span>目标 ${level.parMs / 1000}s / ≤${level.parDodges} 次闪避</span></footer></section>`,
    );
    this.root
      .querySelector('[data-action="pause"]')
      ?.setAttribute('aria-label', '暂停游戏');
    const state = createState(level);
    this.state = state;
    if (brief) setPaused(state, true);
    this.controls = new Controls(
      this.root,
      () => state.status === 'playing' && !state.paused,
      () =>
        this.inspectingLoss
          ? this.result()
          : state.paused
            ? this.resume()
            : this.pause(),
    );
    const arena = this.root.querySelector<HTMLElement>('#arena')!;
    void import('../game/createGame')
      .then(({ createGame }) => {
        if (this.state !== state) return;
        this.game = createGame(arena, {
          state,
          command: () => this.controls?.sample() ?? { direction: null },
          reducedMotion: () =>
            this.save.reducedMotion ||
            matchMedia('(prefers-reduced-motion: reduce)').matches,
          onTick: (events) => {
            if (this.state !== state) return;
            events.forEach((e) => this.sound.play(e.type));
            this.hud();
            if (events.some((e) => e.type === 'won' || e.type === 'lost'))
              this.result();
          },
        });
        arena.querySelector('.loading')?.remove();
      })
      .catch(() => {
        if (this.state !== state) return;
        this.dialog(
          `<h2 id="dialog-title">游戏资源还没到齐</h2><p>请检查网络后重新加载本关。</p>${button('retry', '重新加载', 'primary')}${button('levels', '返回选关', 'text-button')}`,
        );
      });
    this.hud();
    if (brief) {
      this.controls.clear();
      this.game?.resetClock();
      this.dialog(
        `<p class="result-kicker">第 ${level.id} 关 · ${level.chapter}</p><h2 id="dialog-title">试验准备</h2><p>${level.focus}</p><p class="score-rule">${level.decision}</p>${button('begin', '进入试验', 'primary')}${button('levels', '返回选关', 'text-button')}`,
      );
    }
  }
  private hud(): void {
    const s = this.state;
    if (!s) return;
    const text = (id: string, value: string): void => {
      const node = this.root.querySelector(`#${id}`);
      if (node && node.textContent !== value) node.textContent = value;
    };
    text(
      'enemy-count',
      `剩余 ${s.snakes.filter((v) => v.alive).length} / ${s.snakes.length}`,
    );
    text('clock', `${seconds(s.elapsedMs)}s`);
    text(
      'cooldown',
      `电量 ${'▰'.repeat(s.energy)}${'▱'.repeat(2 - s.energy)}${s.energy < 2 ? ` · ${seconds(RECHARGE_MS - s.rechargeMs)}s` : ''}`,
    );
    const dodgeReady = s.energy > 0 && s.cooldownMs === 0;
    const beaconReady = s.energy > 0 && !s.beacon && s.level.beaconEnabled;
    text('dodge-text', dodgeReady ? '1 格电' : s.energy ? '缓冲中' : '充电中');
    text(
      'beacon-text',
      !s.level.beaconEnabled
        ? '未启用'
        : s.beacon
          ? `${seconds(s.beacon.remainingMs)}s`
          : beaconReady
            ? '1 格电'
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
        s.beacon
          ? `信标 ${seconds(s.beacon.remainingMs)}s`
          : s.level.beaconEnabled
            ? '闪避 / 信标共用电量'
            : '闪避两格 · 每3秒回1电',
      ]
        .filter(Boolean)
        .join('  |  '),
    );
    const danger = dangerText(s);
    const recovering = s.snakes.filter(
      (v) => v.alive && v.phase === 'recovering',
    );
    text(
      'play-status',
      s.status === 'lost'
        ? lossTitle(s)
        : danger
          ? danger
          : recovering.length
            ? `${recovering.map((v) => `${enemyName(v)}恢复`).join(' · ')}｜趁现在重新设局`
            : s.level.focus,
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
    if (!this.state || this.state.status !== 'playing' || this.state.paused)
      return;
    setPaused(this.state, true);
    this.controls?.clear();
    this.game?.resetClock();
    this.dialog(
      `<div class="panel-symbol">Ⅱ</div><h2 id="dialog-title">歇一口气</h2><p>试验场已暂停。电量、机关与追逐者都在等你。</p><p class="score-rule">${this.state.level.focus}</p>${button('resume', '继续游戏', 'primary')}${button('retry', '重新挑战')}${button('levels', '返回选关', 'text-button')}`,
    );
  }
  private resume(): void {
    if (!this.state?.paused) return;
    this.controls?.clear();
    this.game?.resetClock();
    setPaused(this.state, false);
    this.closeDialog();
  }
  private result(): void {
    const s = this.state;
    if (!s) return;
    this.controls?.clear();
    const won = s.status === 'won',
      complete = won && s.level.id === 20;
    this.inspectingLoss = false;
    this.root.querySelector('.play-screen')?.classList.remove('inspecting');
    const inspection = this.root.querySelector<HTMLElement>('.loss-inspection');
    if (inspection) inspection.hidden = true;
    if (won) {
      recordWin(this.save, s);
      this.persist();
    }
    this.dialog(
      `<div class="result-robot ${won ? '' : 'sad'}">${robotArt}</div><p class="result-kicker">${complete ? '试验场全部通过 · 阿零，出厂合格！' : won ? `第 ${s.level.id} 关完成` : '这次，路线被封住了'}</p><h2 id="dialog-title">${complete ? '墙都记住你了！' : won ? '撞墙了吧！' : '再骗它一次'}</h2>
      ${won ? `<div class="result-stars" aria-label="本关 ${stars(s)} 星">${starText(stars(s))}</div><div class="result-stats"><span><b>${seconds(s.elapsedMs)}s</b>通关用时</span><span><b>${s.dodges} / ${s.beacons}</b>闪避 / 信标</span></div><p class="score-rule">${s.elapsedMs <= s.level.parMs ? '✓' : '○'} ${s.level.parMs / 1000} 秒内通关 · ${s.dodges <= s.level.parDodges ? '✓' : '○'} 闪避 ≤${s.level.parDodges} 次</p>` : `<p class="loss-cause">${lossTitle(s)}</p><p>${s.lossReason ?? '碰到追逐者的头部了。'}</p><p class="score-rule">${lossAdvice(s)}</p>`}
      ${this.storageWarning ? '<p class="save-warning">浏览器未能保存，当前进度仍在，刷新后可能丢失。</p>' : ''}
      ${complete ? `<p>你追你的，墙就在那儿。<br>20 关全部解锁，回来把每颗星带走。</p>${button('levels', '自由重玩', 'primary')}` : won ? button('next', '下一关', 'primary') : button('retry', '再试一次', 'primary')}
      ${won ? button('retry', '重试本关') : button('inspect-loss', '查看失败现场')}${button('levels', '返回选关', 'text-button')}`,
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
      `<h2 id="dialog-title">你是阿零，借墙脱身</h2><div class="help-art">${heroArt}</div><ol class="instructions"><li><b>把墙留在它前方。</b>追逐者只冲几格。先引近墙，再对齐；橙色箭头出现后方向和长度锁定。</li><li><b>两格电，两种用途。</b>闪避走两格，无无敌；信标留在原地吸引追逐者 ${BEACON_MS / 1000} 秒。各耗一格电，每 ${RECHARGE_MS / 1000} 秒恢复一格。</li><li><b>踩踏板，切通路。</b>踏板和闸门用同一字母配对。再次走上踏板切换；攻击期间或门口有人时等待执行，不会夹人。</li></ol><div class="enemy-guide"><p><b class="normal-color">冲锋者 ›</b>直追目标，近墙对齐后侧移。</p><p><b class="swift-color">截击者 ϟ</b>预判你朝向前两格，变向甩开截击。</p><p><b class="cautious-color">侦察者 ◇</b>会识破撞墙路线；留下信标，骗它冒进。</p></div><p>手机：左手方向，右手闪避 / 信标。<br>电脑：WASD / 方向键、空格、E、Esc / P。</p><p class="score-rule">只碰头部会失败，履带不伤人。通关得一星，时间和闪避达标各加一星；超目标也能过关。</p>${button('close', '知道了', 'primary')}`,
    );
  }
  private settings(): void {
    this.dialog(
      `<h2 id="dialog-title">按你的节奏来</h2><div class="setting-row"><span>游戏音效<small>预警、闪避、撞墙与胜负提示</small></span>${button('mute', this.save.muted ? '已静音' : '已开启', 'toggle')}</div><div class="setting-row"><span>减少动态效果<small>关闭震动镜头和位移插值</small></span>${button('motion', this.save.reducedMotion ? '已开启' : '已关闭', 'toggle')}</div><p class="score-rule">进度自动保存在当前浏览器。切换设备或清除浏览器数据后不会同步。</p>${this.storageWarning ? '<p class="save-warning">保存暂不可用，设置会在本次游玩生效。</p>' : ''}${button('close', '完成', 'primary')}`,
    );
  }
  private act(action: string): void {
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
      case 'retry':
        if (this.state) this.start(this.state.level.id, false);
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
        this.settings();
        break;
      case 'motion':
        this.save.reducedMotion = !this.save.reducedMotion;
        this.persist();
        this.settings();
        break;
    }
  }
  destroy(): void {
    this.cleanupGame();
    this.abort.abort();
    this.sound.destroy();
  }
}
