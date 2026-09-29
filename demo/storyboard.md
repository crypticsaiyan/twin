# twin demo storyboard (about 100 s, 1920x1080, 30 fps)

| # | Scene | Time | Source | Caption |
|---|---|---|---|---|
| 1 | Title: Doto wordmark, red block cursor, tagline | 3 s | drawn | Turns "cannot reproduce" into a verified fix. |
| 2 | The problem: screenshot of date-fns#2068 | 5.6 s | headless Chrome screenshot | Passes for the maintainer. Fails in New York. |
| 3 | Reporter: `twin capture` review screen, answer y | 11.4 s | LIVE (local pty) | Nothing is uploaded. Secrets scrubbed. You review it. |
| 4 | Maintainer: replay, bisect, verify | 23 s | LIVE on Solari, progress phases sped up (tagged, real time shown) | Rebuild the reporter's machine. Find the difference. Verify the fix. |
| 5 | Browser terminal: `replay --keep`, `shell --web`, real headless Chrome on the link, `twin list`, `twin stop` | 41 s | LIVE; Chrome driven over CDP; the sign-in card is drawn (a native basic-auth dialog cannot be screenshotted) | Share a link. The reporter joins the same machine. |
| 6 | Agents: examples/echarts-21538/mcp.txt replayed as animation | 9.3 s | RECORDED session, waits shortened (tagged) | recorded Claude Code session over MCP |
| 7 | Close: logo, install line, repo, `twin list` empty | 5.6 s | LIVE `twin list` | no machines left running |

Honesty rules: every terminal line is real output; only the playback clock is mapped. Any stretch that is not
1x carries a visible speed chip and a "real N s" counter, and the real wall time of each command stays in the
window header (for example "replay 33 s").
