#!/usr/bin/env bash
# Re-render everything from demo-raw, no machines. The film is MUSIC-ONLY; Piper is used only to measure
# clip lengths (the audio drives the timeline) and to make a reference voice mix.
# usage: demo/assemble.sh   (env: WORK, REPO, OUT; VOICE, LENGTH_SCALE for tts)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${WORK:-/home/cryptosaiyan/Documents/solaribuild/demo-raw}"; REPO="${REPO:-/home/cryptosaiyan/Documents/solaribuild/twin}"; OUT="${OUT:-/home/cryptosaiyan/Documents/solaribuild/demo-out}"
mkdir -p "$OUT/audio"
[ -f "$W/audio/clips.json" ] && [ "$W/audio/clips.json" -nt "$HERE/voiceover.md" ] || python3 "$HERE/tts.py" "$W" "${VOICE:-en_US-ryan-high}" "${LENGTH_SCALE:-1.22}"
cp "$HERE/player.html" "$W/player.html"
node "$HERE/build.mjs" "$W" "$REPO"
node "$HERE/render.mjs" "$W" "$W/frames" --check
python3 "$HERE/audio.py" "$W" "$W/audio-out"
python3 "$HERE/sync-check.py" "$W" "$W/audio-out" | tee "$W/sync-table.txt"; [ "${PIPESTATUS[0]}" = 0 ]
python3 "$HERE/make-clips.py" "$W"
node "$HERE/render.mjs" "$W" "$W/frames" --fps 30
# picture only (add-voice.py muxes onto this), then the music-only film
ffmpeg -loglevel error -y -framerate 30 -i "$W/frames/%05d.png" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -an -movflags +faststart "$W/video-silent.mp4"
TOTAL=$(python3 -c "import json;print(json.load(open('$W/audio/cues.json'))['total'])")
ffmpeg -loglevel error -y -i "$OUT/audio/music.wav" -af "atrim=0:$TOTAL,afade=t=in:d=3,afade=t=out:st=$(python3 -c "print($TOTAL-5)"):d=5,loudnorm=I=-18:TP=-2:LRA=9" -ar 48000 "$W/music-bed.wav" 
ffmpeg -loglevel error -y -i "$W/video-silent.mp4" -i "$W/music-bed.wav" -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -t "$TOTAL" -movflags +faststart "$OUT/twin-demo.mp4"
cp "$W/audio-out/voiceover.wav" "$W/audio-out/music.wav" "$W/audio-out/mix.wav" "$OUT/audio/"
ffmpeg -loglevel error -y -i "$W/video-silent.mp4" -an \
  -vf "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  "$OUT/twin-demo.gif"
ls -la "$OUT" "$OUT/audio"
