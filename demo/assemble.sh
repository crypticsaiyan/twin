#!/usr/bin/env bash
# Re-render everything from demo-raw, no machines: narration (Piper) -> timeline -> audio -> frames -> mp4 + gif.
# usage: demo/assemble.sh   (env: WORK, REPO, OUT; VOICE, LENGTH_SCALE for tts)
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${WORK:-/home/cryptosaiyan/Documents/solaribuild/demo-raw}"; REPO="${REPO:-/home/cryptosaiyan/Documents/solaribuild/twin}"; OUT="${OUT:-/home/cryptosaiyan/Documents/solaribuild/demo-out}"
mkdir -p "$OUT/audio"
[ -f "$W/audio/clips.json" ] && [ "$W/audio/clips.json" -nt "$HERE/voiceover.md" ] || python3 "$HERE/tts.py" "$W" "${VOICE:-en_US-ryan-high}" "${LENGTH_SCALE:-1.22}"
cp "$HERE/player.html" "$W/player.html"
node "$HERE/build.mjs" "$W" "$REPO"
node "$HERE/render.mjs" "$W" "$W/frames" --check
python3 "$HERE/audio.py" "$W" "$W/audio-out"
python3 "$HERE/sync-check.py" "$W" "$W/audio-out" | tee "$W/sync-table.txt"
node "$HERE/render.mjs" "$W" "$W/frames" --fps 30
ffmpeg -loglevel error -y -framerate 30 -i "$W/frames/%05d.png" -i "$W/audio-out/mix.wav" -c:v libx264 -preset slow -crf 18 \
  -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest -movflags +faststart "$OUT/twin-demo.mp4"
cp "$W/audio-out/voiceover.wav" "$W/audio-out/music.wav" "$W/audio-out/mix.wav" "$OUT/audio/"
# small GIF for the README: 800 px wide, 8 fps, shared palette, no audio
ffmpeg -loglevel error -y -i "$OUT/twin-demo.mp4" -an \
  -vf "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  "$OUT/twin-demo.gif"
ls -la "$OUT" "$OUT/audio"
