# 核心规则

已实现于 `src/core/`：类型、参数、20 关配置、固定步状态机、BFS 追踪和逐格碰撞。规则不依赖浏览器、Phaser 或存储。

- `createState(level)` 创建独立对局，重开直接使用新状态。
- `step(state, command)` 推进 20ms，命令只有四向/停止与闪避意图。
- `setPaused(state, paused)` 冻结或恢复，并重置移动计时。
- `state.events` 是本步一次性事件；已结束对局不再产生结算。
- `validateLevel` 检查地图、连通性、出生安全距离和参数；它不证明可通关。

碰撞与参数以[玩法设计](../../game-design.md)为准。测试：[规则测试](../../../tests/core.test.ts)、[20 关实际操作回放](../../../tests/solutions.test.ts)。
