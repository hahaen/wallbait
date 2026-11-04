# 纯游戏规则

这里实现坐标、地图、苹果移动、蛇状态机、碰撞、胜负和难度参数。

- 不导入 Phaser、DOM、localStorage，不读取系统时间。
- 后续以固定时间步推进：`step(state, commands, deltaMs)`，输出新状态与事件。
- 逻辑使用整数格坐标；平滑插值、粒子和音效交给 `game/`。
- 规则首次实现时添加对应的离线单元测试，重点验证冲刺锁向、碰撞、闪避和暂停。

建议随功能逐步建立 `types.ts`、`config.ts`、`state.ts`、`step.ts`、`systems/`。
当前只预留模块边界，尚未实现这些规则。
