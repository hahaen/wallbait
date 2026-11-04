# 验证入口

- `npm test`：核心规则、20 关固定回放与存档异常。
- `npm run test:e2e`：桌面 Chromium、手机 Chromium、手机 WebKit 流程。
- `npm run replays:generate`：关卡修改后显式生成操作解，不能代替正常回放验收。

浏览器测试需要先执行 `npx playwright install chromium webkit`。完整验收范围及限制见[验收记录](../docs/testing/README.md)。
