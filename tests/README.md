# 验证入口

- `npm test`：核心规则、20 关固定回放、140 轮反套路、事件报告与存档迁移。
- `npm run test:e2e`：桌面 Chromium、手机 Chromium、手机 WebKit 流程。
- `npm run replays:generate`：关卡修改后显式生成操作解，不能代替正常回放验收。

浏览器测试需要先执行 `npx playwright install chromium webkit`。完整验收范围及限制见[验收记录](../docs/testing/README.md)。

`GENERATE_STRATEGIES=1 npx vitest run tests/strategies.test.ts` 更新固定策略证据；`REPORT_REPLAYS=1 npx vitest run tests/replay-report.test.ts` 更新逐关方案与事件统计。先评审，再执行生成和普通模式复验。并行浏览器命令必须使用不同 `--output` 目录，避免清理彼此的 trace。
