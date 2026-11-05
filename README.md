# 撞墙了么

**你追你的，墙就在那儿。**

一颗红苹果，三种蛇，一张地图打到被抓。把蛇引到墙边，再横向闪开。奶油色卡通画风，全流程可玩；无蓄力、读条或提前锁定提示。

## 本地试玩

Node.js **24.x**，按锁文件安装：

```sh
npm ci
npm run dev
```

打开 [本地试玩](http://127.0.0.1:5173/)。首页与 Phaser 引擎分包，开始游戏时按需加载。

- **电脑**：方向键/WASD移动，两个垂直方向键可组合斜走。空格放诱饵，P/Escape暂停。
- **手机**：左手拖动全向摇杆，右手按按钮放诱饵。松手停止，支持双指同时操作。
- 开局直接入场，附近随机掉落护盾、冰冻和诱饵。护盾与冰冻踩上生效，诱饵拾取后可原地放下。蛇冲出后不转弯，撞墙/关门/实心残骸淘汰。
- **无尽挑战**：55×61格的回环石园全程不换图。清波后看上方倒计时，可以原地留守，也可以向小地图上的另一个进场区走。被抓后保存个人最佳成绩，可重试同一局或另开一局。
- 结束先留1200ms现场，再显示精简结算；详情按需展开。已有无尽纪录和设置会继承。

[玩法规则](docs/game-design.md) · [豆豆角色与手机操作验收](docs/records/2026-11-04-bean-thumb.md)

## 验证与证据

```sh
npm run check
npx playwright install chromium webkit
npm run test:e2e
npm run test:static
```

| 命令                       | 内容                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `npm run check`            | ESLint、Prettier、Vitest、严格类型检查、生产构建              |
| `npm test`                 | 无尽波次、碰撞与技能、存档迁移、历史关卡回放及策略核验        |
| `npm run test:e2e`         | 桌面/手机尺寸 Chromium、手机尺寸 WebKit、无尽流程、触控、换波 |
| `npm run test:static`      | 生产包 `/game/wallbait/` 子路径资源、开局、结算与恢复         |
| `npm run replays:generate` | 为历史关卡回归夹具重新搜索合法操作解                          |
| `npm run build`            | 构建到 `dist/`                                                |

普通关卡地图与回放仅作为测试夹具，用于检查现有碰撞、走位与技能规则。历史试玩及当前验收边界见[验收记录](docs/testing/README.md)和[后续事项](docs/remaining-work.md)。

## 项目结构

- `src/core/`：纯 TypeScript 整数网格、固定步、状态机、机关、碰撞与波次。
- `src/game/`：Phaser 绘制、插值、程序音效；动画不决定碰撞。
- `src/input/`：键盘与多点 Pointer Events，输出玩家命令。
- `src/ui/`：流程、HUD、道具提示与诱饵按钮与原创矢量主题。
- `src/storage/`：无尽纪录、设置、迁移与异常回退。
- `tests/`：关键规则、固定回放、反套路、浏览器与子路径验收。
- `docs/`：玩法、架构、逐关方案、开发记录和实际截图。

[文档导航](docs/README.md) · [玩法设计](docs/game-design.md) · [历史关卡设计](docs/levels.md) · [架构](docs/architecture.md) · [开发计划](docs/development.md) · [协作规范](CONTRIBUTING.md)

[在线试玩](https://hahaen.xyz/game/wallbait) · [线上发布流程](docs/deployment.md)
