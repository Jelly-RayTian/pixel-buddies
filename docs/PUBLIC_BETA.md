# 像素搭子 · 公测（Web）说明

目标：把游戏放到一个公开的 HTTPS 网址，发给朋友和陌生人就能玩，并且能收到匿名统计和反馈。
**当前状态：代码、构建、打包、后端接口都已在本机验证；还没有部署到公网**（需要你的 Cloudflare 账号，见第 2 节）。

## 1. 构建 Web 版

前提：本机装了 Cocos Creator 3.8.8（默认路径 `/Applications/Cocos/Creator/3.8.8/…`，别的路径用环境变量 `COCOS_CREATOR` 指定）。

```bash
cd tools && npm install
```

```bash
cd tools && npm run web:all
```

`web:all` = 命令行构建 `web-mobile`（退出码 36 表示成功）→ 打包成 `dist/`：

```
dist/
  index.html, style.css, 404.html, img/…   ← 落地页（web/landing/）
  play/                                    ← 游戏本体（Cocos 构建产物）
  _headers                                 ← 缓存与安全头（自动生成）
```

打包脚本会：排除隐藏文件（如 Creator 的 `.runtime-bridge/`）、source map、`.meta` 等；检查游戏入口引用的文件都存在、没有引用外部地址；按“带哈希的文件长缓存，入口页每次校验”生成 `_headers`。

本地预览（不含后端）：`python3 -m http.server 8080 --directory dist`，打开 `http://localhost:8080/`。

## 2. 部署到 Cloudflare Pages

仓库里**没有**任何凭证。GitHub 托管的 runner 没有 Cocos Creator，所以**不能在云端构建**；采用“本机构建 → 上传 dist/”。`.github/workflows/verify.yml` 只在云端跑类型检查和单元测试。

一次性准备（需要你自己操作）：

1. 注册/登录 Cloudflare，终端执行 `npx wrangler login`。
2. 建数据库（统计与反馈存这里；不建也能部署，只是 `/api/*` 返回 503，游戏会如实提示反馈未开通、统计静默丢弃）：
   ```bash
   npx wrangler d1 create pixel-buddies
   ```
   把输出的 `database_id` 填进根目录 `wrangler.toml` 里被注释掉的 `[[d1_databases]]` 段，取消注释；然后建表：
   ```bash
   npx wrangler d1 execute pixel-buddies --remote --file=functions/schema.sql
   ```
3. 首次创建 Pages 项目（只需一次）：
   ```bash
   npx wrangler pages project create pixel-buddies --production-branch main
   ```

之后每次发布：

```bash
cd tools && npm run web:deploy
```

它会依次：`npm run verify`（失败就停）→ 构建 → 打包 → `wrangler pages deploy dist`。部署成功后得到 `https://pixel-buddies.pages.dev`（项目名可用环境变量 `CF_PAGES_PROJECT` 改）。

部署后冒烟测试（会往数据库写几条 `platform=smoke` 的测试事件，可忽略）：

```bash
cd tools && npx tsx smoke-api.ts https://你的域名
```

建议在 Cloudflare 控制台给 `/api/*` 加一条 WAF 速率限制规则（例如每 IP 每分钟 60 次），防止被刷；函数本身只做大小/字段/白名单校验。

## 2b. 部署到 Vercel（可选）

同样是“本机构建 → 上传 dist/”：Vercel 的服务器上没有 Cocos Creator，**不能**让 Vercel 从 GitHub 自动构建这个项目（Git 自动部署会失败或只得到空站点）。

```bash
cd tools && npm run web:vercel          # 第一次会弹出浏览器登录 Vercel
# 已经构建过、只想重新上传：SKIP_BUILD=1 npm run web:vercel
# 指定团队/项目名：VERCEL_SCOPE=eric-zzzz VERCEL_PROJECT=pixel-buddies npm run web:vercel
```

它会依次：`npm run verify` → Cocos 构建 → 打包 `dist/` → 写入 `dist/vercel.json`（与 `_headers` 相同的缓存/安全头）和 `/api` 占位函数 → `vercel link` 到已有项目 → `vercel deploy --prod`。

与 Cloudflare 版的区别：
- Vercel 上没有 D1 数据库，**统计与意见反馈不可用**：`*.vercel.app` 域名下游戏不会发请求，反馈页显示“反馈通道还没开通”并提供“复制反馈”；自定义域名下 `/api/*` 统一返回 503。
- 如果 Vercel 项目连着 GitHub 仓库，建议在 Project Settings → Git 里断开，或把 Ignored Build Step 设为 `exit 0`，避免每次推送都产生失败的部署。

### 缓存与路由（已验证）
- `/play/assets/*`、`/play/cocos-js/*`、`/play/src/*` 和根下带哈希的 js/css/png：`immutable`，一年；`src/effect.bin`、`/play/`、`/play/index.html`：每次校验。
- 404 返回 `404.html`（带回首页/直接开玩按钮）；没有 SPA 兜底，错误地址不会被当成游戏。
- 本机用 `wrangler pages dev` 实测：`.js/.json/.mp3` 的 Content-Type 正确，`.runtime-bridge` 返回 404，`X-Content-Type-Options: nosniff` 生效。

## 3. 邀请内测玩家

- 直接发落地页网址（`https://你的域名/`），里面有“立即开玩”、玩法说明、真实截图和公测说明；游戏本体是 `/play/`。
- 一句话邀请语示例：“像素搭子公测，手机浏览器直接玩：<网址>。遇到问题在 设置 → 意见反馈 里告诉我。”
- 提醒玩家：进度存在浏览器本地，清除网站数据、无痕窗口或换浏览器会丢进度；iOS Safari 对长期不打开的网站可能清理本地数据，建议“添加到主屏幕”。

## 4. 统计怎么工作

详见 [ANALYTICS.md](ANALYTICS.md)。要点：
- **默认关闭**。首次打开首页底部有说明条，玩家点“同意”才会开始上报；“不用了”或不处理都不会有任何数据离开设备；设置里随时可关，关闭立刻停止并删除本机随机编号。
- 只发玩法事件（见白名单），不含姓名、昵称、邮箱、手机号、位置、照片、IP；错误信息里的网址/路径会被抹掉。
- 客户端批量发送（10 条或 15 秒）、失败指数退避重试（最多 4 次后丢弃）、进入后台时尽力发送；统计不可用时不影响游戏。
- 服务端再校验一遍：事件白名单、字段白名单、大小上限，不记录 IP。
- **没有同意的玩家不会被统计**，所以“打开游戏人数”只代表同意者；不要把它当作全部访问量（总访问量看 Cloudflare 自带的 Web Analytics/流量报表）。

查看数据（示例）：

```bash
npx wrangler d1 execute pixel-buddies --remote --command "SELECT name, count(*) n, count(DISTINCT sid) sessions FROM events WHERE platform='web' GROUP BY name ORDER BY n DESC"
```

```bash
npx wrangler d1 execute pixel-buddies --remote --command "SELECT json_extract(props,'$.grid') grid, sum(name='puzzle_started') started, sum(name='puzzle_completed') done, sum(name='puzzle_abandoned') abandoned FROM events WHERE name LIKE 'puzzle_%' GROUP BY grid"
```

## 5. 反馈怎么收集

- 入口：个人资料 → 意见反馈，或 设置 → 意见反馈。
- 类型：遇到问题 / 难度 / 界面 / 建议 / 其他；写 5–500 字；**不需要账号、不需要邮箱**。
- 随反馈发送：类型、文字、游戏版本、平台、屏幕尺寸。30 秒内不能连发，每次会话最多 5 条。
- 后端没开通时（本地、没配置接口的小游戏包）：界面如实提示“没有发出去”，并提供“复制反馈”。
- 查看反馈：
  ```bash
  npx wrangler d1 execute pixel-buddies --remote --command "SELECT datetime(received_at/1000,'unixepoch') t, category, text, app_version, viewport FROM feedback ORDER BY id DESC LIMIT 50"
  ```

## 6. 目前支持什么

- Web（iOS Safari / Android Chrome / 桌面浏览器；**真机/真实浏览器未实测**，见第 8 节）：完整游戏、每日挑战、周挑战、等级与成就、收藏、好友挑战码、像素工坊、背景音乐、反馈、匿名统计（需同意）。
- 加载页：像素风进度条（进度来自真实的加载阶段和已下载字节数）；40 秒仍未启动会提示并给出“重新加载”。
- 防护：禁止双指/双击缩放、长按选字和右键菜单（输入框除外）；切走标签页自动暂停游戏和音乐；进入后台和 `pagehide` 时保存进度；请求浏览器持久化存储。
- 音乐：分包按需加载；失败自动改用保底音乐，30 秒后允许重试，并记录 `asset_load_failed`。
- 窗口大小/方向明显变化后，在非游戏页面切换时自动刷新一次重新布局（进度已保存，60 秒内最多一次）。

## 7. 还没有实现

- 在线排行榜（没有后端，界面如实标注“仅本机 · 未验证”）；服务器日期；去广告权益。
- 微信/抖音小游戏的公测：包能构建，但没有真机验证；小游戏端统计/反馈需要配置 `RELEASE.miniApiBase`（https 合法域名）才会启用。
- 账号体系、跨设备同步（进度只在本机）。
- 隐私政策里的开发者名称和联系邮箱已填（`assets/scripts/config/PolicyText.ts`）。

## 8. 已知问题与风险

- **没有在真机 iOS Safari / Android Chrome 上测过**；也没有测 768×1024 与 1440×900 的真实窗口（内置预览面板最大约 535 像素宽，只测了 375×667、390×844、430×932 和 535×649，详见 TEST_REPORT.md 第七轮）。
- 首次打开约需下载 2.2MB（未压缩；Cloudflare 会压缩文本文件），音乐按需追加；弱网下会更慢。真实首屏耗时只能靠上线后的 `loading_time` 事件得到。
- iOS Safari 的 EditBox（反馈输入框）软键盘行为未实测。
- 整个 Web 包约 16MB（含全部音乐），Cloudflare Pages 单文件和总量限制都远未触及。
- 同意前的事件不会补发，所以首次访问者的“打开游戏/首局开始”不会被统计。

## 9. 复现测试

```bash
cd tools && npm run verify
```

= 严格类型检查（含 `functions/`）+ 微信 API 兼容检查 + 全部单元测试（当前 125 项）。

后端冒烟（本地）：

```bash
npx wrangler d1 execute pixel-buddies --local --file=functions/schema.sql
```

```bash
npx wrangler pages dev dist --d1 DB=<本地数据库 id>
```

```bash
cd tools && npx tsx smoke-api.ts http://127.0.0.1:8788 --feedback
```
