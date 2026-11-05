import type { GameState, Point, Snake, SnakeKind } from '../core/types';
import {
  ahead,
  blocked,
  inInterference,
  magnetPreview,
  pulseTargets,
} from '../core/engine';

export function utilityFeedback(state: GameState): {
  ready: boolean;
  text: string;
} {
  if (!state.energy)
    return {
      ready: false,
      text: inInterference(state) ? '干扰停充' : '充电中',
    };
  if (state.cooldownMs) return { ready: false, text: '缓冲中' };
  if (
    state.utility === 'dodge' &&
    blocked(state, ahead(state.apple, state.facing))
  )
    return { ready: false, text: '前方被挡' };
  if (state.utility === 'pulse' && !pulseTargets(state).length)
    return { ready: false, text: '近敌无遮挡' };
  if (state.utility === 'magnet') {
    const { reason } = magnetPreview(state);
    if (reason)
      return {
        ready: false,
        text: {
          attacking: '待攻击结束',
          'no-wreck': '面前需残骸',
          occupied: '落点被占用',
          reserved: '避开机关等',
          'cuts-route': '会堵死通路',
        }[reason],
      };
  }
  return { ready: true, text: '1 格电' };
}

export const ENEMY_NAMES: Record<SnakeKind, string> = {
  normal: '冲锋蛇',
  swift: '截击蛇',
  cautious: '侦察蛇',
};
export const ENEMY_SYMBOLS: Record<SnakeKind, string> = {
  normal: '›',
  swift: 'ϟ',
  cautious: '◇',
};
const arrows = { up: '↑', right: '→', down: '↓', left: '←' };
export const enemyName = (snake: Snake): string =>
  `${snake.id + 1}号${ENEMY_NAMES[snake.kind]}`;

/** 重合位置共用一个标签，保留全部来源，避免后绘制者覆盖前者。 */
export function groupEnemies(
  enemies: Snake[],
  position: (enemy: Snake) => Point | undefined,
): { point: Point; enemies: Snake[] }[] {
  const groups = new Map<string, { point: Point; enemies: Snake[] }>();
  for (const enemy of enemies) {
    const point = position(enemy);
    if (!point) continue;
    const key = `${point.x},${point.y}`;
    const group = groups.get(key) ?? { point, enemies: [] };
    group.enemies.push(enemy);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** 冲刺优先，随后按发动时间排序；同刻按编号稳定排列。 */
export function dangerText(state: GameState): string {
  const threats = state.snakes
    .filter((s) => s.alive && s.phase === 'dashing')
    .sort(
      (a, b) =>
        Number(b.phase === 'dashing') - Number(a.phase === 'dashing') ||
        a.timer + a.stunMs - (b.timer + b.stunMs) ||
        a.id - b.id,
    );
  return threats
    .map(
      (s) =>
        `${enemyName(s)}${s.stunMs ? '暂停·' : ''}直冲${arrows[s.locked]}${s.elite && s.kind === 'normal' && s.followup ? '·第二段' : ''}`,
    )
    .concat(
      state.snakes
        .filter(
          (s) =>
            s.alive &&
            (s.phase === 'sidestepping' ||
              s.phase === 'interfering' ||
              (s.kind === 'normal' && s.followup && s.phase === 'recovering')),
        )
        .map(
          (s) =>
            `${enemyName(s)}${s.phase === 'sidestepping' ? '预告侧切' : s.phase === 'interfering' ? '预告干扰' : '准备第二段'}`,
        ),
    )
    .join(' · ');
}

export function lossAdvice(state: GameState): string {
  if (!state.loss) return state.level.focus;
  return {
    contact: '贴近蛇头前先留一条侧路，看到护盾可以顺路拾取。',
    tracking: '恢复结束后仍会追踪；绕墙拉开距离，别贴着敌头等待。',
    dash: '蛇直冲时不会转弯；留好侧路，横向闪开。',
  }[state.loss.kind];
}

export function lossTitle(state: GameState): string {
  const enemy = state.snakes.find((s) => s.id === state.loss?.enemy);
  if (!state.loss || !enemy) return '碰撞现场';
  return `${enemyName(enemy)} · ${{ contact: '迎面碰撞', tracking: '追踪接触', dash: '冲刺命中' }[state.loss.kind]}`;
}
