# 背景音乐

共 41 首，全部放在独立的 Asset Bundle（音乐分包）里，不占 4MB 主包。

## 菜单歌单（`assets/music/`，约 2.7MB）

| 文件 | 曲名 | 风格 | 时长 | 来源 |
|---|---|---|---:|---|
| `pixel_afternoon.mp3` | 午后像素 | lofi，80 BPM，F 大调 | 48s 循环 | `tools/gen-music.py` |
| `pink_haze.mp3` | Pink Haze | 实录，A 大调，约 86 BPM | 2:42 | 项目作者录音（见“录音处理”） |
| `sweet_party.mp3` | 甜品派对 | 8-bit，112 BPM，C 大调 | 34s 循环 | `tools/gen-music.py` |
| `starry_cabin.mp3` | 星空小屋 | 八音盒，3/4 拍，G 大调 | 42s 循环 | `tools/gen-music.py` |
| `puzzle_time.mp3` | 拼图时光 | 安静 lofi，72 BPM，C 大调 | 53s 循环 | `tools/gen-music.py` |

菜单类页面按上表顺序**轮播**：短曲循环播放到约 2:40（`PLAYLIST_SLOT_SECONDS = 160`），然后用 1.5 秒淡出换下一首；Pink Haze 本身约 2:42，完整播一遍再换。设置页“背景音乐”旁边有 **换一首** 按钮，可以手动切到下一首。

## 作品主题曲（每张作品一首，约 2:42，`tools/gen-themes.py`）

| 分包 | 作品 | 主题曲 | 风格 |
|---|---|---|---|
| `assets/music_animals/` | 橘猫午后 | 午后打盹 | lofi，F 大调，电钢琴 + 颤音琴 |
| | 柴犬笑脸 | 元气满满 | 8-bit，G 大调 |
| | 白猫毛线球 | 毛线球圆舞曲 | 八音盒圆舞曲，3/4 拍，降 E 大调 |
| | 胡萝卜兔 | 跳跳胡萝卜 | 马林巴 + 长笛，C 大调，鸟鸣 |
| `assets/music_sweets/` | 草莓蛋糕 | 第一颗草莓 | 8-bit，D 大调 |
| | 珍珠奶茶 | 三分糖 | bossa lofi，A 大调，长笛 + 拨弦 |
| | 马卡龙塔 | 七彩圆舞曲 | 钟琴圆舞曲，3/4 拍，降 B 大调 |
| | 三球冰淇淋 | 叠叠乐 | 8-bit，E 大调 |
| `assets/music_daily/` | 温馨卧室 | 台灯下 | lofi，C 大调，雨声 |
| | 小花园 | 蝴蝶来访 | 民谣拨弦 + 长笛，G 大调，鸟鸣 |
| | 星空小屋 | 第一百颗星 | 氛围，D 大调，八音盒 + 铺底 |
| | 海边日落 | 落日口袋 | lofi，A 大调，海浪 |
| `assets/music_zodiac/` | 小鼠招财 | 数铜钱 | 宫调式 · 扬琴领奏，笛子、古筝分解和弦、木鱼碰铃 |
| | 福牛犁春 | 田埂慢歌 | 徵调式 · 箫，古筝、笙铺底，鸟鸣 |
| | 竹林小虎 | 竹林巡山 | 羽调式 · 笛子，琵琶、中阮固定音型、堂鼓 |
| | 月下玉兔 | 月饼与月亮 | 宫调式 3/4 · 古筝摇篮曲，箫 |
| | 祥云小龙 | 云上龙珠 | 商调式 · 琵琶，二胡、笙、堂鼓（也是系列页曲目） |
| | 花间小蛇 | 花间午睡 | 羽调式 · 二胡，箫、中阮切分 |
| | 马到成功 | 马蹄轻轻 | 宫调式 6/8 · 二胡马蹄节奏，扬琴、堂鼓 |
| | 云朵小羊 | 云朵牧场 | 徵调式 3/4 · 笛子，中阮“嘭嚓嚓”，鸟鸣 |
| | 捧桃小猴 | 偷桃记 | 宫调式 · 琵琶切分跳音，扬琴反拍、木鱼 |
| | 晨光小鸡 | 第一声早安 | 徵调式 · 扬琴，笛子、古筝，鸟鸣 |
| | 围巾小狗 | 红围巾 | 宫调式 · 箫，古筝、二胡、笙铺底 |
| | 元宝小猪 | 元宝滚滚 | 宫调式 · 古筝滚奏，笛子、中阮 |
| `assets/music_stars/` | 冲呀小羊（白羊） | 冲呀小羊 | 大调 · 长笛，钢弦吉他扫弦、沙锤 |
| | 慢慢品尝（金牛） | 慢慢品尝 | 大调爵士摇摆 · 颤音琴，钢琴、低音提琴行走低音、鼓刷 |
| | 镜子里的我（双子） | 镜子里的我 | 大调 · 马林巴与颤音琴一问一答，竖琴 |
| | 沙滩上的家（巨蟹） | 沙滩上的家 | 大调 6/8 船歌 · 单簧管，竖琴、大提琴，海浪 |
| | 小小国王（狮子） | 小小国王 | 大调附点节奏 · 小提琴，钢琴、弦乐、三角铁 |
| | 麦田里的诗（处女） | 麦田里的诗 | 多利亚调式 · 尼龙吉他，竖琴、长笛，鸟鸣 |
| | 平衡木（天秤） | 平衡木 | 大调 3/4 对称乐句 · 钢片琴，竖琴圆舞曲 |
| | 夜色秘密（天蝎） | 夜色秘密 | 小调 · 大提琴，钢琴分解和弦、弦乐 |
| | 一支箭（射手） | 一支箭 | 混合利底亚调式 · 钢弦吉他，尼龙吉他扫弦、小提琴 |
| | 爬山的星星（摩羯） | 爬山的星星 | 多利亚调式 · 钢琴级进上行，大提琴、鼓刷 |
| | 倒一杯星光（水瓶） | 倒一杯星光 | 利底亚调式 · 竖琴，钢片琴、弦乐铺底（也是系列页曲目） |
| | 两条小鱼（双鱼） | 两条小鱼 | 大调 3/4 · 长笛，竖琴、大提琴，海浪 |

- 结构：前奏 → A → B → A′（加三度和声）→ 桥段（抽掉鼓和旋律）→ A″ → … → 尾声，可无缝循环。
- 旋律用“动机 + 模进”算法生成（固定随机种子，可复现），强拍落在和弦音上，乐句结尾回到主音。速度做了微调，让每首都是 161.75 秒（与 Pink Haze 等长）。
- 单声道 40kbps，每首约 0.8MB，每个 4 首的系列分包约 3.2MB；响度统一为约 -16 LUFS。
- 生肖、星座两个系列由 **`tools/gen-songs.py`** 生成：主旋律是**手写简谱**（`tools/songs_zodiac.py`、`tools/songs_stars.py`），程序只负责按旋律自动配和声、编曲、合成和混音。
  - 生肖只用**中国乐器**音色（古筝、扬琴、琵琶、二胡、笛子、箫、笙、中阮、堂鼓、木鱼、碰铃），旋律都是五声音阶，宫/商/徵/羽四种调式轮换。
  - 星座只用**西洋原声乐器**音色（钢琴、竖琴、长笛、单簧管、小提琴、大提琴、吉他、钢片琴、马林巴、颤音琴、低音提琴、鼓刷、沙锤、三角铁），调式有大调、小调、多利亚、混合利底亚、利底亚。
  - 两个系列都**不用方波/锯齿波等电子音色**。`python3 tools/gen-songs.py --check` 会检查每首只用了本系列允许的乐器、每小节时值是否写满，并比较 24 首旋律两两的相似度（音程+节奏三元组的 Jaccard 指数，要求都 ≤ 0.2；目前最高 0.16）。
- 按系列拆成分包（生肖约 9.6MB）：玩到哪个系列才下载哪个。
- 小游戏上主题曲分包是**远程分包**，不计入微信 30MB 整包上限，见下方“小游戏远程音乐”。

## 哪里放哪首（`assets/scripts/audio/MusicCatalog.ts`）

| 场景 | 音乐 |
|---|---|
| 首页、经典模式选图、每日挑战页、收藏册、任务/资料/记录/设置/工坊等菜单页 | 菜单歌单轮播 |
| 拼图中（经典、每日挑战、好友挑战都一样） | 这张作品的主题曲 |
| 拼工坊照片作品 | 拼图时光 |
| 「可爱动物」/「甜品派对」/「温馨日常」/「十二生肖」/「十二星座」系列详情页 | Pink Haze / 甜品派对 / 星空小屋 / 云上龙珠 / 倒一杯星光 |
| 结算页、奖励页 | 不换曲，延续刚才的音乐 |

换曲时淡出 0.35 秒、淡入 0.6 秒；同一首正在播放时不会重新开始。分包加载失败时自动改用主包里的 `assets/resources/audio/bgm.mp3`。对应关系的测试在 `tools/tests/music.test.ts`。

## 分包配置（Bundle 配置）

| 分包 | Bundle 配置 | 微信/抖音小游戏上 |
|---|---|---|
| `assets/music`（菜单歌单，2.7MB） | `pb_music_cfg` | 本地小游戏分包：没网时菜单也有音乐 |
| `music_animals` / `music_sweets` / `music_daily` / `music_zodiac` / `music_stars`（主题曲，约 12.9MB） | `pb_music_cfg` | 本地小游戏分包：随包发布，不需要域名 |

两个配置都在 `settings/v2/packages/builder.json`（`pb_music_remote_cfg` 是备用的远程分包配置，目前没有分包使用它）。新加主题曲分包时，`.meta` 的 `bundleConfigID` 设为 `pb_music_cfg`；`tools/tests/music.test.ts` 会检查，并限制所有音乐合计不超过 16MB。网页版不受影响，所有分包都随网页一起部署。

## 主题曲缩短（现行方案）

主题曲原来每首约 2:41、40kbps，36 首合计约 28MB，加上代码超过小游戏整包预算（官方现行文档写总包 30MB、主包 4MB、普通分包不限单个大小；但有资料说 30MB 只给开通虚拟支付的游戏，其余按 20MB，所以按 20MB 保守算）。现在**音质不变（仍是 44.1kHz 单声道 40kbps），改为缩短曲长**：36 首每首约 62～87 秒（速度保持原样，乐段从原来的 20 段缩到 2～4 段），合计约 12.9MB，整包约 18MB，**全部随小游戏包发布，不需要远程域名**。曲子仍是无缝循环。

用生成器的三个环境变量重新生成：

```bash
PB_TARGET_SECONDS=72 PB_MIN_SECTIONS=2 PB_KEEP_TEMPO=1 python3 tools/gen-themes.py music-out
PB_TARGET_SECONDS=72 PB_MIN_SECTIONS=2 PB_KEEP_TEMPO=1 python3 tools/gen-songs.py music-out
```

`PB_KEEP_TEMPO=1` 让每首保持设定速度（曲长由乐段数决定），不设则会为凑目标时长而加快或放慢。不设任何变量时仍生成约 2:41 的完整版本。

## 小游戏远程音乐（备用方案，目前不用）

如果以后音乐超出预算，可以把某个分包改回远程（`.meta` 的 `bundleConfigID` 设为 `pb_music_remote_cfg`）：

- 构建配置 `tools/build-configs/wechatgame.release.json`、`bytedance-mini-game.release.json` 的资源服务器地址（`server`）是 `https://pixel-buddies.vercel.app/mini/<平台>/`，并开启 `md5Cache`（文件名带哈希，可长缓存，更新不串版本）。
- `npm run web:vercel` 会同时构建网页版和两个小游戏，把 `build/<平台>/remote/` 复制到 `dist/mini/<平台>/remote/`，和网页一起部署到 Vercel。**每次部署都会带上**，否则已发布的小游戏会找不到音乐（只想发网页版可设 `MINI_PLATFORMS=` 跳过，但不要在小游戏已上线后这么做）。
- 上传小游戏用的是同一次构建的 `build/wechatgame`、`build/bytedance-mini-game`，保证哈希和网站上的一致。

**上线前必须做（Vercel 只适合开发和体验版）：**

微信、抖音要求 downloadFile 合法域名**必须完成 ICP 备案**，`*.vercel.app` 无法备案，所以正式版不能从 Vercel 加载主题曲（会全部失败，只剩主包里的保底音乐）。提审包要这样构建：

1. 准备一个已备案的 https 域名放远程资源，推荐腾讯云 COS + 自定义域名（或微信云开发的云存储）。
2. 复制 `tools/release.env.example` 为 `tools/release.env`（不会提交），填 `WX_APPID`、`TT_APPID`、`MINI_REMOTE_BASE`（例如 `https://cdn.你的域名.cn/pixel-buddies`）。
3. `cd tools && npm run mini:release`：先做发布检查，AppID 是占位值或远程域名无法备案时会**直接拒绝构建**；通过后用临时配置构建，不改仓库里的构建配置。
4. 把 `build/<平台>/remote/` 上传到 `<MINI_REMOTE_BASE>/mini/<平台>/remote/`（脚本最后会打印完整地址），再上传小游戏包。
5. 在平台后台把这个域名加入 downloadFile 合法域名。

随时可以用 `npm run mini:check` 看当前配置还差什么。不设 `RELEASE=1` 的普通构建只提示、不拦截，开发和体验版（开发者工具勾选“不校验合法域名”）照常使用 Vercel。

## 重新生成 / 修改

```bash
pip install numpy scipy        # 另需 ffmpeg
python3 tools/gen-music.py music-out                  # 菜单歌单里的 4 首合成曲
python3 tools/gen-themes.py music-out                 # 12 首作品主题曲
python3 tools/gen-themes.py music-out shiba milk_tea  # 只生成指定作品
python3 tools/gen-songs.py --check                    # 生肖、星座：检查旋律与乐器
python3 tools/gen-songs.py music-out stars_leo        # 生肖、星座：生成指定曲目（每首约 30 秒）
```

主题曲的调性、速度、风格、和弦进行、主奏乐器、环境声都在 `gen-themes.py` 的 `THEMES` 里，改完重新生成，把文件复制到对应分包（文件名不变，`.meta` 保留不动）。

## 录音处理（Pink Haze）

原始文件：iPhone 语音备忘录 m4a，2:47，约 -38 LUFS。处理步骤：

1. 85Hz 高通，去掉低频隆隆声；
2. 用开头 2 秒和结尾 2 秒的环境声做噪声样本，`noisereduce` 平稳降噪（`prop_decrease=0.9`、`n_std_thresh_stationary=2.0`）：噪声约降 10dB，音乐本身只损失约 2dB；
3. 剪掉开头空白和结尾环境声，加 0.25 秒淡入、2.5 秒淡出；
4. 提升音量并加限幅器，整体响度对齐到约 -16 LUFS；
5. 导出单声道 64kbps mp3。

如果这段录音里演奏的是别人写的曲子，上线前需要拿到曲作者授权；只有自己创作和演奏的内容才能直接商用。

## 小游戏分包

`assets/music` 在微信/抖音构建中设为“小游戏分包”（`settings/v2/packages/builder.json` 的 `bundleConfig.custom.pb_music_cfg`，`assets/music.meta` 引用它），音乐不占 4MB 主包。构建后主包约 2.4MB，分包约 2.7MB。
