#!/usr/bin/env python3
"""Puts a voiceover on the silent demo video.
usage: add-voice.py <clips-dir> [out.mp4]
  <clips-dir> holds one audio file per clip id in cues.json (id.wav, id.mp3, id.m4a, id.flac, id.ogg).
Clips are placed at their cue start, levelled to the same loudness, mixed over the generated music
(ducked while the voice speaks), normalized to -16 LUFS, and muxed with the video (no re-encode).
Needs ffmpeg. env: WORK (default ../../demo-raw), MUSIC (default <WORK>/../demo-out/audio/music.wav)."""
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("WORK", os.path.join(HERE, "..", "..", "demo-raw"))
MUSIC = os.environ.get("MUSIC", os.path.join(WORK, "..", "demo-out", "audio", "music.wav"))
VIDEO = os.path.join(WORK, "video-silent.mp4")
clips_dir = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(WORK, "..", "demo-out", "twin-demo-voiced.mp4")
cues = json.load(open(os.path.join(HERE, "cues.json")))
total = cues["total"]

def find(cid):
    for ext in ("wav", "mp3", "m4a", "flac", "ogg"):
        p = os.path.join(clips_dir, f"{cid}.{ext}")
        if os.path.exists(p):
            return p
def duration(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True)
    return float(r.stdout.strip())

inputs, filters, labels, missing = [], [], [], []
nxt = [c["start"] for c in cues["cues"][1:]] + [total]
for n, c in enumerate(cues["cues"]):
    p = find(c["id"])
    if not p:
        missing.append(c["id"]); continue
    d = duration(p)
    slot = min(c["sceneEnd"], nxt[n]) - c["start"]  # until its scene ends or the next clip starts
    flag = "  <-- too long, overlaps what follows" if d > slot else ""
    print(f"{c['id']:<12} start {c['start']:7.2f}  clip {d:6.2f} s  window {slot:6.2f} s{flag}")
    i = len(labels); inputs += ["-i", p]
    ms = int(c["start"] * 1000)
    filters.append(f"[{i+2}:a]loudnorm=I=-20:TP=-2:LRA=7,aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[c{i}]")
    labels.append(f"[c{i}]")
if missing:
    print("missing clips (left silent):", ", ".join(missing))
if not labels:
    sys.exit("no clips found")
fade = max(total - 5.0, 0)
fc = ";".join(filters) + ";" + "".join(labels) + f"amix=inputs={len(labels)}:normalize=0:duration=longest[v];" \
    f"[1:a]volume=-12dB,atrim=0:{total + 0.5:.2f},afade=t=out:st={fade:.2f}:d=5[m];" \
    "[v]asplit=2[k][vv];[m][k]sidechaincompress=threshold=0.02:ratio=9:attack=20:release=450[d];" \
    "[d][vv]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[out]"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", VIDEO, "-i", MUSIC, *inputs, "-filter_complex", fc,
                "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{total:.2f}", "-movflags", "+faststart", out], check=True)
print("wrote", os.path.normpath(out))
