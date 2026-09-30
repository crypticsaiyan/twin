# Voiceover clips

One clip per row, in order. Generate each with the same voice and pace and name the file `<id>.mp3` (or .wav),
then run `demo/add-voice.py <folder>`. The video is timed to the earlier voice, so keep each clip inside its
window (the script warns about clips that overrun and would talk over the next one). Window = seconds from
the clip's start to the next clip or the end of its scene.

| id | start | window | text |
|---|---|---|---|
| issue | 2.68 | 6.4 s | A bug report says something fails. The maintainer replies: it works on my machine. |
| diff | 9.19 | 12.4 s | Same commit, different environment. twin records the reporter's environment in a small file, rebuilds it on a clean machine, finds the one difference that causes the failure, and checks the fix there. |
| capsule | 21.67 | 8.7 s | That small file is the capsule. Let's run the whole loop on a real bug: in date-fns, an hour goes missing when the clocks go back. |
| s1 | 30.47 | 2.3 s | Step one. Capture. |
| capture | 32.83 | 12.4 s | The reporter runs the failing test through twin capture. twin shows exactly what it recorded, scrubs any secrets, and uploads nothing. The reporter reviews it, and says yes. |
| s2 | 45.36 | 2.5 s | Step two. Replay. |
| replay | 47.98 | 10.8 s | Replay rebuilds that environment on a clean Solari machine, and the failure comes back, three times out of three. That took thirty-three seconds, sped up here. |
| s3 | 58.90 | 2.6 s | Step three. Bisect. |
| bisect | 61.54 | 9.2 s | Bisect compares it with a machine where the test passes, and applies the differences one at a time. The cause is a single thing: the time zone. |
| s4 | 70.83 | 2.6 s | Step four. Verify. |
| verify | 73.50 | 9.6 s | Verify applies a candidate fix on a fresh copy of the reporter's machine. Three runs, all pass. The bug is fixed. |
| s5 | 83.14 | 2.3 s | Step five. Share. |
| keep | 85.54 | 10.0 s | To hand the machine over, replay again but keep it running, then ask for a browser link. twin prints a link and a one-time password. |
| browser | 95.66 | 12.5 s | The reporter opens the link, signs in, and runs the failing test on the very same machine, in the same environment. |
| stop | 108.28 | 9.1 s | When you are done, twin stop releases the machine. Nothing is left running. |
| s6 | 117.41 | 2.8 s | Step six. Agents. |
| claude@0.3 | 120.51 | 20.7 s | Claude Code can run the same loop. This is a real session, not a replay. It talks to twin through M C P. |
| claude@21 | 141.21 | 16.5 s | It replays the capsule, finds the daylight saving bug, writes a fix, verifies it on a fresh machine, and releases the machine. The waits are sped up, and the real times stay on screen. |
| site@cap0 | 157.87 | 7.7 s | Everything is documented on the site, and install is one line. |
| site@cap3 | 165.53 | 8.6 s | Every variable in a capsule is marked: value recorded, name only, or not set. |
| site@cap5 | 174.13 | 9.9 s | Bisect works in stages. Click through them to see the difference isolated. |
| site@cap7 | 184.06 | 5.4 s | For agents, every step is a timed tool call. |
| site@cap8 | 189.43 | 8.2 s | Then what a capsule holds, where twin fits, and guides for every command. |
| summary | 197.73 | 5.8 s | So you get a failure you can reproduce, the one cause, and a fix checked where it failed. |
| close | 203.57 | 7.2 s | Install it with npm. The site is twincli dot vercel dot app. And no machines are left running. |
