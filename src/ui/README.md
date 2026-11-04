# 界面

`styles.css` 当前只负责页面、手机安全区和 Canvas 容器。

后续在这里放 HUD、方向键、闪避冷却、暂停面板和结果面板。
组件只显示状态、发出命令，不判定碰撞或胜负。
首版优先使用 Phaser Game Objects 实现游戏内界面，避免同时引入 React/Vue。
若后续使用 DOM 按钮，保持相同命令接口，不向 `core/` 引入 DOM 依赖。
