# Voiceover clips

One clip per row, in order. Generate each with the same voice and pace and name the file `<id>.mp3` (or .wav),
then run `demo/add-voice.py <folder>`. The video is timed to the earlier voice, so keep each clip inside its
window (the script warns about clips that overrun and would talk over the next one). Window = seconds from
the clip's start to the next clip or the end of its scene.

| id | start | window | text |
|---|---|---|---|
| issue | 2.68 | 6.5 s | A bug report says something fails. The maintainer replies: it works on my machine. |
| diff | 9.27 | 12.7 s | Same commit, different environment. twin records the reporter's environment in a small file, rebuilds it on a clean machine, finds the one difference that causes the failure, and checks the fix there. |
| capsule | 22.04 | 9.2 s | That small file is the capsule. Let's run the whole loop on a real bug: in date-fns, an hour goes missing when the clocks go back. |
| s1 | 31.30 | 2.2 s | Step one. Capture. |
| capture | 33.61 | 12.4 s | The reporter runs the failing test through twin capture. twin shows exactly what it recorded, scrubs any secrets, and uploads nothing. The reporter reviews it, and says yes. |
| s2 | 46.13 | 2.5 s | Step two. Replay. |
| replay | 48.75 | 10.5 s | Replay rebuilds that environment on a clean Solari machine, and the failure comes back, three times out of three. That took thirty-three seconds, sped up here. |
| s3 | 59.35 | 2.7 s | Step three. Bisect. |
| bisect | 62.08 | 9.4 s | Bisect compares it with a machine where the test passes, and applies the differences one at a time. The cause is a single thing: the time zone. |
| s4 | 71.52 | 2.6 s | Step four. Verify. |
| verify | 74.23 | 9.8 s | Verify applies a candidate fix on a fresh copy of the reporter's machine. Three runs, all pass. The bug is fixed. |
| s5 | 84.08 | 2.4 s | Step five. Share. |
| keep | 86.57 | 10.0 s | To hand the machine over, replay again but keep it running, then ask for a browser link. twin prints a link and a one-time password. |
| browser | 96.70 | 12.5 s | The reporter opens the link, signs in, and runs the failing test on the very same machine, in the same environment. |
| stop | 109.31 | 9.1 s | When you are done, twin stop releases the machine. Nothing is left running. |
| s6 | 118.45 | 2.8 s | Step six. Agents. |
| claude@0.3 | 121.58 | 20.7 s | Claude Code can run the same loop. This is a real session, not a replay. It talks to twin through M C P. |
| claude@21 | 142.28 | 16.5 s | It replays the capsule, finds the daylight saving bug, writes a fix, verifies it on a fresh machine, and releases the machine. The waits are sped up, and the real times stay on screen. |
| site@cap0 | 158.94 | 2.4 s | This is the twin website. |
| site@cap1 | 161.34 | 4.2 s | Install once with npm, then run twin. |
| site@cap2 | 165.49 | 4.3 s | Four commands, one file between them. |
| site@cap3 | 169.84 | 6.7 s | For agents there is an MCP server and a GitHub Action. |
| site@cap4 | 176.52 | 6.3 s | The docs keep the full case studies, with every capsule and recording. |
| site@cap5 | 182.85 | 6.3 s | Privacy and redaction say exactly what a capsule records, and what it never does. |
| site@cap6 | 189.19 | 7.6 s | One reference covers every command, and there are guides for agents and CI. |
| summary | 196.83 | 5.7 s | So you get a failure you can reproduce, the one cause, and a fix checked where it failed. |
| close | 202.65 | 9.3 s | Install it with npm: npm install dash g, at cryptic saiyan slash twincli. The code is on GitHub, and the site is twincli dot vercel dot app. |
