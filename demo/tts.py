#!/usr/bin/env python3
"""Synthesizes every section of voiceover.md with Piper (offline neural TTS) into <work>/audio/clips/<id>.wav
and writes <work>/audio/clips.json with the measured durations.
usage: tts.py <work> [voice=en_US-ryan-high] [length_scale=1.22]"""
import json, re, subprocess, sys, wave, os
W = sys.argv[1]
VOICE = sys.argv[2] if len(sys.argv) > 2 else "en_US-ryan-high"
LS = sys.argv[3] if len(sys.argv) > 3 else "1.22"
here = os.path.dirname(os.path.abspath(__file__))
md = open(f"{here}/voiceover.md").read()
parts = re.split(r"^## (\S+)\s*$", md, flags=re.M)[1:]
os.makedirs(f"{W}/audio/clips", exist_ok=True)
out = {}
for cid, text in zip(parts[0::2], parts[1::2]):
    text = " ".join(text.strip().split())
    f = f"{W}/audio/clips/{cid}.wav"
    subprocess.run([f"{W}/piper-venv/bin/piper", "--model", f"{W}/piper-voices/{VOICE}.onnx", "--length-scale", LS,
                    "--sentence-silence", "0.28", "--output_file", f], input=text.encode(), check=True, capture_output=True)
    with wave.open(f) as w:
        d = w.getnframes() / w.getframerate()
    scene, _, off = cid.partition("@")
    out[cid] = {"scene": scene, "offset": off, "text": text, "dur": round(d, 3), "words": len(text.split())}
json.dump(out, open(f"{W}/audio/clips.json", "w"), indent=1)
tw = sum(c["words"] for c in out.values()); td = sum(c["dur"] for c in out.values())
print(len(out), "clips", round(td, 1), "s of speech,", tw, "words,", round(tw / td * 60), "wpm while speaking")
