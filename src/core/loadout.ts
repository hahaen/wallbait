import type { Level, Tactic, UtilitySkill } from './types';

export const SKILLS: Record<
  UtilitySkill,
  { name: string; symbol: string; description: string }
> = {
  dodge: {
    name: '闪避',
    symbol: '↟',
    description: '沿朝向走两格，没有无敌；适合快速脱离危险通道。',
  },
  pulse: {
    name: '脉冲',
    symbol: '◎',
    description: '暂停两格范围内、无遮挡的敌人0.6秒；恢复后原攻击继续。',
  },
  magnet: {
    name: '磁推',
    symbol: '⊞',
    description: '攻击间隙，把面前实心残骸向前推一格；落点需空闲。',
  },
};
export const TACTICS: Record<Tactic, string> = {
  'first-lure': '每名敌人首次冲刺就诱撞',
  beacon: '至少用信标诱撞一名敌人',
  wreck: '至少让一名敌人撞上残骸',
  chip: '拾取芯片并通关',
  split: '在至少两个不同位置诱撞',
  gate: '切换闸门后通关',
};
export const availableSkills = (level: Level): UtilitySkill[] =>
  level.utilitySkills ?? ['dodge'];
