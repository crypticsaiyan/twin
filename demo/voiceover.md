# twin demo voiceover

Pace: about 130 words per minute (about 2.1 words per second). Each paragraph starts at the timestamp
of its scene in `twin-demo.mp4` (total 2:24). Word counts stay under the seconds available, so you can
read at a relaxed pace. There is no audio track in the video.

If you re-record or re-time a scene, regenerate the timestamps from `<work>/data.js` (scene `start`
values) and keep the paragraph text.

## 0:00 Title (3.0 s)

Meet twin. Cannot reproduce, made verifiable.

## 0:03 The problem (5.6 s)

date-fns issue 2068. It passes for the maintainer, and fails in New York.

## 0:09 Reporter (11.4 s)

The reporter runs twin capture around the failing test. twin shows exactly what it recorded, scrubs
secrets, and uploads nothing.

## 0:20.6 Maintainer (23.3 s)

The maintainer replays the capsule on a clean Solari sandbox, and the failure comes back. Bisect finds
the one difference that matters: the time zone. Verify checks a fix in the reporter's environment, and
it passes. Waits are sped up on screen; the real times stay visible.

## 0:44 Browser terminal, part 1: keep the machine (11.6 s)

Keep the machine at the failure, then run twin shell with dash dash web. You get a link and a password
to share.

## 0:56 Browser terminal, part 2: the link (11.5 s)

The reporter opens the link, signs in, and runs the failing test on the same machine, live, in their
own environment.

## 1:08 Browser terminal, part 3: clean up (11.8 s)

When you are done, twin stop releases the machine. Nothing keeps running.

## 1:20 Agents (9.3 s)

Coding agents get the same machine over MCP. This is a recorded Claude Code session, not a live one.

## 1:29 Website walkthrough (49.3 s)

Timestamps below are inside this scene, with the absolute time in brackets.

- 0:00 [1:29] The site opens with the install command. (6 words)
- 0:03 [1:32] Copy it in one click, and you are ready to run. (8 words)
- 0:07 [1:36] Ten commands, and one file between them. (7 words)
- 0:10 [1:39] The capsule marks every variable: value recorded, name only, or not set, so the reporter
  keeps control of what leaves their machine. (about 20 words; slow down or trim to "so nothing leaks")
- 0:17 [1:46] Replay rebuilds the environment on Solari. (6 words)
- 0:20 [1:49] Bisect moves in stages: compare, trial one, trial two, and the result. Click through
  them to see the one difference isolated. (19 words)
- 0:29 [1:58] Verify checks the fix. (4 words)
- 0:32 [2:01] For agents, every step is a tool call, with its own time on the timeline. (16 words)
- 0:38 [2:07] Below that: what a capsule holds, where twin fits, and its limits. (13 words)
- 0:45 [2:14] Guides and a full CLI reference cover every command. (9 words)

The site's own example is apache/echarts issue 21538, so do not call it the date-fns bug here.

## 2:19 Close (5.6 s)

Install it with npm. No machines left running.

Optional line for the on-screen note, if you have the time: date-fns 2068 is still open upstream;
this demo shows the workflow, not a merged fix.
