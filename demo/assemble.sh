#!/usr/bin/env bash
# Builds the timeline from the raw recordings, renders every frame and encodes the outputs.
# usage: WORK=<demo-raw> REPO=<twin repo> OUT=<out dir> demo/assemble.sh [suffix]
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${WORK:-/home/cryptosaiyan/Documents/solaribuild/demo-raw}"; REPO="${REPO:-/home/cryptosaiyan/Documents/solaribuild/twin}"; OUT="${OUT:-/home/cryptosaiyan/Documents/solaribuild/demo-out}"; SUF="${1:-}"
mkdir -p "$OUT"
cp "$HERE/player.html" "$W/player.html"
node "$HERE/build.mjs" "$W" "$SUF" "$REPO"
node "$HERE/render.mjs" "$W" "$W/frames" --fps 30
ffmpeg -loglevel error -y -framerate 30 -i "$W/frames/%05d.png" -c:v libx264 -preset slow -crf 17 \
  -pix_fmt yuv420p -movflags +faststart "$OUT/twin-demo.mp4"
# small GIF for the README: 800 px wide, 8 fps, one shared palette
ffmpeg -loglevel error -y -i "$OUT/twin-demo.mp4" \
  -vf "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  "$OUT/twin-demo.gif"
ls -la "$OUT"
