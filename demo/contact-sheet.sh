#!/usr/bin/env bash
# usage: DEMO_WORK=<scratch> OUT=<out dir> demo/contact-sheet.sh t1,t2,...  (15 timestamps, seconds)
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${DEMO_WORK:?}"; OUT="${OUT:?}"
node "$HERE/render.mjs" "$W" "$W/sheet" --at "$1" >/dev/null
ffmpeg -loglevel error -y -pattern_type glob -i "$W/sheet/t*.png" \
  -vf "scale=640:-1,tile=3x5:padding=10:color=0xfafaf8" -frames:v 1 "$OUT/twin-demo-contact-sheet.png"
