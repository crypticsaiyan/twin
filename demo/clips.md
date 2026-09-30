# Voiceover clips

One clip per row, in order. Generate each with the same voice and pace and name the file `<id>.mp3` (or .wav),
then run `demo/add-voice.py <folder>`. The video is timed to the earlier voice, so keep each clip inside its
window (the script warns about clips that overrun and would talk over the next one). Window = seconds from
the clip's start to the next clip or the end of its scene.

| id | start | window | text |
|---|---|---|---|
| issue | 2.68 | 6.3 s | A bug report says something fails. The maintainer replies: it works on my machine. |
| diff | 9.03 | 12.7 s | Same commit, different environment. twin records the reporter's environment in a small file, rebuilds it on a clean machine, finds the one difference that causes the failure, and checks the fix there. |
| capsule | 21.84 | 9.2 s | That small file is the capsule. Let's run the whole loop on a real bug: in date-fns, an hour goes missing when the clocks go back. |
| s1 | 31.13 | 2.2 s | Step one. Capture. |
| capture | 33.46 | 12.4 s | The reporter runs the failing test through twin capture. twin shows exactly what it recorded, scrubs any secrets, and uploads nothing. The reporter reviews it, and says yes. |
| s2 | 45.98 | 2.6 s | Step two. Replay. |
| replay | 48.62 | 11.0 s | Replay rebuilds that environment on a clean Solari machine, and the failure comes back, three times out of three. That took thirty-three seconds, sped up here. |
| s3 | 59.72 | 2.4 s | Step three. Bisect. |
| bisect | 62.16 | 9.2 s | Bisect compares it with a machine where the test passes, and applies the differences one at a time. The cause is a single thing: the time zone. |
| s4 | 71.40 | 2.7 s | Step four. Verify. |
| verify | 74.20 | 9.3 s | Verify applies a candidate fix on a fresh copy of the reporter's machine. Three runs, all pass. The bug is fixed. |
| s5 | 83.62 | 2.2 s | Step five. Share. |
| keep | 85.94 | 10.0 s | To hand the machine over, replay again but keep it running, then ask for a browser link. twin prints a link and a one-time password. |
| browser | 96.07 | 12.5 s | The reporter opens the link, signs in, and runs the failing test on the very same machine, in the same environment. |
| stop | 108.68 | 9.1 s | When you are done, twin stop releases the machine. Nothing is left running. |
| s6 | 117.82 | 2.6 s | Step six. Agents. |
| claude@0.3 | 120.73 | 20.7 s | Claude Code can run the same loop. This is a real session, not a replay. It talks to twin through M C P. |
| claude@21 | 141.43 | 16.5 s | It replays the capsule, finds the daylight saving bug, writes a fix, verifies it on a fresh machine, and releases the machine. The waits are sped up, and the real times stay on screen. |
| site@cap0 | 158.09 | 2.2 s | This is the twin website. |
| site@cap1 | 160.29 | 3.5 s | Install once with npm, then run twin. |
| site@cap2 | 163.75 | 4.3 s | There is a short video of the whole loop. |
| site@cap4 | 168.08 | 8.6 s | Every variable in a capsule is marked: value recorded, name only, or not set. |
| site@cap6 | 176.68 | 9.9 s | Bisect works in stages. Click through them to see the difference isolated. |
| site@cap8 | 186.61 | 5.4 s | For agents, every step is a timed tool call. |
| site@cap9 | 191.98 | 3.9 s | Here is what a capsule holds, and what it never records. |
| site@cap10 | 195.91 | 4.0 s | The guides cover every command. |
| summary | 200.01 | 5.9 s | So you get a failure you can reproduce, the one cause, and a fix checked where it failed. |
| close | 205.97 | 9.0 s | Install it with npm: npm install dash g, at cryptic saiyan slash twincli. The code is on GitHub, and the site is twincli dot vercel dot app. |
