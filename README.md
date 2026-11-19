# 像素搭子（Pixel Buddies）

> 每张图片都可以成为一个故事，每个拼图都可以成为一次挑战。

一款竖屏轻度像素拼图小游戏，目标平台为 **微信小游戏** 与 **抖音小游戏**。
技术栈：Cocos Creator 3.8 + TypeScript，界面全部使用引擎原生 UI 组件（Sprite / Label / Graphics / Mask / Tween）在代码中构建。

![作品总览](art-preview/_contact_sheet.png)

| 首页 | 游戏（6×6） | 每日挑战结算 | 好友挑战对比 |
|---|---|---|---|
| ![](docs/screenshots/01_home.png) | ![](docs/screenshots/03_game_6x6.png) | ![](docs/screenshots/04_result_daily.png) | ![](docs/screenshots/08_challenge_compare.png) |

| 像素工坊 | 工坊作品 | 隐私政策 | 微信分享卡片 |
|---|---|---|---|
| ![](docs/screenshots/09_workshop.png) | ![](docs/screenshots/10_workshop_list.png) | ![](docs/screenshots/11_policy.png) | ![](docs/screenshots/12_share_card.png) |

（以上为 Cocos Creator 3.8.8 web-mobile 构建在浏览器中的实际运行截图；分享卡片由游戏内同一份绘制代码在浏览器 2D Canvas 中生成）

发行素材：`docs/store-assets/icon_512.png`、`icon_144.png`（小游戏图标，`cd tools && npm run store-assets` 可重新生成）。

---

> **公测（Web）**：落地页 + 在线部署 + 匿名统计（需同意）+ 意见反馈 + Cloudflare Pages 部署流程，见 [docs/PUBLIC_BETA.md](docs/PUBLIC_BETA.md)。

## 1. 当前状态（请先读）

| 项目 | 状态 |
|---|---|
| 核心逻辑（打乱、交换、判定、计时、星级、存档、每日、挑战码、工坊、分享卡片） | 已完成，166 项 Node 单元测试全部通过（`cd tools && npm run verify`） |
| 全部游戏脚本 | 已完成，在 `@cocos/creator-types@3.8.8`（官方引擎类型）下 **strict 模式编译零错误** |
| 微信 API 使用 | 编译期对照微信官方 `minigame-api-typings` 校验通过（拼错接口名会编译失败） |
| 抖音 API 使用 | 依据抖音开放平台小游戏文档（2026-11 核对）实现，有模拟测试；**无官方 TS 类型可做编译校验** |
| 36 张原创像素图 + 图标 + 音效 | 已完成，全部由程序生成 |
| Cocos Creator 3.8.8 命令行构建（web-mobile / 微信 / 抖音） | ✅ 三个平台都构建成功；微信/抖音主包约 2.4MB（低于 4MB 上限），音乐在分包（约 14MB），整包约 16.6MB |
| Web 构建实际运行 | ✅ 已在浏览器中玩通：经典 4×4 / 6×6、每日挑战、好友挑战完整闭环、暂停/后台、存档刷新保留，8 个页面都截图检查过 |
| 微信/抖音开发者工具、真机 | **未验证**：本机没有两个开发者工具，也需要你的 AppID |
| 平台审核 / 发布 | 未提交，未发布 |

截图见 `docs/screenshots/`。命令行构建配置在 `tools/build-configs/`（第 4 节）。

---

## 2. 功能一览

- **经典拼图**：方块交换式拼图（不是只有一个空格的 15 数字推盘）。按住拖到另一块上交换，或者先点一块再点另一块交换。支持 4×4 简单、5×5 普通、6×6 困难。
- **打乱方式（可预测难度）**：随机选出 2×N 个**互不重复**的格子，两两互换，其余方块开局就在正确位置并锁定。所以错位方块数恒为 2N，恰好 N 次交换就能还原（最优步数 = N），一定有解。同一 (图片, 网格, 种子) 永远生成同样的布局，每日挑战和好友挑战两端一致。

  | 难度 | 网格 | 需要交换 | 错位方块 |
  |---|---|---:|---:|
  | 入门 | 3×3 | 1 | 2 |
  | 简单 | 4×4 | 3 | 6 |
  | 普通 | 5×5 | 6 | 12 |
  | 困难 | 6×6 | 9 | 18 |

  新手渐进：前 3 局入门拼图分别需要换 1、2、3 次（只作用于经典模式的随机局），之后恢复表中数值。难度选择页会按进度推荐一档（新手推荐“入门 3×3”）。
- **计时与评分**：从第一次触碰方块开始计时。暂停和进入后台时冻结计时。星级取时间、步数、提示三项中最低的一项；阈值按难度单独配置，步数阈值按“最优步数”的比例计算，不同打乱结果之间公平。
- **目标图片常驻**：游戏页左上角始终显示完整原图（标签“目标图片”），点一下放大查看，不消耗提示、不看广告。
- **引导**：选中或拖起一块放错的方块时，它显示粉框，它应该去的位置显示绿框并轻轻呼吸，之间有一条虚线箭头；已锁定的方块不会被当成目标。提示按钮用同样的方式演示一次正确交换（停留约 3.5 秒）。
- **其它辅助**：按住看原图（不影响星级）、撤销（不计步）、“三星剩余时间”。
- **互动教程**：第一次玩时分四步：看目标 → 认识交换 → 玩家亲手完成一次真实的交换（只允许操作那一对方块，点错有温和提示）→ 庆祝。教程用当前题目里真实的一对错位方块，不消耗提示，不自动代劳，可随时跳过，完成后写入存档不再出现。
- **每日挑战**：题目完全由日期决定。每 12 天为一轮，每轮对全部图片做一次确定性洗牌，相邻两天一定是不同的图。重启游戏题目不变。记录个人最佳、连续完成天数、近 7 天情况，并生成结果卡片。
- **好友异步挑战**：挑战码包含图片 ID、难度、种子、版本号、发起者成绩和校验值。好友通过分享卡片的 query 或粘贴挑战码，会得到完全相同的题目。结算时显示双方成绩，并明确标注“本地对比，暂无在线排行榜”。
- **主题收藏（Pixel Collection）**：完成拼图 → 解锁收藏作品 → 集齐主题系列 → 自动获得系列奖励。
  - 36 张原创作品分成 5 个系列：**可爱动物**（橘猫、柴犬、白猫、兔子）、**甜品派对**（草莓蛋糕、珍珠奶茶、马卡龙塔、三球冰淇淋）、**温馨日常**（卧室、小花园、星空小屋、海边日落），以及各 12 件的 **十二生肖**（`art/ZodiacArt.ts`，主题曲用中国乐器）和 **十二星座**（`art/StarsArt.ts`，主题曲用西洋原声乐器）。数据在 `collection/SeriesCatalog.ts`，有自检测试保证每张图恰好属于一个系列。
  - **首次完成**某张作品才解锁收藏卡，并弹出收藏卡片（完整作品 + 系列进度）；**重复完成**只更新最佳成绩，不再弹窗、不重复解锁，结算页显示“距离系列奖励还差 N 件”。
  - **系列奖励**：集齐后自动发放一次——收藏徽章、头像框（首页头像换成系列主色框并带徽章）、专属收藏背景（该系列页面和收藏册的淡色背景）。没有随机、没有抽卡、没有新货币，复用现有星星和存档。
  - **收藏册**：总览（已收藏 x/36、整体进度、已完成主题数）→ 主题卡片（封面、进度条、状态、奖励预览）→ 主题详情（作品网格，未收藏的显示轮廓和解锁条件，只差一件时会突出）→ 作品详情（大图、简介、所属系列、收藏时间、最佳成绩、星星）。
  - 首页有“我的收藏”卡片：总进度、最近解锁、下一个系列奖励；“开始拼图”仍是最显眼的入口。
  - 旧存档升级到 v3 时保留全部成绩与收藏；已经集齐的系列会补发奖励，并在第一次进入收藏册时展示一次庆祝页。
  - 统一埋点接口 `analytics/Analytics.ts`（`puzzle_started / puzzle_completed / puzzle_replayed / collection_item_unlocked / collection_series_progressed / collection_series_completed / collection_reward_claimed / collection_page_opened`）；调试构建会打印到控制台，匿名统计默认关闭，玩家同意后才会上报（见 [统计埋点](docs/ANALYTICS.md)）。
- **解锁进度**：4 张默认开放，其余按总星数逐步开放。
- **本地存档**：带版本号的存档，包含 v1→v2 迁移、损坏备份、写入失败提示。
- **设置**：音乐、音效、振动开关，重看教程，清除存档（二次确认），隐私与平台状态说明，游戏内《隐私政策》《用户协议》（可滚动阅读）。
- **像素工坊**：选一张本地照片，在本机转换成 60×60 像素画（可选 8/16/32 色），保存后像内置作品一样拼图、记录成绩。照片不上传、不保存原图，只在本机存约 5KB 的调色板像素，最多 6 张，可删除。第一次使用前会弹出授权说明。工坊作品不计入星星，也不能发起好友挑战（好友没有这张照片，且没有服务器）。
- **分享成绩卡片**：微信分享时用 Canvas 2D 在离屏画布上绘制 500×400 的成绩卡片（作品、星级、用时、号召语），作为分享图。拿不到时退回包内默认分享图 `share.png`。
- **新手教程**：第一局显示手势动画提示。
- **动画与音效**：选中放大、拖动跟手、交换补间、归位弹跳加闪光、已锁定方块轻摇、完成时缝隙闭合加纸屑、三星光环、按钮按压回弹、页面淡入位移过渡；7 个音效。
- **背景音乐**：菜单页 5 首歌单轮播（每首约 2:40 后换下一首，设置页可“换一首”）；每张作品各有一首约 2:40 的原创主题曲，拼哪张就放哪首；换曲淡入淡出。全部由 `tools/gen-music.py`、`tools/gen-themes.py` 合成，另有 1 首作者录音 Pink Haze。曲目放在 4 个音乐分包里，**构建微信/抖音前需把它们设为小游戏分包**，详见 [docs/MUSIC.md](docs/MUSIC.md)。
- **平台适配**：Web、微信、抖音三套适配器，统一接口，每个能力都先检测再调用，不支持时优雅降级。
- **预留能力**：激励视频（看完后发放 1 次额外提示，逻辑已接通）与插屏广告（默认禁用），服务器排行榜接口，数据分析上报通道。

---

## 2.1 V3–V5 升级（留存 / 社交 / 变现）
每日任务、每周挑战、等级经验、成就、个人资料、挑战记录与排行（本地/服务器明确区分）、广告频控与统计埋点。详见：
[功能说明](docs/V3-V5_FEATURES.md) · [存档迁移](docs/SAVE_MIGRATION.md) · [广告接入](docs/ADS_SETUP.md) · [统计埋点](docs/ANALYTICS.md) · [排行榜后端契约](docs/leaderboard-backend.md)。广告默认关闭；匿名统计需玩家同意后才开启。

## 3. 打开与运行

### 3.1 环境

- **Cocos Creator 3.8.8**（`package.json` 中 `creator.version`）。3.8.2 及以上都应能打开；3.8.0、3.8.1 也做了兼容（文字描边会自动改用 `LabelOutline` 组件）。
- 通过 [Cocos Dashboard](https://www.cocos.com/creator-download) 安装编辑器。

### 3.2 打开项目

1. 打开 Cocos Dashboard，选择 **项目 → 导入**，选中 `PixelBuddies` 文件夹。
2. 首次打开时，编辑器会生成 `library/`、`temp/`，并为没有 `.meta` 的资源补全 `.meta`。这是正常现象。
3. 在资源管理器中双击 `assets/scenes/Main.scene`。
4. 点击顶部的 **预览** 按钮（浏览器预览）。建议把预览设备设为 iPhone 12/13（390×844）或其他竖屏机型。

### 3.3 如果场景加载异常（兜底）

`Main.scene` 只包含 `Canvas → Camera` 和 `Canvas → GameRoot` 两个节点，所有界面都由 `GameRoot` 组件在运行时用代码搭建。

- 如果提示 `GameRoot` 组件丢失：只要场景里有 Canvas，`GameRoot.ts` 末尾的兜底引导会在运行时自动把组件挂上去。你也可以在 Canvas 下新建空节点，手动添加 `GameRoot` 组件。
- 如果场景文件本身无法解析：新建一个 2D 场景（自带 Canvas 和 Camera），保存为 `assets/scenes/Main.scene`，在 Canvas 下新建节点并挂 `GameRoot` 组件即可，不需要其他任何配置。

### 3.4 工具链（不参与构建）

`tools/` 目录用于类型检查、单元测试、生成像素图预览和音效：

```bash
cd tools && npm install
```

```bash
cd tools && npm run verify
```

`npm run verify` 依次执行：引擎类型检查 → 微信 API 兼容检查 → 单元测试。

```bash
cd tools && npm run art
```

```bash
cd tools && npm run audio
```

`npm run art` 导出 `art-preview/*.png`；`npm run audio` 重新生成 `assets/resources/audio/*`。

---

## 4. 构建微信小游戏

1. 在 [微信公众平台](https://mp.weixin.qq.com/) 注册小游戏，拿到 **AppID**。
2. 安装 [微信开发者工具](https://developers.weixin.qq.com/minigame/dev/devtools/download.html)。
3. Cocos Creator → **项目 → 构建发布**：
   - 发布平台：**微信小游戏**
   - 初始场景：`db://assets/scenes/Main.scene`（勾选参与构建的场景）
   - 设备方向：**Portrait（竖屏）**
   - AppID：填你的微信小游戏 AppID
   - 建议勾选：MD5 缓存；纹理压缩可以不开（作品都是运行时生成的小纹理）
4. 点击 **构建**，完成后点 **运行**，或用微信开发者工具打开 `build/wechatgame`。
5. 包体：项目已在 `settings/v2/packages/engine.json` 中做了功能裁剪，只保留 2D、UI、Graphics、Mask、音频、Tween。release 构建实测约 2.2MB；如果不裁剪（引擎默认全模块加 debug），约 8.9MB，会超过主包上限。

也可以用命令行构建（Cocos CLI 退出码 36 表示构建成功）：

```bash
/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator --project "$(pwd)" --build "configPath=$(pwd)/tools/build-configs/wechatgame.release.json"
```

`tools/build-configs/` 中有 web-mobile、wechatgame、bytedance-mini-game 三个平台的 debug 和 release 配置。AppID 是占位值，请先换成你的。

**AppID 位置**：以构建面板为准。`assets/scripts/config/PlatformConfig.ts` 中的 `WECHAT_CONFIG.appId` 只是标识占位，不参与鉴权。

## 5. 构建抖音小游戏

1. 在 [抖音开放平台](https://developer.open-douyin.com/) 创建小游戏，拿到 **AppID**。
2. 安装抖音开发者工具。
3. Cocos Creator → **构建发布**：
   - 发布平台：**抖音小游戏**（bytedance-mini-game）
   - 初始场景：`Main.scene`；设备方向：竖屏；AppID：填你的抖音 AppID
4. 构建后，用抖音开发者工具打开 `build/bytedance-mini-game`。
5. 分享配置：抖音分享图取自后台的 **运营能力 → 分享配置**，或审核通过的 `templateId`。拿到后填入 `DOUYIN_CONFIG.shareTemplateId`。

---

## 6. 填写发行配置

文件：`assets/scripts/config/PlatformConfig.ts`（目前全部为占位值，没有任何真实 ID）

| 字段 | 说明 |
|---|---|
| `WECHAT_CONFIG.appId` / `DOUYIN_CONFIG.appId` | 仅作标识。真实 AppID 填在构建面板 |
| `*.ads.rewardedVideo` / `*.ads.interstitial` | 广告位 ID，留空 = 未接入 |
| `*.shareTemplateId` | 微信 `imageUrlId` / 抖音 `templateId`，需后台审核通过 |
| `*.shareImageUrl` | 自定义分享图，留空则由平台用默认图 |
| `RELEASE.adsEnabled` | 广告总开关，默认 `false` |
| `RELEASE.leaderboardEndpoint` | 服务器排行榜地址（预留），留空 = 仅本地成绩 |

## 7. 接入广告

1. 微信需开通 **流量主**（有用户量门槛）；抖音需开通 **广告变现**。在后台创建激励视频广告位（可选：插屏广告位）。
2. 把广告位 ID 填入 `PlatformConfig.ts`，并把 `RELEASE.adsEnabled` 改为 `true`。
3. 统一入口是 `assets/scripts/ads/AdManager.ts`：
   - `isRewardedAvailable()` 返回 false 时，界面不会出现任何看广告入口。
   - 只有平台回调 `isEnded === true` 才发奖励；加载失败会如实提示。
   - 插屏广告只在“结算页 → 首页”这种自然切换点调用，至少间隔 2 分钟，拼图过程中绝不调用。
4. 发放额外提示：已实现。`GamePage.rewardHint()` 收到 `rewarded` 后调用 `PuzzleManager.grantExtraHint()`，单元测试已覆盖。

## 8. 需要开发者账号或平台审核的功能

| 功能 | 需要 |
|---|---|
| 真机运行、上传体验版 | 微信/抖音小游戏 AppID |
| 分享卡片自定义图片 | 微信：分享图审核（`imageUrlId`）；抖音：分享配置 / `templateId` 审核 |
| 激励视频、插屏广告 | 微信流量主 / 抖音广告变现开通，以及广告位 ID |
| 正式发布 | 两个平台的版本审核；游戏类目可能需要相关资质（如软著），以平台要求为准 |
| 在线排行榜 | 自建服务器，或平台开放数据域 |
| 像素工坊（选照片） | 已有游戏内授权说明与《隐私政策》；上线前还需在微信后台“用户隐私保护指引”中声明相册/相机用途（`wx.chooseMedia` 属于隐私接口），抖音同理 |
| 隐私政策 / 用户协议 | 游戏内已有模板（`config/PolicyText.ts`），发布前替换【开发者名称】【联系邮箱】，并按实际接入的服务更新内容 |

---

## 9. 目录结构

```
PixelBuddies/
├── package.json                 # Cocos 项目描述（creator.version = 3.8.8）
├── tsconfig.json                # 继承编辑器生成的 temp/tsconfig.cocos.json
├── settings/v2/packages/project.json   # 设计分辨率 720×1280，宽度适配
├── assets/
│   ├── scenes/Main.scene        # 唯一场景：Canvas + Camera + GameRoot
│   ├── resources/audio/         # 音效（WAV）与 BGM（MP3），程序合成
│   └── scripts/
│       ├── config/              # GameConfig（难度/评分/每日/挑战）、PlatformConfig（占位发行配置）
│       ├── core/                # GameRoot 入口、GameManager 服务容器、SceneManager 页面管理、计时器、随机数、事件
│       ├── puzzle/              # PuzzleGenerator/Shuffle/Validator/Scoring/Manager（纯逻辑） + PuzzleBoard/PuzzlePiece（视图）
│       ├── daily/               # 每日挑战（纯逻辑）
│       ├── social/              # 挑战码编解码、挑战管理、分享文案
│       ├── collection/          # 纪录、收藏、解锁
│       ├── storage/             # 存档结构、版本迁移、读写
│       ├── platform/            # PlatformAdapter 接口 + Browser/WeChat/Douyin 实现
│       ├── audio/  ads/  analytics/  imaging/
│       ├── art/                 # 调色板、像素光栅库、12 张作品绘制程序、纹理工厂
│       ├── ui/                  # 主题、像素 UI 组件、滚动列表、特效、图标
│       └── pages/               # 首页、经典、游戏、结算、每日、收藏、设置、好友挑战
├── art-preview/                 # 作品 PNG 预览（由 tools 生成，不参与构建）
├── tools/                       # 类型检查、单元测试、美术/音频生成（不参与构建）
└── docs/                        # 测试报告、发行清单
```

### 与需求文档中建议结构的差异（有意为之）

- **单场景多页面**：需求里建议了 Main / Puzzle / Result / Collection 四个场景。小游戏上切换场景要重新加载、容易白屏，所以改为一个场景加 `SceneManager` 页面切换（淡入 + 位移过渡）。各页面在 `pages/` 下仍然一页一个文件。
- **代码化 UI，不用预制体**：Button / PuzzlePiece / ResultCard 改由 `ui/UIKit.ts` 与 `puzzle/PuzzlePiece.ts` 代码生成，风格统一、便于对比修改，也不需要维护大量 `.prefab` 的 UUID 引用。方块使用 `NodePool` 对象池复用。
- **像素图程序生成**：作品不是 PNG 资源，而是 `art/PuzzleArt.ts` 运行时绘制成 60×60 纹理，使用最近邻过滤，放大后依旧锐利。包体几乎为零，也和照片转像素功能共用同一条“像素缓冲 → 纹理”管线。

### 架构原则

- `puzzle/`、`daily/`、`social/`、`collection/`、`storage/`、`platform/`、`imaging/`、`art/PuzzleArt.ts` 都不依赖 `cc`，可以在 Node 中直接测试。
- 核心逻辑从不调用 `wx` / `tt`，所有平台能力都经过 `PlatformAdapter`。
- `PlatformFactory` 只有在“引擎平台标识”和“全局对象”同时存在时才启用对应平台，否则使用 Web 适配，缺 SDK 不会崩溃。

---

## 10. 后续扩展建议

- 像素工坊作品的好友挑战：需要服务器存放转换后的像素数据（约 5KB），挑战码里只带作品 ID。
- 服务器排行榜：实现 `social/ChallengeManager.ts` 中的 `LeaderboardService` 接口，并填写 `leaderboardEndpoint`。
- 每日挑战统一日期：接入服务器后，把 `DailyChallengeManager` 的 `today` 注入改为服务端时间。
- 更多作品：在 `ArtCatalog.ts` 增加条目，在 `PuzzleArt.ts` 增加绘制函数即可。单元测试会自动检查新作品的 ID、分类和绘制结果。
