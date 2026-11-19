#!/usr/bin/env bash
# 用 Cocos Creator 命令行构建小游戏（需要本机安装 Cocos Creator 3.8.8）。
# 用法：bash tools/build-mini.sh wechatgame|bytedance-mini-game
# 主题曲和菜单歌单都是本地小游戏分包（pb_music_cfg），不需要远程域名；
# 只有存在远程分包（pb_music_remote_cfg）时，构建后才会有 build/<平台>/remote/，需要上传到已备案域名。
#
# 提审包：在 tools/release.env 填好 AppID（有远程分包时还要填已备案的远程资源域名，见 release.env.example），然后
#   RELEASE=1 bash tools/build-mini.sh wechatgame      （或 npm run mini:release）
# RELEASE=1 时 AppID 是占位值会直接拒绝构建；有远程分包时远程域名无法备案（如 *.vercel.app）也会拒绝。
set -u
cd "$(dirname "$0")/.."
P="$PWD"
PLATFORM="${1:?用法：build-mini.sh wechatgame|bytedance-mini-game}"
CREATOR="${COCOS_CREATOR:-/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator}"
if [ ! -x "$CREATOR" ]; then
  echo "找不到 Cocos Creator：$CREATOR（可用环境变量 COCOS_CREATOR 指定路径）" >&2
  exit 2
fi
if [ -f "$P/tools/release.env" ]; then
  set -a; . "$P/tools/release.env"; set +a
fi
CFG="${TMPDIR:-/tmp}/pixel-buddies-$PLATFORM.build.json"
STRICT=""; [ "${RELEASE:-0}" = "1" ] && STRICT="--strict"
echo "$PLATFORM 发布检查："
node "$P/tools/mini-config.mjs" "$PLATFORM" "$CFG" $STRICT || exit 1
LOG="${TMPDIR:-/tmp}/pixel-buddies-$PLATFORM-build.log"
"$CREATOR" --project "$P" --build "configPath=$CFG" > "$LOG" 2>&1
code=$?
if [ "$code" -ne 36 ]; then
  echo "$PLATFORM 构建失败（退出码 $code），日志：$LOG" >&2
  tail -20 "$LOG" >&2
  exit 1
fi
OUT="$P/build/$PLATFORM"
[ -d "$OUT" ] || OUT="$P/build/$(node -e "console.log(require('$CFG').outputName)")"
echo "构建成功：$OUT"
if [ -d "$OUT/remote" ]; then
  SERVER=$(node -e "console.log(require('$CFG').server||'')")
  echo "  远程资源：$(du -sh "$OUT/remote" | cut -f1)（不在小游戏包里），需上传到 ${SERVER}remote/"
fi
