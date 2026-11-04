# 核心规则

实现于 `src/core/`：类型、参数、20 关配置、固定步状态机、三类目标策略、BFS 追踪、门与信标、共享电量和逐格碰撞。规则不依赖浏览器、Phaser 或存储。

- `createState(level)` 创建独立对局，包括各门状态、电量、信标和独立残骸数组；重开使用新状态。
- `step(state, command)` 推进 20ms，命令包含四向/停止、闪避和信标意图。只有这个入口推进对局。
- `solid(level, point)` 检查静态墙；`blocked(state, point)` 加上当前关闭门与实心残骸。待生效地形不改变碰撞。
- `targetFor(state, snake)` 给出追踪目标；正式锁向后使用 `locked`。`warningPath` 提供真实危险格，供渲染显示。
- `setPaused(state, paused)` 冻结或恢复，不重置普通移动间隔。电量回充与信标寿命属于规则时间。
- `state.events` 是本步一次性事件；结束后不再产生结算。失败原因保存在 `lossReason`。
- `validateLevel` 检查静态墙、连通性、出生与参数、门和踏板配置、门状态下的区域可达性；合法配置不能代替含敌人时序的可解性回放。

门切换在正式预警/冲刺期间等待，关门遇角色占用也等待。玩家踩入踏板时触发，站住不重复触发。敌人之间及履带不参与碰撞。

参数与完整规则见[玩法设计](../../game-design.md)，顺序与边界见[架构](../../architecture.md)。验证入口：[基础规则](../../../tests/core.test.ts)、[进阶规则](../../../tests/advanced-core.test.ts)、[关卡命令回放](../../../tests/solutions.test.ts)。执行结果统一记录在[验收文档](../../testing/README.md)。

投掷落点由 `beaconLanding(state)` 计算，规则放置与画面预览共用。残骸在最后头部格生成；与门一样等待所有正式攻击结束，并等待占格角色离开后生效。冲刺撞残骸继续产生撞毁事件，以 `obstacle` 区分墙/门和残骸。新增边界与第八关正常命令接力见[机制测试](../../../tests/wrecks-and-throw.test.ts)。
