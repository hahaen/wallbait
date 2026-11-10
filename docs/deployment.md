# 线上发布

[在线试玩](https://hahaen.xyz/game/wallbait)。入口会跳转到 `/game/wallbait/`，使 Vite 生成的相对资源地址能在子路径下正常加载。

只有游戏功能或运行、构建、部署配置变更才触发 H5 发布和 ZIP 打包。按 [AGENTS.md](../AGENTS.md) 完成评审、验证和推送并确认本机 `main` 与 `origin/main` 一致后，在本机执行 `bash deploy/publish.sh` 发布 H5，并运行 `npm run build:mapp` 生成 LINUX DO 微应用 ZIP。日常交付由开发代理自动执行，GitHub Actions 负责检查。仅修改文档或注释时，仍提交并推送，但不发布 H5，也不打包 ZIP。

发布需要 Node.js 24 和可用的 `hahaen-server` SSH 配置。本机脚本核对当前提交与 GitHub 的 `main` 一致，从已提交的源码构建，通过 SSH 上传产物，并逐字节比对线上首页和静态资源。发布失败时查看报错，确认 `main` 和服务器状态后可重试同一命令。

服务器只接收构建产物。`/home/hahaen/game/wallbait/dist` 指向当前发布目录，切换时一次更新链接，`releases/` 保留当前和上一次发布。共享 Nginx 容器将 `/home/hahaen/game/wallbait` 只读挂载到 `/srv/wallbait`，在 `hahaen.xyz` 的 HTTPS `server` 中包含[游戏路由](../deploy/nginx/wallbait.locations)。日常发布只更新游戏产物，无需重载 Nginx。

更新 Nginx 路由时先用 `nginx -t` 验证，再重载。线上交互抽查可运行 `WALLBAIT_STATIC_ORIGIN=https://hahaen.xyz npx playwright test --config playwright.static.config.ts`，覆盖无尽开局、被抓结算、刷新后读取纪录和装备，以及子路径资源加载。

## LINUX DO 微应用

在 LINUX DO 的「个人资料 → 应用」创建应用，将平台分配的 ID 填到项目根目录的本地文件 `.env.mapp.local`。此文件由 Git 忽略。

```dotenv
MINI_APP_ID=你的实际应用ID
```

使用 Node.js 24 执行 `npm ci`，再运行 `npm run build:mapp`。微应用构建从 GitHub 获取固定提交的官方 SDK，校验入口类型并生成 `dist-mapp/app.zip`。版本号在 [打包脚本](../mapp/build.mjs) 中维护。H5 发布继续使用 `npm run check` 生成 `dist/`，并从该目录部署。

打包后可运行 `npm run test:mapp`，用 Chromium 和 WebKit 在本地模拟宿主的启动握手和安全策略，验证加载、开局、暂停与结算。

将原始 ZIP 上传到应用管理的「沙箱」。在沙箱验证触控、键盘、切后台暂停、音效和重开后读取纪录，再在「正式」页用同一构建提审，收到正式包就绪的通知后启用版本。

`storage.read` 和 `storage.write` 用于当前浏览器的最高纪录和设置，`audio.webAudio` 用于合成游戏音效。微应用与 H5 各自保存纪录，沙箱和正式版也各用独立存档。参见 [官方开发指南](https://github.com/linux-do/mapp-developer-guide/blob/master/docs/developer-guide.md) 和 [提审说明](https://github.com/linux-do/mapp-developer-guide/blob/master/docs/submission-review.md)。
