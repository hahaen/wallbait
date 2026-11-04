import { createState, setPaused, stars } from '../core/engine';
import { LEVELS } from '../core/levels';
import type { GameState } from '../core/types';
import type { createGame } from '../game/createGame';
import { Sound } from '../game/audio';
import { Controls } from '../input/controls';
import {
  browserStorage,
  readSave,
  recordWin,
  writeSave,
} from '../storage/save';
import { appleArt, heroArt } from './art';

const arrows = { up: '↑', right: '→', down: '↓', left: '←' };
const kinds = { normal: '普通蛇', swift: '迅捷蛇', cautious: '谨慎蛇' };
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
      <div class="home-top"><span class="edition">反向贪吃蛇 / 20 关</span>${button('settings', '设置', 'quiet')}</div>
      <h1 tabindex="-1">撞墙了么<span class="title-spark" aria-hidden="true">!</span></h1>
      <p class="tagline">你追你的，墙就在那儿。</p>
      <div class="hero-art">${heroArt}</div>
      <p class="home-pitch">这次，苹果说了算。</p>
      <p class="home-instruction">引它追 · 等它冲 · 闪开，让墙来收场</p>
      <div class="home-actions">${button(completed ? 'continue' : 'start', completed ? `继续挑战 · 第 ${this.save.unlocked} 关` : '开始游戏', 'primary')}
      <div class="action-row">${button('levels', '选择关卡')}${button('help', '怎么玩')}</div>
      ${completed ? button('start', '从第一关开始', 'text-button') : ''}</div>
      <footer class="home-footer"><span>${completed === 20 ? '20 关已通关，自由重玩' : `已通关 ${completed} / 20`}</span><span class="stars">${totalStars} / 60 ★</span></footer>
    </section>`,
    );
  }
  private levels(): void {
    this.setScreen(
      'levels',
      `<section class="level-screen screen"><header class="page-header">${button('home', '‹ 首页', 'quiet')}<h1 tabindex="-1">选一堵墙</h1><span>${Object.values(this.save.best).reduce((n, b) => n + b.stars, 0)} ★</span></header>
      <p class="page-intro">逐关解锁，随时回来刷新星级。</p>
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
  private start(id: number): void {
    if (id < 1 || id > this.save.unlocked) return;
    const level = LEVELS[id - 1]!;
    this.setScreen(
      'play',
      `<section class="play-screen screen"><header class="play-header"><div><small>第 ${String(id).padStart(2, '0')} / 20 关</small><h1 tabindex="-1">${level.name}</h1></div>${button('pause', 'Ⅱ', 'pause-button')} </header>
      <div class="hud"><span id="enemy-count"></span><span id="clock">0.0s</span><span id="cooldown" class="ready">闪避就绪</span></div>
      <div class="arena-slot"><div id="arena" role="img" aria-label="对局地图：红苹果、绿蛇、灰色墙与橙色冲刺通道"><span class="loading">正在摆好墙…</span></div></div>
      <div class="play-status" id="play-status" aria-live="polite">${level.focus}</div>
      <div class="controls"><div class="dpad" aria-label="四向移动"><button data-direction="up" aria-label="向上移动">▲</button><button data-direction="left" aria-label="向左移动">◀</button><span aria-hidden="true">移动</span><button data-direction="right" aria-label="向右移动">▶</button><button data-direction="down" aria-label="向下移动">▼</button></div><div class="dodge-wrap"><button class="dodge" data-dodge aria-label="闪避"><span aria-hidden="true">⌃</span><b>闪避</b><small id="dodge-text">就绪</small></button></div></div>
      <footer class="play-footer"><span>方向键 / WASD 移动 · 空格闪避</span><span>目标 ${level.parMs / 1000}s / ≤${level.parDodges} 次闪避</span></footer></section>`,
    );
    this.root
      .querySelector('[data-action="pause"]')
      ?.setAttribute('aria-label', '暂停游戏');
    const state = createState(level);
    this.state = state;
    this.controls = new Controls(
      this.root,
      () => state.status === 'playing' && !state.paused,
      () => (state.paused ? this.resume() : this.pause()),
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
            arena.querySelector('.loading')?.remove();
            events.forEach((e) => this.sound.play(e.type));
            this.hud();
            if (events.some((e) => e.type === 'won' || e.type === 'lost'))
              this.result();
          },
        });
      })
      .catch(() => {
        if (this.state !== state) return;
        this.dialog(
          `<h2 id="dialog-title">游戏资源还没到齐</h2><p>请检查网络后重新加载本关。</p>${button('retry', '重新加载', 'primary')}${button('levels', '返回选关', 'text-button')}`,
        );
      });
    this.hud();
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
      `剩余 ${s.snakes.filter((v) => v.alive).length} / ${s.snakes.length} 条`,
    );
    text('clock', `${seconds(s.elapsedMs)}s`);
    text(
      'cooldown',
      s.cooldownMs ? `闪避 ${seconds(s.cooldownMs)}s` : '闪避就绪',
    );
    text('dodge-text', s.cooldownMs ? `${seconds(s.cooldownMs)}s` : '就绪');
    this.root
      .querySelector('#cooldown')
      ?.classList.toggle('ready', s.cooldownMs === 0);
    const dodge = this.root.querySelector<HTMLElement>('.dodge');
    dodge?.classList.toggle('cooling', s.cooldownMs > 0);
    dodge?.setAttribute(
      'aria-label',
      s.cooldownMs ? `闪避冷却 ${seconds(s.cooldownMs)} 秒` : '闪避',
    );
    const charging = s.snakes.filter((v) => v.alive && v.phase === 'charging');
    const dashing = s.snakes.some((v) => v.alive && v.phase === 'dashing');
    text(
      'play-status',
      charging.length
        ? charging
            .map((v) => `${kinds[v.kind]}蓄力 ${arrows[v.locked]}`)
            .join(' · ')
        : dashing
          ? '冲刺中！离开橙色通道'
          : s.level.focus,
    );
    this.root
      .querySelector('#play-status')
      ?.classList.toggle('danger', charging.length > 0 || dashing);
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
      `<div class="panel-symbol">Ⅱ</div><h2 id="dialog-title">歇一口气</h2><p>蛇也在等你。准备好了再继续。</p>${button('resume', '继续游戏', 'primary')}${button('retry', '重新挑战')}${button('levels', '返回选关', 'text-button')}`,
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
    if (won) {
      recordWin(this.save, s);
      this.persist();
    }
    this.dialog(
      `<div class="result-apple ${won ? '' : 'sad'}">${appleArt}</div><p class="result-kicker">${complete ? '四章 · 二十关 · 一颗不服输的苹果' : won ? `第 ${s.level.id} 关完成` : '这一口，没躲过'}</p><h2 id="dialog-title">${complete ? '墙都记住你了！' : won ? '撞墙了吧！' : '再骗它一次'}</h2>
      ${won ? `<div class="result-stars" aria-label="本关 ${stars(s)} 星">${starText(stars(s))}</div><div class="result-stats"><span><b>${seconds(s.elapsedMs)}s</b>通关用时</span><span><b>${s.dodges} 次</b>使用闪避</span></div><p class="score-rule">${s.elapsedMs <= s.level.parMs ? '✓' : '○'} ${s.level.parMs / 1000} 秒内通关 · ${s.dodges <= s.level.parDodges ? '✓' : '○'} 闪避 ≤${s.level.parDodges} 次</p>` : `<p>${s.level.focus}</p><p class="score-rule">蛇头会伤你，蛇身不会。预警后横向闪开。</p>`}
      ${this.storageWarning ? '<p class="save-warning">浏览器未能保存，当前进度仍在，刷新后可能丢失。</p>' : ''}
      ${complete ? `<p>你追你的，墙就在那儿。<br>20 关全部解锁，回来把每颗星带走。</p>${button('levels', '自由重玩', 'primary')}` : won ? button('next', '下一关', 'primary') : button('retry', '再试一次', 'primary')}
      ${won ? button('retry', '重试本关') : ''}${button('levels', '返回选关', 'text-button')}`,
      won ? 'win' : 'lose',
    );
  }
  private help(): void {
    this.dialog(
      `<h2 id="dialog-title">你是苹果，别被吃掉</h2><div class="help-art">${heroArt}</div><ol class="instructions"><li><b>引它追。</b>按住方向移动，松手停下。墙和障碍都不能穿过。</li><li><b>等它冲。</b>同行或同列时蛇会蓄力，橙色箭头就是它不会改变的冲刺方向。</li><li><b>闪开。</b>横向移动或闪避两格，让蛇撞墙。闪避没有无敌，冷却 2.2 秒。</li></ol><p>普通蛇是浅绿圆眼；迅捷蛇有闪电纹；谨慎蛇有双眉，需靠近并短暂对齐。</p><p>手机：左手移动，右手闪避。<br>电脑：WASD / 方向键、空格、Esc / P。</p><p class="score-rule">通关得一星；达到每关的时间和闪避目标各加一星。超目标也能过关。</p>${button('close', '知道了', 'primary')}`,
    );
  }
  private settings(): void {
    this.dialog(
      `<h2 id="dialog-title">按你的节奏来</h2><div class="setting-row"><span>游戏音效<small>冲刺、闪避、撞墙与胜负提示</small></span>${button('mute', this.save.muted ? '已静音' : '已开启', 'toggle')}</div><div class="setting-row"><span>减少动态效果<small>关闭震动镜头和位移插值</small></span>${button('motion', this.save.reducedMotion ? '已开启' : '已关闭', 'toggle')}</div><p class="score-rule">进度自动保存在当前浏览器。切换设备或清除浏览器数据后不会同步。</p>${this.storageWarning ? '<p class="save-warning">保存暂不可用，设置会在本次游玩生效。</p>' : ''}${button('close', '完成', 'primary')}`,
    );
  }
  private act(action: string): void {
    if (action.startsWith('level:')) {
      this.start(Number(action.split(':')[1]));
      return;
    }
    switch (action) {
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
      case 'resume':
        this.resume();
        break;
      case 'retry':
        if (this.state) this.start(this.state.level.id);
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
