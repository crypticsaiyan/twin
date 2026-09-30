#!/usr/bin/env bash
# The dark film: the same raw recordings and music as the light film (no new live runs), the player's dark
# palette (THEME=dark) and a website scene recorded in dark mode. Needs the light build's audio first
# (demo/assemble.sh) and the dark site frames: THEME=dark node demo/site-record.mjs "$WORK/site-dark".
# usage: demo/assemble-dark.sh   (env: WORK, REPO, OUT; SITE=<frames dir> overrides the dark site frames)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${WORK:-/home/cryptosaiyan/Documents/solaribuild/demo-raw}"; REPO="${REPO:-/home/cryptosaiyan/Documents/solaribuild/twin}"; OUT="${OUT:-/home/cryptosaiyan/Documents/solaribuild/demo-out}"
D="$W/dark"
mkdir -p "$D/audio"
for name in raw work vendor assets; do ln -sfn "../$name" "$D/$name"; done
ln -sfn "${SITE:-../site-dark}" "$D/site"
ln -sf ../../audio/clips.json "$D/audio/clips.json"
cp "$HERE/player.html" "$D/player.html"
THEME=dark SITE_MATCH_JSON="$W/site/site.json" node "$HERE/build.mjs" "$D" "$REPO"
node "$HERE/render.mjs" "$D" "$D/frames" --check
node "$HERE/render.mjs" "$D" "$D/frames" --fps 30
ffmpeg -loglevel error -y -framerate 30 -i "$D/frames/%05d.png" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -an -movflags +faststart "$D/video-silent.mp4"
TOTAL=$(python3 -c "import json;print(json.load(open('$D/audio/cues.json'))['total'])")
ffmpeg -loglevel error -y -i "$D/video-silent.mp4" -i "$W/music-bed.wav" -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -t "$TOTAL" -movflags +faststart "$OUT/twin-demo-dark.mp4"
ls -la "$OUT/twin-demo-dark.mp4"
