# twin demo storyboard (about 3:14, 1920x1080, 30 fps, no audio)

| # | Scene | Start | Length | Source | Purpose |
|---|---|---|---|---|---|
| 1 | Explainer: "works on my machine", reporter vs maintainer, then the flow reporter's machine -> capsule -> clean Solari sandbox -> four outcomes | 0:00 | 22.6 s | drawn in player.html (animated) | a stranger learns what twin does before any terminal |
| 2 | Title strip 1 Capture, then `twin capture` review screen, result card "Captured" | 0:22.8 | 14.3 s | LIVE (local pty, neutral path /tmp/twin-demo) | the reporter records the failing environment |
| 3 | Strip 2 Replay + replay, card "Reproduced" | 0:37.5 | 8.6 s | LIVE on Solari, sped up (tagged) | rebuild it on a clean machine |
| 4 | Strip 3 Bisect + bisect, card "Cause found" | 0:46.5 | 9.5 s | LIVE | find the one difference |
| 5 | Strip 4 Verify + verify, card "Fixed" | 0:56.4 | 10.2 s | LIVE | check the fix where it failed |
| 6 | Strip 5 Share: `replay --keep` + `shell --web`; real headless Chrome on the link; `twin stop`, `twin list` | 1:07.0 | 34.4 s | LIVE; Chrome over CDP; the sign-in card is drawn (a native basic-auth dialog cannot be screenshotted) | the reporter joins the same machine |
| 7 | Strip 6 Agents + a REAL interactive Claude Code session (haiku, twin over MCP, published package) | 1:41.4 | 39.3 s | LIVE: tmux pane snapshots rendered as a terminal; waits sped up with chips | Claude Code does the same loop |
| 8 | Website walkthrough of the real site, local build, with zooms and clicks | 2:21.1 | 39.9 s | real site frames, 1x | docs and demos exist |
| 9 | Summary: what twin gives you, three lines | 3:01.3 | 6.2 s | drawn | recap |
| 10 | Close: logo, `npm install -g @crypticsaiyan/twincli`, repo, twincli.vercel.app, `twin list` empty, note that date-fns#2068 is still open upstream and PR #4140 covers the same function | 3:07.7 | 6.0 s | LIVE `twin list` | install, no machines left |

Captions during the commands are plain-language; each verdict gets a result card that replaces the caption
for about 3 s. The Claude Code banner drops the plan name (`build.mjs` redaction), nothing else in the
snapshots is altered.

Honesty rules: every terminal line is real output; only the playback clock is mapped. Any stretch that is not
1x carries a visible speed chip and a "real N s" counter, and the real wall time of each command stays in the
window header (for example "replay 33 s"). A sped-up stretch shows the speed chip and the real total
of that stretch (for example "13x, real 33 s"; idle cuts under 1 s show no chip), not a running counter.
