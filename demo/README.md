# Re-recording and re-rendering the demo

Everything the video is built from lives in ONE durable folder, `WORK`, outside the twin repo and outside
any scratchpad:

    /home/cryptosaiyan/Documents/solaribuild/demo-raw/    (not in git, never committed)

Every script defaults to it (`WORK` env var overrides). A re-render (new timing, captions, chips, layout)
only needs `assemble.sh`; it never needs a new live run.

## What is in `demo-raw/`

| Path | What |
|---|---|
| `raw/*-v3.jsonl`, `raw/reporter-v4.jsonl` | timestamped terminal logs of the live runs (reporter capture from the neutral path /tmp/twin-demo, maintainer, keep, close, final) |
| `raw/claude-v4b.jsonl` | the REAL interactive Claude Code session: tmux pane snapshots with colors and cursor, recorded by `claude-rec.py` |
| `raw/browser-v3/` | headless Chrome screencast frames of the `twin shell --web` link, `frames.json` with real event times |
| `site/` | 30 fps frames of the real website walkthrough (`site.json` has captions, zooms, clicks) |
| `pack/`, `prefix/` | the packed `@crypticsaiyan/twincli` tarball and its temp install (puts `twin` on PATH) |
| `date-fns/` | clone at 717ce0a with the regression test as an uncommitted change (`test.patch`) |
| `work/date-fns-2068/` | the maintainer's folder: `new-york.json`, `kolkata.json`, `fix.patch` |
| `vendor/` | xterm.js, xterm.css, Doto 900 woff2 |
| `assets/` | the GitHub issue screenshot (`issue-raw.png`, cropped `issue.png`) |
| `keyenv.sh` | one line that exports `SOLARI_API_KEY` from the twin `.env`. It contains no key. |
| `piper-venv/`, `piper-voices/` | Piper TTS (pip in a venv, no sudo) and the voice models: `en_US-ryan-high` (used), `en_US-lessac-high`, `en_GB-alan-medium` (auditioned) |
| `audio/` | `clips/` one wav per narration section, `clips.json` (measured durations), `cues.json` (start times on the timeline) |
| `audio-out/` | voiceover.wav, music.wav, mix.wav (copied to demo-out/audio/) |
| `*.json` | rec.py run specs written by `specs.py`; `data.js` is the built timeline |

## Audio

- Narration source: `voiceover.md` (one `## clip-id` or `## scene@offset` section per clip). `tts.py` synthesizes
  each with Piper (`--length-scale 1.22`, about 160 words per minute while speaking). The audio drives the timeline:
  `build.mjs` makes every scene last at least its narration plus 0.7 s; speed chips stay honest because the extra
  time is a 1x hold.
- Voice: `en_US-ryan-high` (Piper, offline neural). I auditioned `en_US-lessac-high` and `en_GB-alan-medium` on a
  sample sentence; I cannot listen, so the choice rests on the model rating (high quality), steady pacing and
  the shortest, cleanest output. Swap with `VOICE=en_US-lessac-high demo/assemble.sh`.
- Music: an original instrumental generated in `audio.py` (numpy/scipy): A minor, Am F C G, detuned-sine pad with
  a slow harmonic sweep, sub bass, a sparse plucked arpeggio, synthetic reverb. Nothing is downloaded or licensed.
- Mix: music about 20 dB under the voice in the gaps and ducked to about 28 dB under speech, sidechain ducking (`sidechaincompress`), `loudnorm` to -16 LUFS,
  48 kHz stereo AAC 192k. Stems are in `demo-out/audio/` so you can drop in your own voice.
- `sync-check.py` measures each clip's real onset in voiceover.wav against its scene and prints the table.

## Design system and layout check

`player.html` has one `DS` object (safe margin 120 px, content column 168 to 1752, window 854 px tall, caption/result
card slot, 250 ms fade, one easing, terminal font 20 px). `render.mjs --check` samples every scene every 0.5 s and
fails on overlapping blocks, overflowing text or anything outside the safe margin.

## Music-only film, and the voice workflow

`assemble.sh` produces `demo-raw/video-silent.mp4` (picture only) and `demo-out/twin-demo.mp4` (picture plus the
generated music). Piper is used only to measure clip lengths so the audio drives the timeline, and to make the
reference `demo-out/audio/mix.wav`. `make-clips.py` regenerates `demo/cues.json` and `demo/clips.md` from the
built timeline, which is what `add-voice.py` reads. Website changes: re-record the site scene
(`site-record.mjs`, base `http://127.0.0.1:4321`); the docs page is shown zoomed on its article so the sidebar
is never in frame.

## Re-render (no machines)

    demo/assemble.sh                 # build.mjs -> render.mjs -> mp4 + gif in demo-out/
    demo/contact-sheet.sh 1.5,4,15,...   # 15 timestamps in seconds

`build.mjs` maps raw times to the video clock (speed chips, holds, scene lengths) and writes `data.js`;
`player.html` is drawn frame by frame by headless Chrome (`render.mjs`).

## Re-record (uses machines)

1. Pack and install the current package into the temp prefix, no publish:
   `npm pack --pack-destination $WORK/pack` then
   `npm install -g --prefix $WORK/prefix $WORK/pack/crypticsaiyan-twincli-<version>.tgz`.
   The published package works too: `npx @crypticsaiyan/twincli --version`. The terminals use the `twin` command.
2. Make sure `$WORK/date-fns` is at 717ce0a with only the regression test changed (`git apply test.patch`).
3. `demo/record-all.sh -v3` (machine-creating: replay, bisect, verify, replay --keep, shell --web) records the reporter, kolkata capture, `replay`, `bisect`, `verify`,
   `replay --keep`, `shell --web` (browser scene) and `twin list`/`twin stop`. It always ends with
   `twin stop` and `twin list`. Machine-creating commands: replay, bisect, verify, replay --keep,
   shell --web.
4. Website scene, no machines: `cd site && pnpm build && pnpm preview --host 127.0.0.1 --port 4321`, then
   `node demo/site-record.mjs $WORK/site` (default base `http://127.0.0.1:4321`). Stop the preview server
   by PID afterwards.
5. Real Claude Code scene: copy the capsule to `/tmp/twin-demo/new-york.json` (neutral path, no username), then
   `python3 demo/claude-rec.py $WORK $WORK/raw/claude-v4b.jsonl`. It runs `claude --model haiku` in tmux with
   `--mcp-config` (published package via npx, key only from the environment through `${SOLARI_API_KEY}`),
   `--strict-mcp-config`, `--allowedTools 'mcp__twin__*'`, types the prompt into the TUI and logs the pane.
   `CLAUDE_CODE_HIDE_ACCOUNT_INFO=1` hides account details; `build.mjs` also strips the plan name from the banner.
6. `demo/assemble.sh` (build.mjs -> render.mjs -> mp4 + gif).

## Files

`rec.py` drives a real bash in a pty and logs timestamped output; `browser.mjs` drives headless Chrome over
CDP against the `twin shell --web` link; `scene5.sh` chains them; `specs.py` writes the run specs;
`site-record.mjs` records the site; `cdp.mjs` is a small CDP helper; `voiceover.md` is the timed narration.
`site-record-vt.old` is an abandoned virtual-time recorder, safe to delete.

Before publishing anything, grep `demo-raw` (logs, specs, `data.js`) and the generated frames' sources for
the Solari key. The key is never printed or recorded by these scripts.

## Voiceover from another tool (for example ElevenLabs)

`demo-out/twin-demo.mp4` is the film with the generated music only. The Piper voice cut is kept in
`demo-backup/v5-2026-09-30-piper/`. To add a voice: generate one file per row of `demo/clips.md`
(same voice and pace), name them `<id>.mp3` or `.wav` in one folder, then run
`python3 demo/add-voice.py <folder>`. It places each clip at its start time, mixes it over the music
(ducked while the voice speaks), normalizes to -16 LUFS and muxes with `demo-raw/video-silent.mp4`
without re-encoding video. It prints any clip that is longer than its window; shorten the text or speed
that clip up, since the scene lengths were set by the earlier voice.

## Dark film

`demo/assemble-dark.sh` renders the same film in the site's dark palette. It reuses the raw recordings and the music
of the light film (no live runs, no machines); only the player palette (`THEME=dark`, tokens copied from
`site/src/styles/tokens.css`) and the website scene change. Order: run `demo/assemble.sh` once (audio, light film),
record the site in dark, then the dark build:

    THEME=dark node demo/site-record.mjs "$WORK/site-dark"     # site served on :4321, as for the light scene
    demo/assemble-dark.sh                                       # -> demo-out/twin-demo-dark.mp4

The dark build works in `$WORK/dark` (symlinks to `raw`, `work`, `vendor`, `assets`, its own `data.js`, `audio/cues.json`
and `frames`), so the light build is never overwritten. `SITE_MATCH_JSON` keeps the dark website scene exactly as long as
the light one, so the shared music fits. The real Claude Code and browser recordings are already dark; the GitHub issue
screenshot is inverted with `invert(0.9) hue-rotate(180deg)` in dark, and the drawn sign-in card uses dark tokens.
The site plays `twin-demo-dark.mp4` (720p) in dark mode and swaps cuts on a theme switch, keeping position and state.
