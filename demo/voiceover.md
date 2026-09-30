# twin demo voiceover

Pace: about 130 words per minute (about 2.1 words per second). Each paragraph starts at the timestamp
of its scene in `twin-demo.mp4` (total 2:15). The word count is kept under the seconds available, so you
can read at a relaxed pace. There is no audio track in the video.

If you re-time a scene, regenerate the timestamps from `<demo-raw>/data.js` (the scene `start` values,
written by `build.mjs`) and keep the paragraph text.

## 0:00 Title (3.0 s, 6 words)

Meet twin. Cannot reproduce, made verifiable.

## 0:03 The problem (5.6 s, 13 words)

date-fns issue 2068. It passes for the maintainer, and fails in New York.

## 0:09 Reporter (11.5 s, 22 words)

The reporter runs twin capture around the failing test. twin shows exactly what it recorded, scrubs
secrets, and uploads nothing.

## 0:20.7 Maintainer (23.3 s, 46 words)

The maintainer replays the capsule on a clean Solari sandbox, and the failure comes back. Bisect finds
the one difference that matters: the time zone. Verify checks a fix in the reporter's environment, and
it passes. Waits are sped up on screen; the real times stay visible.

## 0:44.2 Browser terminal, part 1: keep the machine (10.2 s, 21 words)

Keep the machine at the failure, then run twin shell with dash dash web. You get a link and a password
to share.

## 0:54.6 Browser terminal, part 2: the link (11.2 s, 22 words)

The reporter opens the link, signs in, and runs the failing test on the same machine, live, in their own
environment.

## 1:06 Browser terminal, part 3: clean up (9.4 s, 15 words)

When you are done, twin stop releases the machine. Nothing keeps running.

## 1:15.6 Agents (9.3 s, 19 words)

Coding agents get the same machine over MCP. This is a recorded Claude Code session, not a live one.

## 1:25.1 Website walkthrough (44.2 s)

Timestamps are inside this scene, with the absolute time in brackets. The site's own example is
apache/echarts issue 21538, so do not call it the date-fns bug here.

- 0:00 [1:25.1] The site opens on the install command. (7 words, 2.6 s: trim to "Here is the site.")
- 0:02.6 [1:27.7] Copy it in one click and run it with npx. (11 words, 3.5 s: trim to "Copy, then run with npx.")
- 0:06.1 [1:31.2] Ten commands, one file between them. (7 words)
- 0:08.5 [1:33.6] The capsule marks every variable: value recorded, name only, or not set. (14 words)
- 0:15.4 [1:40.5] Replay rebuilds the environment on Solari. (6 words)
- 0:17.9 [1:43.0] Bisect works in stages: compare, trial one, trial two, result. Click through them. (14 words)
- 0:26.5 [1:51.6] Verify checks the fix. (4 words)
- 0:28.7 [1:53.8] Agents call the same steps over MCP, each timed on the timeline. (12 words)
- 0:34.4 [1:59.5] Then what a capsule holds, where twin fits, and its limits. (11 words)
- 0:40.4 [2:05.5] Guides and a CLI reference cover every command. (8 words)

## 2:09.5 Close (5.6 s, 11 words)

npm install dash g at crypticsaiyan slash twincli. No machines left running.

Optional, if you have the time: date-fns 2068 is still open upstream; this demo shows the workflow,
not a merged fix.
