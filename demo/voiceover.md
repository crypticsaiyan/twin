# twin demo voiceover

Pace: about 130 words per minute (about 2.2 words per second). Each paragraph starts at the timestamp of
its scene in `twin-demo.mp4` (total 3:13.7). Word counts stay at or under the seconds available times 2.2,
so you can read at a relaxed pace. The video has no audio track and the on-screen captions already say
the same things in short lines, so you can paraphrase.

If a scene is re-timed, regenerate the timestamps from `<demo-raw>/data.js` (the scene `start` values
written by `build.mjs`; `build.mjs` also prints them) and keep the text.

## 0:00 What twin does (22.6 s, 49 words)

A bug report says: works on my machine. The maintainer cannot reproduce it. twin records the reporter's
environment in a small file, rebuilds it on a clean Solari sandbox, and gives you four answers:
reproduced, the cause, a verified fix, and a machine an agent can use.

## 0:22.8 Step 1, Capture: title (1.8 s, 3 words)

Step one: capture.

## 0:24.8 Capture (12.5 s, 27 words)

The reporter runs the failing test through twin capture. twin shows exactly what it recorded, scrubs
secrets, and uploads nothing. The reporter reviews it and says yes.

## 0:37.5 Step 2, Replay: title (1.8 s, 3 words)

Step two: replay.

## 0:39.5 Replay (6.8 s, 14 words)

Replay rebuilds the machine, and the failure comes back three times out of three.

## 0:46.5 Step 3, Bisect: title (1.8 s, 3 words)

Step three: bisect.

## 0:48.5 Bisect (7.7 s, 15 words)

Bisect compares it with a passing run. The cause is one thing: the time zone.

## 0:56.4 Step 4, Verify: title (1.8 s, 3 words)

Step four: verify.

## 0:58.4 Verify (8.4 s, 16 words)

Verify applies the fix on a fresh copy of the reporter's machine. Three runs, all pass. The waits are sped
up, and the real times stay on screen.

## 1:07.0 Step 5, Share: title (1.8 s, 3 words)

Step five: share.

## 1:09.0 Keep the machine (10.1 s, 21 words)

To share the machine, replay with keep, then run twin shell with dash dash web. You get a link and a
password.

## 1:19.3 The browser (12.6 s, 22 words)

The reporter opens the link, signs in, and runs the failing test on the very same machine, in the same
environment.

## 1:32.1 Stop (9.1 s, 14 words)

Then twin stop releases the machine. Nothing is left running, and nothing keeps billing.

## 1:41.4 Step 6, Agents: title (1.8 s, 3 words)

Step six: agents.

## 1:43.4 Claude Code (37.5 s, 55 words)

Claude Code can do the same loop. This is a real session, not a replay. It calls twin through MCP: it
replays the capsule, finds the daylight saving bug, writes a fix, verifies it on a fresh machine, and
releases the machine. The waits are sped up, and the real times stay on screen.

## 2:21.1 The website (39.9 s)

Timestamps are inside this scene, with the absolute time in brackets. The site's own example is
apache/echarts issue 21538, so do not call it the date-fns bug here.

- 0:00 [2:21.1] Everything is documented on the site. (6 words)
- 0:02 [2:23.3] The install command is one line. Copy it and run it with npx. (13 words)
- 0:05.7 [2:26.8] Ten commands, one file between them. (7 words)
- 0:07.7 [2:28.8] The capsule marks every variable: value recorded, name only, or not set. (14 words)
- 0:14.2 [2:35.3] Replay rebuilds it on Solari. (5 words)
- 0:16.3 [2:37.4] Bisect works in stages. Click through them to see the difference isolated. (13 words)
- 0:24.3 [2:45.4] Verify checks the fix. (4 words)
- 0:26.2 [2:47.3] For agents, every step is a timed tool call. (9 words)
- 0:31.6 [2:52.7] Then what a capsule holds, and where twin fits. (9 words)
- 0:36.7 [2:57.8] Guides and a CLI reference cover every command. (8 words)

## 3:01.3 Summary (6.2 s, 13 words)

A failure you can reproduce, the one cause, and a fix checked where it failed.

## 3:07.7 Close (6.0 s, 13 words)

npm install dash g at crypticsaiyan slash twincli. The site is twincli dot vercel dot app. No machines left
running.
