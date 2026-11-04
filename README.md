# 撞墙了么 · wallbait

**你追你的，墙就在那儿。**

你操控苹果，把追你的蛇引到墙边，在它蓄力冲刺后闪开，让它撞墙。

## 当前进度

- [x] 游戏名称、宣传语、公开仓库。
- [x] 手机竖屏视觉概念图。
- [x] Phaser + TypeScript + Vite 开发骨架、目录规范和 CI 配置。
- [ ] 首版玩法：一张地图、一条蛇、一个闪避技能。
- [ ] 手机和电脑体验验收。
- [ ] 在线试玩部署。

目前运行后显示开发启动页，尚不能游玩。CI 配置会在推送后运行，远端结果需单独核对。

## 本地开发

使用 **Node.js 24.x + npm**，版本提示见 `.nvmrc`。克隆后运行：

```sh
npm ci
npm run dev
```

打开终端显示的本地地址，默认 `http://127.0.0.1:5173/`。
同一局域网手机调试时运行 `npm run dev -- --host 0.0.0.0`，使用电脑的局域网 IP 访问。

| 命令                | 用途                               |
| ------------------- | ---------------------------------- |
| `npm run dev`       | 启动开发服务器                     |
| `npm run typecheck` | TypeScript 类型检查                |
| `npm run lint`      | ESLint 检查                        |
| `npm run format`    | 格式化项目文本文件                 |
| `npm run check`     | 代码检查、格式检查、类型检查和构建 |
| `npm run build`     | 产物输出到 `dist/`                 |
| `npm run preview`   | 本地预览构建产物                   |

## 目录

```text
wallbait/
├── src/
│   ├── main.ts                # 程序入口、开发热更新清理
│   ├── core/                  # 纯规则：移动、状态机、碰撞、胜负（待实现）
│   ├── game/
│   │   ├── createGame.ts      # Phaser 初始化
│   │   ├── config.ts          # 画面尺寸、主题参数
│   │   └── scenes/            # 当前为开发启动场景
│   ├── input/                 # 键盘和触控 → 统一命令（待实现）
│   ├── ui/                    # 页面样式；后续 HUD 与操作面板
│   ├── storage/               # 设置、成绩的本地存档（待实现）
│   └── assets/                # 经 Vite 打包的美术、音频资源
├── public/                    # 原样复制到站点的静态文件
├── tests/                     # 测试计划，随首批规则接入测试框架
├── docs/
│   ├── architecture.md       # 模块边界和数据流
│   ├── game-design.md        # 首版玩法、待验证参数和胜负规则
│   ├── development.md        # 开发顺序、验收和部署说明
│   └── design/               # 概念图及其说明
├── .github/workflows/ci.yml   # 安装、检查、构建；不包含发布
├── AGENTS.md                  # 后续协作开发约定
└── package.json               # 依赖和统一命令
```

`core/`、`input/`、`storage/` 等目录中的 README 说明预留职责，不表示对应功能已经实现。

## 技术与文档

单个纯前端项目，采用 Phaser 3、TypeScript、Vite、ESLint 和 Prettier，使用 npm 锁文件固定安装结果。
首版无需后端、登录或前端 UI 框架。本地存档、自动暂停及 GitHub Pages 发布按开发计划接入。

- [开发文档导航](docs/README.md)
- [玩法设计](docs/game-design.md)
- [架构设计](docs/architecture.md)
- [开发与验收计划](docs/development.md)
- [手机效果图](docs/design/README.md)

参考：[Phaser 官方文档](https://docs.phaser.io/)、[Vite 官方指南](https://vite.dev/guide/)。

开发、评审、验证与交付请遵循[项目协作规范](CONTRIBUTING.md)。
