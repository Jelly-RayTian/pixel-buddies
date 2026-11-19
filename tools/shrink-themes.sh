#!/usr/bin/env bash
# 把主题曲分包里的 mp3 压成 22.05kHz 单声道 16kbps，让微信/抖音小游戏不用远程域名也能整包带上。
# 用法：bash tools/shrink-themes.sh   （会原地覆盖 assets/music_*/theme_*.mp3；原文件请用 git 找回）
# 已经压过的文件（采样率 22050）会跳过，所以可以重复运行。
set -euo pipefail
cd "$(dirname "$0")/.."
for f in assets/music_*/*.mp3; do
  rate=$( (ffmpeg -hide_banner -i "$f" 2>&1 || true) | grep -o "[0-9]* Hz" | head -1 | cut -d" " -f1)
  [ "$rate" = "22050" ] && continue
  tmp="$f.tmp.mp3"
  ffmpeg -y -loglevel error -i "$f" -ac 1 -ar 22050 -c:a libmp3lame -b:a 16k "$tmp"
  mv "$tmp" "$f"
done
du -sh assets/music_*/
