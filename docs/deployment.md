# 线上发布

[在线试玩](https://hahaen.xyz/game/wallbait)。入口会跳转到 `/game/wallbait/`，使 Vite 生成的相对资源地址能在子路径下正常加载。

按 [AGENTS.md](../AGENTS.md) 完成评审、验证、提交与推送后，在本机执行 `bash deploy/publish.sh`。日常交付由开发代理自动执行这一步。GitHub Actions 负责检查，手动在终端交付时在推送后运行相同命令。

发布需要 Node.js 24 和可用的 `hahaen-server` SSH 配置。本机脚本核对当前提交与 GitHub 的 `main` 一致，从已提交的源码构建，通过 SSH 上传产物，并逐字节比对线上首页和静态资源。发布失败时查看报错，确认 `main` 和服务器状态后可重试同一命令。

服务器只接收构建产物。`/home/hahaen/game/wallbait/dist` 指向当前发布目录，切换时一次更新链接，`releases/` 保留当前和上一次发布。共享 Nginx 容器将 `/home/hahaen/game/wallbait` 只读挂载到 `/srv/wallbait`，在 `hahaen.xyz` 的 HTTPS `server` 中包含[游戏路由](../deploy/nginx/wallbait.locations)。日常发布只更新游戏产物，无需重载 Nginx。

更新 Nginx 路由时先用 `nginx -t` 验证，再重载。线上交互抽查可运行 `WALLBAIT_STATIC_ORIGIN=https://hahaen.xyz npx playwright test --config playwright.static.config.ts`，覆盖进关、通关、刷新后读取进度及资源加载。
