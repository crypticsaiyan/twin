#!/usr/bin/env bash
# usage: WORK=<demo-raw> OUT=<out dir> demo/contact-sheet.sh t1,t2,...  (24 timestamps, seconds)
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${WORK:-/home/cryptosaiyan/Documents/solaribuild/demo-raw}"; OUT="${OUT:-/home/cryptosaiyan/Documents/solaribuild/demo-out}"
node "$HERE/render.mjs" "$W" "$W/sheet" --at "$1" >/dev/null
ffmpeg -loglevel error -y -pattern_type glob -i "$W/sheet/t*.png" \
  -vf "scale=480:-1,tile=4x6:padding=10:color=0xfafaf8" -frames:v 1 "$OUT/twin-demo-contact-sheet.png"
