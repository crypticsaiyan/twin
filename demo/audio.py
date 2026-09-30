#!/usr/bin/env python3
"""Builds the audio: voiceover.wav (Piper clips placed on the timeline), an ORIGINAL generated music bed
(numpy/scipy), and the ducked, loudness-normalized mix.
usage: audio.py <work> <out-audio-dir>"""
import json, subprocess, sys, wave
import numpy as np
from scipy import signal

W, OUT = sys.argv[1], sys.argv[2]
SR = 48000
cues = json.load(open(f"{W}/audio/cues.json"))
total = cues["total"]
N = int((total + 1.0) * SR)

def read_wav(path):
    with wave.open(path) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        return signal.resample_poly(x, SR, w.getframerate())

# ---- voiceover: every clip at its cue, equal loudness, tiny fades ----
voice = np.zeros(N)
for c in cues["cues"]:
    x = read_wav(f"{W}/audio/clips/{c['id']}.wav")
    rms = np.sqrt(np.mean(x ** 2)); x = x * (10 ** (-20 / 20) / max(rms, 1e-6))
    x = np.tanh(x * 0.9) / 0.9 if np.abs(x).max() > 0.95 else x
    f = int(0.012 * SR); x[:f] *= np.linspace(0, 1, f); x[-f:] *= np.linspace(1, 0, f)
    i = int(c["start"] * SR); voice[i:i + len(x)] += x[: N - i]

# ---- music: A minor, Am F C G, soft evolving pad + sub + sparse pluck arpeggio, reverb ----
import os
MUSIC_WAV = f"{OUT}/music.wav"
if not os.path.exists(MUSIC_WAV) or 'regen' in sys.argv:
    rng = np.random.default_rng(7)
    LEN = 250.0
    n = int(LEN * SR); t = np.arange(n) / SR
    bpm = 68.0; beat = 60 / bpm; bar = 4 * beat; chord_len = 4 * bar
    hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)
    chords = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [48, 52, 55]), (55, [55, 59, 62])]  # root, triad (Am F C G)
    pad = np.zeros((2, n)); sub = np.zeros(n); pl = np.zeros((2, n))
    def env_seg(t0, t1, att=2.5, rel=3.5):
        e = np.zeros(n); i0, i1 = int(max(t0, 0) * SR), int(min(t1 + rel, LEN) * SR)
        tt = (np.arange(i0, i1) / SR)
        a = np.clip((tt - t0) / att, 0, 1); r = np.clip(1 - (tt - t1) / rel, 0, 1)
        e[i0:i1] = np.minimum(a, r) ** 1.5
        return e
    k = 0; tc = 0.0
    while tc < LEN:
        root, tri = chords[k % 4]
        e = env_seg(tc, tc + chord_len)
        lfo = 0.5 + 0.5 * np.sin(2 * np.pi * (0.06 + 0.01 * (k % 3)) * t + k)      # slow "filter" sweep
        for ch in range(2):
            for m in tri + [tri[0] + 12]:
                for det in (-0.004, 0.0, 0.004):
                    f0 = hz(m) * (1 + det * (1 if ch == 0 else -0.7))
                    ph = rng.uniform(0, 2 * np.pi)
                    s = np.sin(2 * np.pi * f0 * t + ph)
                    s += (0.35 * np.sin(2 * np.pi * 2 * f0 * t + ph) * (0.3 + 0.7 * lfo)) + (0.12 * np.sin(2 * np.pi * 3 * f0 * t + ph) * lfo)
                    pad[ch] += 0.035 * e * s * (0.8 + 0.2 * np.sin(2 * np.pi * 0.05 * t + m))
        sub += 0.16 * e * np.sin(2 * np.pi * hz(root - 12) * t)
        # sparse plucked arpeggio (from the second cycle), eighth notes
        if tc >= 28:
            notes = [tri[0] + 12, tri[2] + 12, tri[1] + 24, tri[2] + 12, tri[0] + 24, tri[1] + 12, tri[2] + 24, tri[1] + 12]
            for b in range(int(chord_len / (beat / 2))):
                if rng.random() < 0.42: continue
                ts = tc + b * beat / 2; i = int(ts * SR)
                if i >= n - SR: break
                m = notes[b % len(notes)]; L = int(1.4 * SR)
                tt = np.arange(L) / SR; f0 = hz(m)
                s = (np.sin(2 * np.pi * f0 * tt) + 0.4 * np.sin(2 * np.pi * 2 * f0 * tt) * np.exp(-tt * 6)) * np.exp(-tt * 3.2)
                g = 0.05 * (0.6 + 0.4 * rng.random()); pan = 0.5 + 0.35 * np.sin(b + k)
                pl[0, i:i + L] += g * (1 - pan) * s[: n - i]; pl[1, i:i + L] += g * pan * s[: n - i]
        tc += chord_len; k += 1
    dry = pad + pl + sub
    ir_len = int(2.8 * SR); ti = np.arange(ir_len) / SR
    ir = np.stack([rng.standard_normal(ir_len) * np.exp(-ti * 1.9) for _ in range(2)]) * 0.05
    wet = np.stack([signal.fftconvolve(dry[c], ir[c])[:n] for c in range(2)])
    music = dry + 0.55 * wet
    music = signal.sosfilt(signal.butter(2, 90, "hp", fs=SR, output="sos"), music, axis=1)
    music *= 0.7 / np.abs(music).max()
    fi, fo = int(4 * SR), int(8 * SR)
    music[:, :fi] *= np.linspace(0, 1, fi) ** 2; music[:, -fo:] *= np.linspace(1, 0, fo) ** 2


    HAVE = False
else:
    HAVE = True

def write(path, x):
    x = np.clip(x, -1, 1); y = (x.T * 32767).astype(np.int16) if x.ndim == 2 else (x * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2 if x.ndim == 2 else 1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
import os; os.makedirs(OUT, exist_ok=True)
vst = np.stack([voice, voice]) * 0.9
write(f"{OUT}/voiceover.wav", vst)
if not HAVE: write(f"{OUT}/music.wav", music)

def lufs(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "loudnorm=I=-16:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    import re; return float(json.loads(re.findall(r"\{[^{}]*\}", r)[-1])["input_i"])
lv, lm = lufs(f"{OUT}/voiceover.wav"), lufs(f"{OUT}/music.wav")
gain = (lv - 20) - lm               # music bed 20 dB under the voice in the gaps; ducking takes it to about 28 dB under speech
fade_start = max(total - 5.0, 0)
fc = (f"[1:a]volume={gain:.2f}dB,atrim=0:{total + 0.5:.2f},afade=t=out:st={fade_start:.2f}:d=5[m];"
      f"[0:a]asplit=2[k][v];[m][k]sidechaincompress=threshold=0.02:ratio=9:attack=20:release=450:makeup=1[d];"
      f"[d][v]amix=inputs=2:duration=first:normalize=0[mx];[mx]loudnorm=I=-16:TP=-1.5:LRA=11[out]")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f"{OUT}/voiceover.wav", "-i", f"{OUT}/music.wav", "-filter_complex", fc, "-map", "[out]", "-ar", str(SR), "-ac", "2", f"{OUT}/mix.wav"], check=True)
print("voice LUFS", round(lv, 1), "music LUFS (raw)", round(lm, 1), "music gain", round(gain, 1), "dB; mix LUFS", round(lufs(f"{OUT}/mix.wav"), 1))
