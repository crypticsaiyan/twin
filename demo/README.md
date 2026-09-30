# Re-recording and re-rendering the demo

Everything the video is built from lives in ONE durable folder, `WORK`, outside the twin repo and outside
any scratchpad:

    /home/cryptosaiyan/Documents/solaribuild/demo-raw/    (not in git, never committed)

Every script defaults to it (`WORK` env var overrides). A re-render (new timing, captions, chips, layout)
only needs `assemble.sh`; it never needs a new live run.

## What is in `demo-raw/`

| Path | What |
|---|---|
| `raw/*-v3.jsonl` | timestamped terminal logs of the live runs (reporter, kolkata capture, maintainer, keep, close, final) |
| `raw/browser-v3/` | headless Chrome screencast frames of the `twin shell --web` link, `frames.json` with real event times |
| `site/` | 30 fps frames of the real website walkthrough (`site.json` has captions, zooms, clicks) |
| `pack/`, `prefix/` | the packed `@crypticsaiyan/twincli` tarball and its temp install (puts `twin` on PATH) |
| `date-fns/` | clone at 717ce0a with the regression test as an uncommitted change (`test.patch`) |
| `work/date-fns-2068/` | the maintainer's folder: `new-york.json`, `kolkata.json`, `fix.patch` |
| `vendor/` | xterm.js, xterm.css, Doto 900 woff2 |
| `assets/` | the GitHub issue screenshot (`issue-raw.png`, cropped `issue.png`) |
| `keyenv.sh` | one line that exports `SOLARI_API_KEY` from the twin `.env`. It contains no key. |
| `*.json` | rec.py run specs written by `specs.py`; `data.js` is the built timeline |

## Re-render (no machines)

    demo/assemble.sh -v3                 # build.mjs -> render.mjs -> mp4 + gif in demo-out/
    demo/contact-sheet.sh 1.5,4,15,...   # 15 timestamps in seconds

`build.mjs` maps raw times to the video clock (speed chips, holds, scene lengths) and writes `data.js`;
`player.html` is drawn frame by frame by headless Chrome (`render.mjs`).

## Re-record (uses machines, at most 5 commands)

1. Pack and install the current package into the temp prefix, no publish:
   `npm pack --pack-destination $WORK/pack` then
   `npm install -g --prefix $WORK/prefix $WORK/pack/crypticsaiyan-twincli-<version>.tgz`.
   The published package works too: `npx @crypticsaiyan/twincli --version`. The terminals use the `twin` command.
2. Make sure `$WORK/date-fns` is at 717ce0a with only the regression test changed (`git apply test.patch`).
3. `demo/record-all.sh -v3` records the reporter, kolkata capture, `replay`, `bisect`, `verify`,
   `replay --keep`, `shell --web` (browser scene) and `twin list`/`twin stop`. It always ends with
   `twin stop` and `twin list`. Machine-creating commands: replay, bisect, verify, replay --keep,
   shell --web.
4. Website scene, no machines: `cd site && pnpm build && pnpm preview --host 127.0.0.1 --port 4321`, then
   `node demo/site-record.mjs $WORK/site` (default base `http://127.0.0.1:4321`). Stop the preview server
   by PID afterwards.
5. `demo/assemble.sh -v3`.

## Files

`rec.py` drives a real bash in a pty and logs timestamped output; `browser.mjs` drives headless Chrome over
CDP against the `twin shell --web` link; `scene5.sh` chains them; `specs.py` writes the run specs;
`site-record.mjs` records the site; `cdp.mjs` is a small CDP helper; `voiceover.md` is the timed narration.
`site-record-vt.old` is an abandoned virtual-time recorder, safe to delete.

Before publishing anything, grep `demo-raw` (logs, specs, `data.js`) and the generated frames' sources for
the Solari key. The key is never printed or recorded by these scripts.
