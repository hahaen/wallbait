# 撞墙了么

**你追你的，墙就在那儿。**

一颗红苹果，三种蛇，四章20关。把蛇引到墙边，再横向闪开。奶油色卡通画风，全流程可玩；无蓄力、读条或提前锁定提示。

## 本地试玩

Node.js **24.x**，按锁文件安装：

```sh
npm ci
npm run dev
```

打开 [本地试玩](http://127.0.0.1:5173/)。首页与 Phaser 引擎分包，进入关卡时按需加载。

- **电脑**：方向键/WASD移动，空格用工具，E放信标，P/Escape暂停。
- **手机**：十字键移动，圆按钮用工具；支持多点触控与滑动换向。
- 两格共享电，闪避/脉冲/磁推三选一，信标第5关开放。蛇冲出后不转弯，撞墙/关门/实心残骸淘汰。
- 结束先留1200ms现场，再显示精简结算；详情按需展开。保留旧解锁、设置和收藏，新旧成绩独立。

[玩法规则](docs/game-design.md) · [本轮重做与验收](docs/records/2026-11-04-cartoon-redesign.md)

## 验证与证据

```sh
npm run check
npx playwright install chromium webkit
npm run test:e2e
npm run test:static
```

| 命令                       | 内容                                                                          |
| -------------------------- | ----------------------------------------------------------------------------- |
| `npm run check`            | ESLint、Prettier、Vitest、严格类型检查、生产构建                              |
| `npm test`                 | 规则、迁移、20关主线、3条芯片、27条搭配、20条战术、2条能力展示及140轮策略核验 |
| `npm run test:e2e`         | 桌面/手机尺寸 Chromium、手机尺寸 WebKit、完整流程、触控、连续闯关             |
| `npm run test:static`      | 生产包 `/wallbait/` 子路径资源、通关与恢复                                    |
| `npm run replays:generate` | 规则/关卡调整后显式重新搜索合法操作解                                         |
| `npm run build`            | 构建到 `dist/`                                                                |

20 关主线、三条芯片支线、27条替代搭配、20条战术目标与七种固定简单策略随规则变更重新验证，最新状态见[本轮记录](docs/records/2026-11-04-cartoon-redesign.md)。自动回放只证明可解，不能当作人类难度或手感成绩。实际执行情况、交互试玩与剩余限制见 [验收记录](docs/testing/README.md)。

加载保护、准备页布局与工具反馈的本轮问题清单及验证见[交互优化记录](docs/records/2026-11-04-optimization.md)。

小米14实体Chrome已完成第一关通关、多点触控、取消释放、暂停和延迟结算抽样，见[真机证据](docs/records/2026-11-04-cartoon-redesign.md)。按用户要求不做iPhone真机验收；真人难度、真机完整二十关与低端设备性能保留在[后续事项](docs/remaining-work.md)。

## 项目结构

- `src/core/`：纯 TypeScript 整数网格、固定步、状态机、机关、碰撞与关卡。
- `src/game/`：Phaser 绘制、插值、程序音效；动画不决定碰撞。
- `src/input/`：键盘与多点 Pointer Events，输出玩家命令。
- `src/ui/`：流程、HUD、双技能操作区与原创矢量主题。
- `src/storage/`：版本化存档、成绩隔离、校验与异常回退。
- `tests/`：关键规则、固定回放、反套路、浏览器与子路径验收。
- `docs/`：玩法、架构、逐关方案、开发记录和实际截图。

[文档导航](docs/README.md) · [玩法设计](docs/game-design.md) · [关卡设计](docs/levels.md) · [架构](docs/architecture.md) · [开发计划](docs/development.md) · [协作规范](CONTRIBUTING.md)

**本次未部署或公开发布。上线需重新构建并发布 H5 静态站点。** GitHub Actions 只执行检查，不自动发布 GitHub Pages。
