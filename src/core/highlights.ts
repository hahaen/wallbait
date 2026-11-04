import type { GameState, HighlightId } from './types';

export const HIGHLIGHTS: Record<
  HighlightId,
  { title: string; description: string }
> = {
  'wreck-chain': {
    title: '借尸筑墙',
    description: '让一名敌人撞上已生效的残骸。',
  },
  'double-decoy': {
    title: '一标双骗',
    description: '两名敌人锁定同一枚信标后，分别冲刺撞毁。',
  },
  'no-dodge': { title: '脚下留电', description: '未使用闪避完成一关。' },
  'close-call': {
    title: '擦肩而过',
    description: '蛇冲到两格内时横向脱身，并安全避过这次冲刺。',
  },
};

/** 每局同种操作只记录一次；时间属于规则，暂停后反馈同样冻结。 */
export function awardHighlight(state: GameState, id: HighlightId): void {
  if (state.highlights.some((h) => h.id === id)) return;
  state.highlights.push({ id, atMs: state.elapsedMs });
  state.events.push({ type: 'highlight', id, ...state.apple });
}
