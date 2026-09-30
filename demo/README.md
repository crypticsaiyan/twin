# Re-recording the demo

The video is built from real runs of the packed `twin` tarball against Solari. Nothing is published.

Needs: node, python3, ffmpeg, google-chrome-stable, ttyd not required, the JetBrains Mono system font, an
xterm.js build (`xterm.js` and `xterm.css`) and the Doto 900 woff2 in `<work>/vendor/`, a screenshot of the
issue at `<work>/assets/issue.png`, and the date-fns clone at commit 717ce0a with the regression test as an
uncommitted change and `pkgs/core/src/eachHourOfInterval/index.ts` unfixed.

1. Pack and install twin into a temp prefix (no publish):
   `npm pack --pack-destination <work>/pack` then
   `npm install -g --prefix <work>/prefix <work>/pack/crypticsaiyan-twincli-0.1.0.tgz`.
2. Put `<work>/keyenv.sh` in place: one line that exports `SOLARI_API_KEY` from the twin `.env`. It is sourced
   in a hidden setup step and never printed.
3. Copy `new-york`/`kolkata` inputs: the maintainer folder is `<work>/work/date-fns-2068/` and holds `fix.patch`
   (from `examples/date-fns-2068`); `record-all.sh` copies the fresh capsules there.
4. Record (5 live machine commands: replay, bisect, verify, replay --keep, shell --web; it always ends with
   `twin stop` and `twin list`):
   `DEMO_WORK=<work> CLONE=<clone> demo/record-all.sh -take1`
5. Render and encode:
   `DEMO_WORK=<work> REPO=<twin repo> OUT=<out> demo/assemble.sh -take1`
6. Website walkthrough (real site, no machines): build and serve the site (`pnpm build`, `pnpm preview --host 127.0.0.1 --port 4321`),
   then `node demo/site-record.mjs <work>/site`. Run it before `assemble.sh`; `build.mjs` adds the scene when
   `<work>/site/site.json` exists.
7. Contact sheet: `DEMO_WORK=<work> OUT=<out> demo/contact-sheet.sh 1.5,4,15,30,47,58,70,84,94,104,114,125,136,141,143`

Also see `voiceover.md` (timed narration script) and `cdp.mjs` (small CDP helper).

Files: `rec.py` drives a real bash in a pty and logs timestamped output; `browser.mjs` drives headless Chrome over
CDP against the `twin shell --web` link; `scene5.sh` chains them; `specs.py` writes the run specs;
`build.mjs` maps raw times to the video clock; `player.html` and `render.mjs` render frames with Chrome.
Before publishing, grep the raw logs and frames' sources for the API key.
