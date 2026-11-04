import { ahead, solid } from './engine';
import { DIRECTIONS, SNAKE_RULES, TICK_MS } from './config';
import type { Level, Point, Spawn } from './types';

const h = (x: number, y: number, n: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({ x: x + i, y }));
const v = (x: number, y: number, n: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({ x, y: y + i }));
const snake = (
  x: number,
  y: number,
  kind: Spawn['kind'] = 'normal',
  delayMs = 0,
): Spawn => ({ x, y, kind, delayMs });
const chapters = ['学会借力', '墙有妙用', '一心两用', '最后的苹果'];
function level(
  id: number,
  name: string,
  focus: string,
  intent: string,
  apple: Point,
  snakes: Spawn[],
  walls: Point[] = [],
  parMs = 18000,
  parDodges = 3,
): Level {
  return {
    id,
    name,
    focus,
    intent,
    chapter: chapters[Math.floor((id - 1) / 5)]!,
    width: 13,
    height: 15,
    apple,
    facing: 'up',
    snakes,
    walls,
    parMs,
    parDodges,
  };
}
export const LEVELS: Level[] = [
  level(
    1,
    '苹果先走',
    '按住方向移动，松手就停。让蛇看到你，再横向离开。',
    '空旷场地，错行出生；先用移动制造第一次同行预警。',
    { x: 9, y: 10 },
    [snake(3, 5)],
  ),
  level(
    2,
    '看准箭头',
    '橙色通道就是冲刺方向，预警后不会转弯。',
    '开局同行、距离充足，直接学习锁向与侧移。',
    { x: 9, y: 7 },
    [snake(3, 7)],
  ),
  level(
    3,
    '闪开一下',
    '方向与闪避可以同时按；闪避两格，没有无敌。',
    '纵向对峙，侧边小墙限制出口，练习快速横向闪避。',
    { x: 6, y: 10 },
    [snake(6, 4)],
    [...v(3, 8, 4), ...v(9, 8, 4)],
  ),
  level(
    4,
    '借墙一用',
    '把蛇引到墙边，等橙色箭头亮起再离开。',
    '中央宽阔、出生离外墙远；必须拉近冲刺起点到墙的距离。',
    { x: 7, y: 11 },
    [snake(6, 7)],
    [],
    22000,
  ),
  level(
    5,
    '它也会累',
    '冲空的蛇会停下恢复，趁这时重新站位。',
    '缩短冲刺至五格，第一次冲空后利用恢复期二次诱导。',
    { x: 6, y: 10 },
    [{ ...snake(6, 5), rules: { dashCells: 5, recoverMs: 1200 } }],
    [],
    26000,
  ),
  level(
    6,
    '第一堵墙',
    '中间的实心墙，也能淘汰蛇。',
    '中央短墙提供内侧撞击点，左右两侧均可绕行。',
    { x: 9, y: 9 },
    [snake(3, 9)],
    v(6, 4, 4),
  ),
  level(
    7,
    '转角见',
    '绕过转角，把追踪路线变成直线。',
    'L 形墙隔断视线，必须绕角重新对齐。',
    { x: 9, y: 4 },
    [snake(3, 10)],
    [...v(6, 4, 5), ...h(7, 8, 3)],
    24000,
  ),
  level(
    8,
    '两道门',
    '经过窄口之前，先确认蛇有没有蓄力。',
    '横墙留两个门洞，选择门洞决定引蛇路线。',
    { x: 8, y: 11 },
    [snake(4, 3)],
    [...h(1, 7, 3), ...h(5, 7, 3), ...h(9, 7, 3)],
    26000,
  ),
  level(
    9,
    '快蛇慢看',
    '带闪电纹的迅捷蛇冲得快，但仍会提前预警。',
    '两根错位柱与迅捷蛇；读预警而非追着蛇头反应。',
    { x: 9, y: 11 },
    [snake(3, 3, 'swift')],
    [...v(5, 3, 4), ...v(8, 8, 4)],
    26000,
  ),
  level(
    10,
    '请君入瓮',
    '带双眉的谨慎蛇，需要靠近并保持短暂对齐。',
    'U 形口袋配谨慎蛇，主动入袋引诱后从开口撤离。',
    { x: 6, y: 10 },
    [snake(3, 3, 'cautious')],
    [...v(4, 5, 4), ...v(8, 5, 4), ...h(4, 9, 5)],
    30000,
  ),
  level(
    11,
    '左右来客',
    '先处理一条；蛇身和另一条蛇都不会替你挡住蛇头。',
    '双普通蛇从左右错行接近，避免同一预警误判。',
    { x: 6, y: 10 },
    [snake(2, 4), snake(10, 6, 'normal', 700)],
    [],
    28000,
    4,
  ),
  level(
    12,
    '错峰出发',
    '一条蓄力时，留意另一条的追踪路线。',
    '双柱分开两条蛇的寻路节奏，逐个制造撞击。',
    { x: 6, y: 11 },
    [snake(2, 3), snake(10, 3, 'normal', 1200)],
    [...v(4, 5, 5), ...v(8, 5, 5)],
    32000,
    4,
  ),
  level(
    13,
    '一快一慢',
    '认准闪电纹，给快蛇先留出逃生通道。',
    '普通加迅捷组合，中央岛允许环绕、拉开冲刺时间。',
    { x: 9, y: 11 },
    [snake(2, 3), snake(10, 3, 'swift', 500)],
    [...h(5, 6, 3), ...h(5, 7, 3)],
    32000,
    4,
  ),
  level(
    14,
    '耐心对手',
    '谨慎蛇不会远远上钩；主动靠近，再借墙脱身。',
    '普通与谨慎蛇在两侧交错短墙间形成远近诱导差异。',
    { x: 6, y: 11 },
    [snake(2, 3), snake(10, 3, 'cautious', 800)],
    [...h(2, 6, 3), ...h(8, 9, 3)],
    34000,
    4,
  ),
  level(
    15,
    '十字路口',
    '穿越路口前，先看两条危险通道。',
    '四块分离的角墙围出十字道路，在路口处理交叉预警。',
    { x: 6, y: 11 },
    [snake(2, 2, 'swift'), snake(10, 3, 'cautious', 600)],
    [...h(3, 5, 2), ...h(8, 5, 2), ...h(3, 9, 2), ...h(8, 9, 2)],
    36000,
    5,
  ),
  level(
    16,
    '曲折有路',
    '别在通道里和蛇迎面相撞；先在宽处设局。',
    '交错横墙组成 S 路径，双蛇追踪绕行与出口诱导。',
    { x: 9, y: 12 },
    [snake(2, 2, 'normal'), snake(10, 2, 'swift', 1000)],
    [...h(1, 5, 7), ...h(5, 9, 7)],
    42000,
    5,
  ),
  level(
    17,
    '三面来风',
    '三条蛇同时在场，优先消掉已经锁向的那条。',
    '首次三蛇，以无障碍广场提供回旋空间和清楚读条。',
    { x: 6, y: 11 },
    [snake(2, 3), snake(10, 3, 'swift', 600), snake(6, 2, 'normal', 1400)],
    [],
    36000,
    5,
  ),
  level(
    18,
    '绕岛计划',
    '短墙可作掩护，也会挡住自己的闪避。',
    '三蛇围绕双岛，利用内墙截短冲刺，同时注意避让空间。',
    { x: 6, y: 12 },
    [snake(2, 2), snake(10, 2, 'cautious', 800), snake(6, 3, 'swift', 1600)],
    [...v(4, 6, 4), ...v(8, 6, 4)],
    40000,
    5,
  ),
  level(
    19,
    '窄路宽心',
    '保留闪避，离开危险通道后先找下一个出口。',
    '迅捷与谨慎双蛇配双门和竖柱，要求连续规划两次逃生。',
    { x: 9, y: 12 },
    [snake(2, 2, 'swift'), snake(10, 2, 'cautious', 600)],
    [...h(1, 5, 4), ...h(7, 5, 5), ...v(5, 9, 3)],
    42000,
    5,
  ),
  level(
    20,
    '墙就在那儿',
    '读预警、留退路、逐个击破。最后一次，交给你。',
    '三种蛇、错位短墙与中央通路的综合考试，内外墙都可借用。',
    { x: 6, y: 12 },
    [snake(2, 2), snake(10, 2, 'swift', 800), snake(6, 3, 'cautious', 1600)],
    [...h(2, 6, 3), ...h(8, 6, 3), ...v(4, 9, 2), ...v(8, 9, 2)],
    45000,
    6,
  ),
];

export function validateLevel(l: Level): string[] {
  const errors: string[] = [];
  const integer = (n: number): boolean => Number.isInteger(n);
  if (
    !integer(l.id) ||
    l.id < 1 ||
    !integer(l.width) ||
    !integer(l.height) ||
    l.width < 5 ||
    l.height < 5
  )
    errors.push('编号或地图尺寸无效');
  if (!l.name || !l.focus || !l.intent || l.parMs <= 0 || l.parDodges < 0)
    errors.push('缺少说明或星级参数无效');
  if (l.snakes.length < 1 || l.snakes.length > 3) errors.push('蛇数量无效');
  const wallKeys = l.walls.map((p) => `${p.x},${p.y}`);
  if (new Set(wallKeys).size !== wallKeys.length) errors.push('障碍重复');
  for (const p of l.walls)
    if (
      !integer(p.x) ||
      !integer(p.y) ||
      p.x < 1 ||
      p.y < 1 ||
      p.x >= l.width - 1 ||
      p.y >= l.height - 1
    )
      errors.push('障碍越界');
  const spawns = [l.apple, ...l.snakes];
  if (new Set(spawns.map((p) => `${p.x},${p.y}`)).size !== spawns.length)
    errors.push('出生重叠');
  for (const p of spawns)
    if (!integer(p.x) || !integer(p.y) || solid(l, p))
      errors.push('出生不可通行');
  for (const s of l.snakes) {
    if (Math.abs(l.apple.x - s.x) + Math.abs(l.apple.y - s.y) < 4)
      errors.push('出生反应距离不足');
    const rules = { ...SNAKE_RULES[s.kind], ...s.rules };
    for (const [k, value] of Object.entries(rules))
      if (!Number.isFinite(value) || value < (k === 'aimMs' ? 0 : 1))
        errors.push('蛇参数无效');
    if (rules.chargeMs < 700 || rules.trackMs < TICK_MS)
      errors.push('预警或追踪过快');
  }
  const visited = new Set([`${l.apple.x},${l.apple.y}`]),
    queue = [l.apple];
  for (let i = 0; i < queue.length; i++)
    for (const d of DIRECTIONS) {
      const p = ahead(queue[i]!, d),
        k = `${p.x},${p.y}`;
      if (!solid(l, p) && !visited.has(k)) {
        visited.add(k);
        queue.push(p);
      }
    }
  if (visited.size !== (l.width - 2) * (l.height - 2) - l.walls.length)
    errors.push('地图存在孤立区域');
  return errors;
}
