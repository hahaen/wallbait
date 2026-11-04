import { ahead, solid } from './engine';
import { DIRECTIONS, SNAKE_RULES, TICK_MS } from './config';
import type { Level, MemoryChip, Point, Spawn } from './types';

const h = (x: number, y: number, n: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({ x: x + i, y }));
const v = (x: number, y: number, n: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({ x, y: y + i }));
const bot = (
  x: number,
  y: number,
  kind: Spawn['kind'] = 'normal',
  delayMs = 0,
  rules?: Spawn['rules'],
): Spawn => ({ x, y, kind, delayMs, ...(rules ? { rules } : {}) });
const gate = (
  id: string,
  cells: Point[],
  switches: Point[],
  initialClosed = true,
) => ({ id, cells, switches, initialClosed });
const chapters = ['唤醒试验场', '改变追逐路线', '分配注意力', '最后的试验'];
const partition = (y: number) => [...h(1, y, 5), ...h(7, y, 5)];
const chips: Record<number, MemoryChip> = {
  7: {
    x: 2,
    y: 10,
    title: '第一次绕远',
    memory: '阿零的导航记录：最近的路线不一定能回家。今天试了另一条。',
  },
  11: {
    x: 3,
    y: 6,
    title: '留一条路',
    memory: '维修员便签：别把出口也当成耗材。给自己留条路。',
  },
  18: {
    x: 2,
    y: 7,
    title: '回收清单',
    memory: '回收记录：机壳三件，旧电池一枚。小机器人一个——划掉，它自己走了。',
  },
};
function stage(
  id: number,
  name: string,
  focus: string,
  intent: string,
  decision: string,
  failure: string,
  apple: Point,
  snakes: Spawn[],
  walls: Point[] = [],
  gates: NonNullable<Level['gates']> = [],
  parMs = 30000,
  parDodges = 4,
): Level {
  return {
    id,
    name,
    chapter: chapters[Math.floor((id - 1) / 5)]!,
    focus,
    intent,
    decision,
    failure,
    width: 13,
    height: 15,
    apple,
    facing: 'up',
    snakes,
    walls,
    gates,
    beaconEnabled: id >= 5,
    ...(chips[id] ? { chip: chips[id] } : {}),
    parMs,
    parDodges,
  };
}
export const LEVELS: Level[] = [
  stage(
    1,
    '借墙脱身',
    '等箭头锁定，再横移。冲锋者只冲四格，先把它带近墙。',
    '宽容的首次借墙；清晰展示有限冲刺终点。',
    '把追逐者引到下方墙附近后侧移。',
    '太早走开导致冲空，或沿箭头方向逃跑。',
    { x: 8, y: 12 },
    [bot(8, 9)],
    [{ x: 8, y: 13 }],
    [],
    18000,
    2,
  ),
  stage(
    2,
    '还差一步',
    '闪避走两格、没有无敌。远墙够不到，省电走位，再借恢复期重新设局。',
    '出生在中心，首个冲刺不会天然撞墙；练习重新设局。',
    '第一次侧移后，选择近墙的第二条诱导线。',
    '把冲空当作结束，停在恢复后重新追踪的路上。',
    { x: 8, y: 8 },
    [bot(4, 6)],
    [
      { x: 3, y: 10 },
      { x: 9, y: 4 },
    ],
    [],
    26000,
    3,
  ),
  stage(
    3,
    '它猜你往哪走',
    '闪电纹截击者瞄准你前方两格；橙色预警后绝不改向。',
    '单独认识预测截击与较短的三格冲刺。',
    '用朝向误导截击点，保留横向出口。',
    '一直朝同一方向跑，撞上预判路线。',
    { x: 8, y: 10 },
    [bot(5, 5, 'swift')],
    [...v(3, 6, 3), ...h(8, 4, 3)],
    [],
    28000,
    3,
  ),
  stage(
    4,
    '门由你开',
    '踩 A 踏板切换 A 门；预警期间排队切换，不会夹伤角色。',
    '第一次主动改变地形，门隔开敌人与玩家。',
    '先开门引入下室，再选门框或外墙设局。',
    '在门洞等敌人迎面冲来，或误把排队切换当成已关门。',
    { x: 8, y: 11 },
    [bot(4, 3)],
    partition(7),
    [
      gate(
        'A',
        [{ x: 6, y: 7 }],
        [
          { x: 8, y: 10 },
          { x: 4, y: 5 },
        ],
      ),
    ],
    35000,
    4,
  ),
  stage(
    5,
    '送它一个信号',
    '信标沿朝向投出最多两格，准星是落点。把信号投近墙，再横向撤离。',
    '教学第二技能与两格共享电量；侦察者只对信标冒进。',
    '先用朝向选好投掷落点，留一格电闪避。',
    '信标放在空地中央，或两次闪避耗光电量。',
    { x: 9, y: 10 },
    [bot(4, 5, 'cautious')],
    [...h(8, 12, 3), ...v(2, 4, 3)],
    [],
    35000,
    4,
  ),
  stage(
    6,
    '开门请进',
    '门是路线，也能成为墙。先决定要在哪一侧诱导。',
    '强制门交互后，用内部墙提供短冲刺终点。',
    '切换门、穿过视线，再选择门框旁的侧撤位置。',
    '站在门洞里等待蓄力，出口被墙挡住。',
    { x: 8, y: 11 },
    [bot(3, 3, 'normal'), bot(10, 3, 'swift', 700)],
    [...partition(7), { x: 3, y: 11 }, { x: 9, y: 4 }],
    [
      gate(
        'A',
        [{ x: 6, y: 7 }],
        [
          { x: 9, y: 10 },
          { x: 3, y: 5 },
        ],
      ),
    ],
    40000,
    5,
  ),
  stage(
    7,
    '转角留一格',
    '朝墙边投信标，你走另一侧；信标不能穿墙，别闪进敌人头部。',
    'L形墙让真人与信标形成不同路线。',
    '绕角后放信标，选择不会与敌人换位的离开路线。',
    '隔墙放信标吸引不到预警，或闪避被转角挡住。',
    { x: 9, y: 11 },
    [bot(3, 4, 'cautious')],
    [...v(6, 4, 5), ...h(7, 8, 3), ...h(2, 11, 3)],
    [],
    36000,
    4,
  ),
  stage(
    8,
    '残骸接力',
    '先借短墙留下残骸，再向残骸旁投信标。实心叉框能挡人，也能挡冲刺。',
    '教学残骸改变地形：先解决冲锋者，再借它的残骸诱撞侦察者。',
    '第一只的撞毁位置决定第二次陷阱；朝向控制信标落点。',
    '把信标投到残骸后方挡住视线，或把实心残骸当成可走格。',
    { x: 8, y: 7 },
    [bot(6, 9), bot(2, 6, 'cautious', 1800)],
    [{ x: 6, y: 5 }],
    [],
    36000,
    4,
  ),
  stage(
    9,
    '两格电的账',
    '信标和闪避各耗一格电；每三秒补一格，别把退路花光。',
    '双侦察者从不同侧接近，需要安放位置而非重复闪避。',
    '让一枚信标尽量制造好角度，另一个敌人重新布点处理。',
    '过早放信标在抵达前失效，随后无电脱险。',
    { x: 6, y: 11 },
    [bot(3, 3, 'cautious'), bot(10, 5, 'cautious', 500)],
    [...v(4, 7, 3), ...h(8, 8, 3)],
    [],
    42000,
    4,
  ),
  stage(
    10,
    '门后有回声',
    '过门前留电；侦察者需要信标，截击者会抢你的前路。',
    '章末综合门、目标转移与短冲刺。',
    '开门分流，再把侦察者引向信标、横移避开截击。',
    '两个技能连续乱按，将敌人引到唯一门口，堵住撤离路线。',
    { x: 9, y: 11 },
    [bot(3, 3, 'cautious'), bot(10, 4, 'swift', 800)],
    [...partition(7), ...v(4, 10, 2)],
    [
      gate(
        'A',
        [{ x: 6, y: 7 }],
        [
          { x: 9, y: 10 },
          { x: 3, y: 5 },
        ],
      ),
    ],
    45000,
    5,
  ),
  stage(
    11,
    '分头设局',
    '中央口借墙后会被残骸堵住；先选撞毁位置，右侧还留着绕行口。',
    'T形中央口与右侧绕道：残骸能提供诱撞点，也会封住中央出口。',
    '先取左侧芯片再封中央口，或先解决冲锋者，经右侧绕行回收；用残骸诱导侦察者。',
    '把中央残骸当成还能穿过的出口，或在没有侧撤空间时放信标。',
    { x: 9, y: 12 },
    [bot(6, 9, 'normal', 1200), bot(2, 2, 'cautious', 1800)],
    [...h(1, 7, 5), ...h(7, 7, 3), { x: 11, y: 7 }, { x: 6, y: 5 }],
    [],
    40000,
    4,
  ),
  stage(
    12,
    '两边都有门',
    'A、B 门分别受同字母踏板控制。先开一侧，再决定是否换路。',
    '两条可选择的入侵通路，门的状态决定追逐汇合点。',
    '只打开合适的门分离敌人，用另一边作为后续退路。',
    '同时开门让两条攻击在中场合流。',
    { x: 6, y: 12 },
    [bot(2, 3, 'cautious'), bot(10, 3, 'swift', 600)],
    [...h(1, 7, 3), ...h(5, 7, 3), ...h(9, 7, 3), ...v(6, 3, 3)],
    [
      gate(
        'A',
        [{ x: 4, y: 7 }],
        [
          { x: 3, y: 10 },
          { x: 3, y: 5 },
        ],
      ),
      gate(
        'B',
        [{ x: 8, y: 7 }],
        [
          { x: 9, y: 10 },
          { x: 9, y: 5 },
        ],
      ),
    ],
    45000,
    5,
  ),
  stage(
    13,
    '别共用一条退路',
    '三个预警错峰发动。投信标分流，再选不被下一只截住的横向出口。',
    '首次三敌，类型与出生错位，要求管理多个时序。',
    '先解决截击者或冲锋者，给信标布点腾出空间。',
    '只看信标旁的敌人，忽略已经锁定真人的攻击。',
    { x: 6, y: 12 },
    [bot(2, 3), bot(10, 4, 'swift', 240), bot(6, 2, 'cautious', 900)],
    [...v(4, 7, 3), ...h(8, 9, 3)],
    [],
    45000,
    5,
  ),
  stage(
    14,
    '环岛不是答案',
    '短墙打断环岛退路。先选绕墙出口，再朝岛的另一侧投信标。',
    '错位短墙打断固定绕圈，用岛的不同侧面建立信标诱导线。',
    '选择停下放信标的窗口，离开环线制造对齐。',
    '只绕圈不改变目标，或在狭窄侧边闪避迎撞。',
    { x: 9, y: 11 },
    [bot(2, 3, 'cautious'), bot(10, 3, 'swift', 600)],
    [
      ...h(5, 6, 3),
      ...h(5, 7, 3),
      ...h(5, 8, 3),
      { x: 9, y: 4 },
      { x: 3, y: 10 },
    ],
    [],
    42000,
    4,
  ),
  stage(
    15,
    '十字交班',
    '两截击者的蓄力时长不同。看编号和倒计时，躲第一条线时就选好下一格。',
    '两截击者与一侦察者，要求持续检查朝向与安全出口。',
    '避免让两个预测点都落在同一路口，预留信标电量。',
    '在路口连续闪避，第三条敌人到来时失去应对资源。',
    { x: 6, y: 11 },
    [
      bot(2, 2, 'swift'),
      bot(10, 4, 'swift', 320, { chargeMs: 920 }),
      bot(6, 2, 'cautious', 1100),
    ],
    [...h(3, 5, 2), ...h(8, 5, 2), ...h(3, 9, 2), ...h(8, 9, 2)],
    [],
    48000,
    5,
  ),
  stage(
    16,
    '先开哪扇',
    '两层门之间可以设局，也可能堵住自己。先计划出口再踩踏板。',
    '连续两次改变通路，三敌分布在上下不同区。',
    '先处理下室追逐者，再开门，继续选择第二层门时机。',
    '把上下通路全打开，让三类敌人一起到达。',
    { x: 9, y: 12 },
    [bot(3, 10), bot(10, 6, 'swift', 500), bot(3, 2, 'cautious', 800)],
    [...partition(5), ...partition(9)],
    [
      gate(
        'A',
        [{ x: 6, y: 9 }],
        [
          { x: 9, y: 11 },
          { x: 8, y: 7 },
        ],
      ),
      gate(
        'B',
        [{ x: 6, y: 5 }],
        [
          { x: 4, y: 7 },
          { x: 4, y: 3 },
        ],
      ),
    ],
    55000,
    6,
  ),
  stage(
    17,
    '同频不同路',
    '同一信标吸引全部未锁向敌人；不同启动时间与残骸会改变下一只的路线。',
    '双侦察者加普通追逐者，强调信标落点与共享电量。',
    '利用双岛拆分同目标的路径，在不同恢复窗口重新布局。',
    '认为一次信标能解决所有敌人，留在失效后的夹击位置。',
    { x: 6, y: 12 },
    [
      bot(2, 3, 'cautious'),
      bot(10, 2, 'cautious', 840),
      bot(6, 3, 'normal', 360),
    ],
    [...v(4, 6, 4), ...v(8, 7, 4)],
    [],
    50000,
    5,
  ),
  stage(
    18,
    '回收试验',
    '中央残骸能接住下一只，也会封路。三敌错峰，取芯片前留好右侧退路。',
    '三敌回收场：中央T口适合造墙接力，右侧长路保留第二种解决顺序。',
    '先在中央口留下残骸诱导侦察者，或绕右侧先解决截击者，再回左侧取芯片。',
    '第一只撞毁后仍沿中央口撤退，或只看芯片忽略右侧截击。',
    { x: 9, y: 12 },
    [
      bot(6, 10, 'normal', 1200),
      bot(2, 4, 'cautious', 1800),
      bot(10, 3, 'swift', 920),
    ],
    [
      ...h(1, 8, 5),
      ...h(7, 8, 3),
      { x: 11, y: 8 },
      { x: 6, y: 6 },
      ...v(4, 10, 2),
    ],
    [],
    50000,
    5,
  ),
  stage(
    19,
    '把退路留下',
    '开门不一定更安全；切换排队时，先按当前门状态走。',
    '双门与双侦察者、截击者，综合目标与路线分配。',
    '在两种门状态下寻找不同诱撞点，留一次信标与脱险机会。',
    '把待执行门当成当前墙，或将信标放到没有撞击终点的方向。',
    { x: 9, y: 12 },
    [
      bot(2, 2, 'swift'),
      bot(10, 3, 'cautious', 700),
      bot(3, 9, 'cautious', 1000),
    ],
    [...h(1, 6, 3), ...h(5, 6, 3), ...h(9, 6, 3), ...v(6, 9, 3)],
    [
      gate(
        'A',
        [{ x: 4, y: 6 }],
        [
          { x: 3, y: 11 },
          { x: 3, y: 4 },
        ],
      ),
      gate(
        'B',
        [{ x: 8, y: 6 }],
        [
          { x: 9, y: 10 },
          { x: 9, y: 4 },
        ],
        false,
      ),
    ],
    55000,
    6,
  ),
  stage(
    20,
    '墙就在那儿',
    '终局试验：开门、分流、借墙。三种追逐者，三次清楚的选择。',
    '终局三室串联，逐步释放三种策略威胁；无需增血或强制等待。',
    '处理下室截击者，开A门安排冲锋者，再开B门诱骗侦察者。',
    '急开双门合流；最后没有信标电量或安全撤离格。',
    { x: 8, y: 12 },
    [bot(3, 11, 'swift'), bot(10, 7), bot(3, 2, 'cautious')],
    [...partition(5), ...partition(9), { x: 3, y: 7 }, { x: 9, y: 3 }],
    [
      gate(
        'A',
        [{ x: 6, y: 9 }],
        [
          { x: 9, y: 11 },
          { x: 8, y: 7 },
        ],
      ),
      gate(
        'B',
        [{ x: 6, y: 5 }],
        [
          { x: 4, y: 7 },
          { x: 4, y: 3 },
        ],
      ),
    ],
    60000,
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
  const gates = l.gates ?? [];
  if (new Set(gates.map((g) => g.id)).size !== gates.length)
    errors.push('门编号重复');
  const gateCells = gates.flatMap((g) => g.cells);
  if (new Set(gateCells.map((p) => `${p.x},${p.y}`)).size !== gateCells.length)
    errors.push('门格重复');
  for (const g of gates) {
    if (
      !g.id ||
      !g.cells.length ||
      !g.switches.length ||
      typeof g.initialClosed !== 'boolean'
    )
      errors.push('门配置无效');
    for (const p of [...g.cells, ...g.switches])
      if (!integer(p.x) || !integer(p.y) || solid(l, p))
        errors.push('门或踏板不可通行');
    if (
      g.switches.some((p) => gateCells.some((c) => c.x === p.x && c.y === p.y))
    )
      errors.push('踏板与门格重叠');
  }
  if (l.snakes.some((s) => s.kind === 'cautious') && !l.beaconEnabled)
    errors.push('侦察者关卡必须启用信标');
  const spawns = [l.apple, ...l.snakes];
  if (new Set(spawns.map((p) => `${p.x},${p.y}`)).size !== spawns.length)
    errors.push('出生重叠');
  for (const p of spawns)
    if (!integer(p.x) || !integer(p.y) || solid(l, p))
      errors.push('出生不可通行');
  if (
    spawns.some((p) =>
      gates.some(
        (g) =>
          g.initialClosed && g.cells.some((c) => c.x === p.x && c.y === p.y),
      ),
    )
  )
    errors.push('出生被关闭门占用');
  if (l.chip) {
    const p = l.chip;
    if (
      !integer(p.x) ||
      !integer(p.y) ||
      solid(l, p) ||
      !p.title ||
      !p.memory ||
      [...spawns, ...gateCells, ...gates.flatMap((g) => g.switches)].some(
        (c) => c.x === p.x && c.y === p.y,
      )
    )
      errors.push('芯片配置无效');
  }
  for (const s of l.snakes) {
    if (
      Math.abs(l.apple.x - s.x) + Math.abs(l.apple.y - s.y) <
      (l.id === 1 ? 3 : 4)
    )
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
  // 仅枚举地图机关状态（至多两门），证明能走到踏板打开各出生区域。
  if (gates.length > 2) errors.push('最多两组门');
  else if (!errors.length) {
    const initial = gates.reduce(
      (mask, g, i) => mask | (Number(g.initialClosed) << i),
      0,
    );
    const states = [{ mask: initial, point: l.apple }];
    const seen = new Set<string>();
    const accessible = new Set<string>();
    for (let i = 0; i < states.length; i++) {
      const { mask, point } = states[i]!;
      const cells = new Set([`${point.x},${point.y}`]),
        queue = [point];
      for (let n = 0; n < queue.length; n++)
        for (const d of DIRECTIONS) {
          const p = ahead(queue[n]!, d),
            k = `${p.x},${p.y}`;
          if (
            !solid(l, p) &&
            !cells.has(k) &&
            !gates.some(
              (g, index) =>
                mask & (1 << index) &&
                g.cells.some((c) => c.x === p.x && c.y === p.y),
            )
          ) {
            cells.add(k);
            queue.push(p);
          }
        }
      const signature = `${mask}:${[...cells].sort().join(';')}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      cells.forEach((k) => accessible.add(k));
      gates.forEach((g, index) =>
        g.switches.forEach((p) => {
          if (cells.has(`${p.x},${p.y}`))
            states.push({ mask: mask ^ (1 << index), point: p });
        }),
      );
    }
    if (
      [...spawns, ...(l.chip ? [l.chip] : [])].some(
        (p) => !accessible.has(`${p.x},${p.y}`),
      )
    )
      errors.push('关闭门区域无法通过踏板到达');
  }
  if (visited.size !== (l.width - 2) * (l.height - 2) - l.walls.length)
    errors.push('地图存在孤立区域');
  return errors;
}
