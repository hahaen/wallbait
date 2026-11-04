# 撞墙了么

**你追你的，墙就在那儿。**

一款反向贪吃蛇 H5 游戏：你操控苹果，诱导追逐的蛇蓄力冲刺，侧身闪开，让墙来收场。

已实现可玩的四章 **20 关**、普通/迅捷/谨慎三类蛇、地形障碍及双蛇/三蛇挑战。具备首页、选关、对局、暂停、星级结算、全通关、自由重玩、进度与设置保存。纯前端，无后端或登录。

## 本地试玩

Node.js **24.x**，按锁文件安装：

```sh
npm ci
npm run dev
```

打开 [本地试玩](http://127.0.0.1:5173/)。首次进入关卡才加载 Phaser 引擎。

- 电脑：WASD / 方向键移动，空格闪避，Escape / P 暂停。
- 手机：左下四向按钮，右下闪避，右上暂停；方向与闪避可同时按。
- 松手停止，闪避两格、冷却 2.2 秒，没有无敌时间。橙色箭头在蓄力开始就锁定，不会偷偷转向。
- 通过一关得一星，时间达标和闪避次数达标各得一星，可重玩提升。
- 切后台自动暂停，返回手动继续。存档异常不妨碍游玩。

手机局域网调试可运行 `npm run dev -- --host 0.0.0.0`，用手机访问电脑局域网地址。当前没有线上试玩地址。

## 验证

```sh
npm run check
npx playwright install chromium webkit
npm run test:e2e
npm run test:static
```

| 命令                       | 内容                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `npm run check`            | ESLint、Prettier、Vitest、严格类型检查、生产构建              |
| `npm test`                 | 规则、20 关固定操作回放、存档异常，共 59 项                   |
| `npm run test:e2e`         | 桌面 Chromium、手机尺寸 Chromium/WebKit、输入与连续 20 关闯关 |
| `npm run test:static`      | 生产包在 `/wallbait/` 子路径的资源和完整一局验收              |
| `npm run replays:generate` | 关卡调整后显式重新搜索操作回放                                |
| `npm run build`            | 构建到 `dist/`                                                |
| `npm run preview`          | 本地预览生产产物                                              |

20 关均有可执行获胜回放，浏览器也已通过从第 1 关连续到第 20 关的原生键盘流程。手机尺寸浏览器测试不等于真机：本轮 iPhone 不可连接，ADB 无在线设备，**真机触感与音频听感未验收**。详见[验收证据](docs/testing/README.md)。

## 项目结构

- `src/core/`：纯 TypeScript 网格规则、状态机、碰撞、关卡数据。
- `src/game/`：Phaser 绘制、固定步驱动、插值、程序音效。
- `src/input/`：键盘与多点 Pointer Events，统一命令。
- `src/ui/`：界面流程、HUD、触控区、矢量插画和样式。
- `src/storage/`：版本化存档、校验和异常降级。
- `tests/`：单元测试、固定回放、浏览器与静态子路径验收。
- `docs/`：设计、架构、关卡意图、开发记录和验收截图。

[文档导航](docs/README.md) · [玩法设计](docs/game-design.md) · [关卡设计](docs/levels.md) · [开发与验收计划](docs/development.md) · [协作规范](CONTRIBUTING.md)

本次未部署或公开发布。上线需要重新构建并发布 H5 静态站点；GitHub Actions 当前仅执行检查，不会自动发布 GitHub Pages。未来项目路径 `/wallbait/` 已在本地生产包中验证。
