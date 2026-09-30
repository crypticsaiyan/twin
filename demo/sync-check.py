#!/usr/bin/env python3
"""Sync check: measures where each narration clip really starts in voiceover.wav and compares it with the
scene it belongs to. Fails if a clip starts more than 100 ms after its planned time, or ends after its scene.
usage: sync-check.py <work> <audio dir>"""
import json, sys, wave
import numpy as np
W, A = sys.argv[1], sys.argv[2]
cues = json.load(open(f"{W}/audio/cues.json"))["cues"]
with wave.open(f"{A}/voiceover.wav") as w:
    sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, w.getnchannels())[:, 0] / 32768
bad = 0
print(f"{'clip':12s} {'scene start':>11s} {'planned':>8s} {'onset':>8s} {'delta ms':>8s} {'clip end':>8s} {'scene end':>9s}  ok")
for c in cues:
    lo = int(max(c["start"] - 0.3, 0) * sr); hi = int((c["start"] + 1.0) * sr)
    seg = np.abs(x[lo:hi]); idx = np.argmax(seg > 0.02)
    onset = (lo + idx) / sr
    planned = c["start"]
    d = (onset - planned) * 1000
    end = c["start"] + c["dur"]
    ok = abs(d) <= 100 and end <= c["sceneEnd"] + 1e-6 and c["start"] >= c["sceneStart"] - 1e-6
    bad += not ok
    print(f"{c['id']:12s} {c['sceneStart']:11.2f} {planned:8.2f} {onset:8.2f} {d:8.0f} {end:8.2f} {c['sceneEnd']:9.2f}  {'ok' if ok else 'FAIL'}")
print("all clips in sync" if not bad else f"{bad} clip(s) out of sync")
sys.exit(1 if bad else 0)
