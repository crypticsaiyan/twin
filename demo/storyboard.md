# twin demo storyboard (3:35, 1920x1080, 30 fps, music only; voice can be added with add-voice.py)

| # | Scene | Start | Length | Source | Purpose |
|---|---|---|---|---|---|
| 1 | Logo, then real issue crop with an illustrative maintainer comment, "Same commit. Different environment." with a diff of the two capsules, the capsule as trimmed real JSON and the loop as one line | 0:00 | 31.1 s | real issue screenshot, real capsules, typeset | a stranger learns what twin does before any terminal |
| 2 | Strip 1 Capture + `twin capture`, card "Captured" | 0:31.1 | 14.8 s | LIVE (local pty, neutral path) | the reporter records the failing environment |
| 3 | Strip 2 Replay + replay, card "Reproduced" | 0:45.9 | 13.7 s | LIVE on Solari, sped up (tagged) | rebuild it on a clean machine |
| 4 | Strip 3 Bisect + bisect, card "Cause found" | 0:59.6 | 11.6 s | LIVE | find the one difference |
| 5 | Strip 4 Verify + verify, card "Fixed" | 1:11.3 | 12.2 s | LIVE | check the fix where it failed |
| 6 | Strip 5 Share: `replay --keep` + `shell --web`; real headless Chrome on the link; `twin stop`, `twin list` | 1:23.5 | 34.2 s | LIVE; Chrome over CDP; the sign-in card is drawn | the reporter joins the same machine |
| 7 | Strip 6 Agents + a REAL interactive Claude Code session (haiku, twin over MCP) | 1:57.7 | 40.2 s | LIVE tmux snapshots; waits sped up with chips | Claude Code does the same loop |
| 8 | Website walkthrough (local build): install and Copy, the demo section scrolled past (video not played), commands, capsule privacy rows, replay, bisect tabs, verify, agents timeline, files, footer, replay guide zoomed on its article | 2:37.9 | 42.0 s | real site frames | install, docs and demos exist |
| 9 | Summary, three lines | 3:19.9 | 6.0 s | drawn | recap |
| 10 | Close, centered: logo, `npm install -g @crypticsaiyan/twincli`, github.com/crypticsaiyan/twin, twincli.vercel.app | 3:25.9 | 9.1 s | drawn | install |

Captions during the commands are plain-language; each verdict gets a result card that replaces the caption
for about 3 s. The Claude Code banner drops the plan name (`build.mjs` redaction), nothing else in the
snapshots is altered.

Honesty rules: every terminal line is real output; only the playback clock is mapped. Any stretch that is not
1x carries a visible speed chip and a "real N s" counter, and the real wall time of each command stays in the
window header (for example "replay 33 s"). A sped-up stretch shows the speed chip and the real total
of that stretch (for example "13x, real 33 s"; idle cuts under 1 s show no chip), not a running counter.
