# 验证入口

- `npm test`：核心规则、20关固定回放、3条芯片支线、27条替代搭配与20条战术目标回放、2条强化能力展示、140轮反套路、事件报告与存档迁移。
- `npm run test:e2e`：桌面 Chromium、手机 Chromium、手机 WebKit 流程。
- `npm run replays:generate`：关卡修改后显式生成操作解，不能代替正常回放验收。

浏览器测试需要先执行 `npx playwright install chromium webkit`。完整验收范围及限制见[验收记录](../docs/testing/README.md)。

`GENERATE_STRATEGIES=1 npx vitest run tests/strategies.test.ts` 更新固定策略证据；`REPORT_REPLAYS=1 npx vitest run tests/replay-report.test.ts` 更新逐关方案与事件统计。先评审，再执行生成和普通模式复验。并行浏览器命令必须使用不同 `--output` 目录，避免清理彼此的 trace。

`GENERATE_SKILLS=1 REPLAY_WIDTH=700 npx vitest run tests/skill-replays.test.ts` 显式重建所有替代装备及战术星回放；普通模式检查完整覆盖并重放，要求第6关脉冲与第11关磁推样本实际成功使用工具。`GENERATE_CHIPS=1 REPLAY_WIDTH=100 npx vitest run tests/enrichment-replays.test.ts` 更新芯片支线。生成只能证明有合法解，不能替代难度与手感评估。

`skills.spec.ts` 在手机尺寸项目通过原生 `tap()` 使用工具，配合正常方向与信标命令；另检查第12/14关强化预告、胜利、重开及预告中暂停冻结。浏览器模拟不能等同实体手机触感。

`GENERATE_ABILITIES=1 npx vitest run tests/ability-replays.test.ts`生成专门展示侧切/干扰并获胜的两条路线，普通模式逐tick验证触发与胜利；最快主线不强制触发全部能力。`REPLAY_LEVEL`支持主线和工具回放按关重搜。macOS Chromium使用Metal，避免SwiftShader拖慢固定步浏览器回放；截图仍保留原设备像素比。

并行运行时同时设置独立`--output`和`--reporter=line`，避免HTML报告目录互相覆盖。开发服务忽略测试报告与截图，避免回归过程让游戏意外刷新。
