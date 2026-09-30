#!/usr/bin/env python3
"""Writes demo/cues.json and demo/clips.md (what add-voice.py and a voiceover tool need) from the built timeline.
usage: make-clips.py <work>"""
import json, os, sys
W = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
cues = json.load(open(f"{W}/audio/cues.json"))
clips = json.load(open(f"{W}/audio/clips.json"))
json.dump(cues, open(f"{here}/cues.json", "w"), indent=1)
rows = []
c = cues["cues"]
for i, q in enumerate(c):
    nxt = c[i + 1]["start"] if i + 1 < len(c) else cues["total"]
    window = min(q["sceneEnd"], nxt) - q["start"]
    rows.append(f"| {q['id']} | {q['start']:.2f} | {window:.1f} s | {clips[q['id']]['text']} |")
head = """# Voiceover clips

One clip per row, in order. Generate each with the same voice and pace and name the file `<id>.mp3` (or .wav),
then run `demo/add-voice.py <folder>`. The video is timed to the earlier voice, so keep each clip inside its
window (the script warns about clips that overrun and would talk over the next one). Window = seconds from
the clip's start to the next clip or the end of its scene.

| id | start | window | text |
|---|---|---|---|
"""
open(f"{here}/clips.md", "w").write(head + "\n".join(rows) + "\n")
print(len(rows), "clips written to cues.json and clips.md")
