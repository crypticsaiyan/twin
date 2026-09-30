# twin demo voiceover (single source)

This file drives the audio. `tts.py` reads it, synthesizes one wav per section with Piper, and `build.mjs`
lets each scene last at least as long as its narration. Headers are `## clip-id` or `## scene-id@seconds`
(the clip starts that many seconds into the scene) or `## site@capN` (aligned to the Nth website caption).
Keep sentences short and spoken. No em dashes. Numbers are written the way they are said. The file
paths and hashes are never read aloud. At the synthesis speed, this reads at roughly 125 to 135 words per
minute of screen time once the pauses between scenes are counted.

## issue
A bug report says something fails. The maintainer replies: it works on my machine.

## diff
Same commit, different environment. twin records the reporter's environment in a small file, rebuilds it on a clean machine, finds the one difference that causes the failure, and checks the fix there.

## capsule
That small file is the capsule. Let's run the whole loop on a real bug: in date-fns, an hour goes missing when the clocks go back.

## s1
Step one. Capture.

## capture
The reporter runs the failing test through twin capture. twin shows exactly what it recorded, scrubs any secrets, and uploads nothing. The reporter reviews it, and says yes.

## s2
Step two. Replay.

## replay
Replay rebuilds that environment on a clean Solari machine, and the failure comes back, three times out of three. That took thirty-three seconds, sped up here.

## s3
Step three. Bisect.

## bisect
Bisect compares it with a machine where the test passes, and applies the differences one at a time. The cause is a single thing: the time zone.

## s4
Step four. Verify.

## verify
Verify applies a candidate fix on a fresh copy of the reporter's machine. Three runs, all pass. The bug is fixed.

## s5
Step five. Share.

## keep
To hand the machine over, replay again but keep it running, then ask for a browser link. twin prints a link and a one-time password.

## browser
The reporter opens the link, signs in, and runs the failing test on the very same machine, in the same environment.

## stop
When you are done, twin stop releases the machine. Nothing is left running.

## s6
Step six. Agents.

## claude@0.3
Claude Code can run the same loop. This is a real session, not a replay. It talks to twin through M C P.

## claude@21
It replays the capsule, finds the daylight saving bug, writes a fix, verifies it on a fresh machine, and releases the machine. The waits are sped up, and the real times stay on screen.

## site@cap0
This is the twin website.

## site@cap1
Install once with npm, then run twin.

## site@cap2
There is a short video of the whole loop.

## site@cap4
Every variable in a capsule is marked: value recorded, name only, or not set.

## site@cap6
Bisect works in stages. Click through them to see the difference isolated.

## site@cap8
For agents, every step is a timed tool call.

## site@cap9
Here is what a capsule holds, and what it never records.

## site@cap10
The guides cover every command.

## summary
So you get a failure you can reproduce, the one cause, and a fix checked where it failed.

## close
Install it with npm: npm install dash g, at cryptic saiyan slash twincli. The code is on GitHub, and the site is twincli dot vercel dot app.
