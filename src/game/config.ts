// 仅存放画面参数；游戏规则和难度参数放到 src/core/。
export const CELL = 32;
export const DROP_COLORS = {
  shield: 0xffd47d,
  freeze: 0xa6dff3,
  lure: 0xdbc2ee,
};
export const VIEWPORT = {
  width: 416,
  height: 480,
} as const;
