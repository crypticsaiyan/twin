# twin demo storyboard (about 2:24, 1920x1080, 30 fps, no audio)

| # | Scene | Start | Length | Source | Caption |
|---|---|---|---|---|---|
| 1 | Title: Doto wordmark, red block cursor, tagline | 0:00 | 3.0 s | drawn | Turns "cannot reproduce" into a verified fix. |
| 2 | The problem: title and first paragraph of date-fns#2068 (real title "startOfHour / endOfHour issues with DST") | 0:03 | 5.6 s | headless Chrome screenshot | Passes for the maintainer. Fails in New York. |
| 3 | Reporter: `twin capture` review screen, answer y | 0:09 | 11.4 s | LIVE (local pty) | Nothing is uploaded. Secrets scrubbed. You review it. |
| 4 | Maintainer: replay, bisect, verify | 0:20.6 | 23.3 s | LIVE on Solari; progress phases sped up, tagged | Rebuild the reporter's machine. Find the difference. Verify the fix. |
| 5 | Browser terminal (three parts under one title): `replay --keep` and `shell --web`; real headless Chrome on the link; `twin list`, `twin stop` | 0:44 | 35 s | LIVE; Chrome driven over CDP; the sign-in card is drawn (a native basic-auth dialog cannot be screenshotted) | Share a link. The reporter joins the same machine. |
| 6 | Agents: examples/echarts-21538/mcp.txt replayed as animation | 1:20 | 9.3 s | RECORDED session, waits shortened (tagged) | recorded Claude Code session over MCP |
| 7 | Website walkthrough of the real site (local build): hero, install and Copy click, synopsis, capsule privacy rows, replay, bisect stage tabs, verify, agents timeline, files, limits, footer, then the replay guide | 1:29 | 49.3 s | real site frames from `site-record.mjs`, 1x | one caption per beat, changes with the beat |
| 8 | Close: logo, install line, repo, `twin list` empty, note that date-fns#2068 is still open upstream and PR #4140 covers the same function | 2:19 | 5.6 s | LIVE `twin list` | no machines left running |

Placement of scene 7: after the agents scene and before the close. The story goes from "how it works" to
"where to find it", so the site tour leads into the install line. The site's own example is
apache/echarts#21538, not the date-fns bug, and its captions say so only in the voiceover.

Zooms in scene 7 (smooth 0.45 s ease in, hold, ease out, with a click ring): install command and Copy
(the button reads "Copied"), the capsule environment tab (value recorded, name only, not set), the bisect
stage tabs 1 to 4, and the agent timeline.

Honesty rules: every terminal line is real output; only the playback clock is mapped. Any stretch that is not
1x carries a visible speed chip and a "real N s" counter, and the real wall time of each command stays in the
window header (for example "replay 33 s"). A sped-up stretch shows the speed chip and the real total
of that stretch (for example "11.7x, real 33 s"), not a running counter.
