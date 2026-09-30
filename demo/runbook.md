# Demo runbook: one repo, the whole product

One real bug, end to end: a fresh install pulls a broken `lru-cache` release that the lockfile install does not, and the tests of a well known library fail with `ERR_REQUIRE_ASYNC_MODULE`. Replay reproduces it, a browser terminal opens the failing machine, bisect finds the one package among 32 differences, verify checks a real fix, and Claude Code does the loop over MCP.

The project is [cure53/DOMPurify](https://github.com/cure53/DOMPurify) at commit `883ac15`, failing command `npm run test:jsdom`. Every command and number below was run live on Solari on 2026-09-30.

**Publish first.** The pinning that makes replay reproduce this bug is in the repo, not in the npm package `@crypticsaiyan/twincli@0.1.0`. Publish a new version before you record, or `npm install -g` and `npx -y @crypticsaiyan/twincli mcp` will run the old code (replay says `NOT REPRODUCED`). Until then, use the local build: `pnpm build` in the twin repo, then replace `twin` with `node /path/to/twin/dist/bin.js` and, for MCP, `claude mcp add twin -- node /path/to/twin/dist/bin.js mcp`.

## Setup, off camera

```sh
# tools: Node 22+, git, nvm, Claude Code, a Solari key (console.getsolari.com)
nvm install 24.15.0
mkdir -p ~/twin-demo && cd ~/twin-demo
git clone https://github.com/cure53/DOMPurify maintainer && git -C maintainer checkout 883ac15
git clone https://github.com/cure53/DOMPurify reporter   && git -C reporter   checkout 883ac15
cp /path/to/twin/examples/lru-cache-397/fix.patch .      # the real fix, used near the end
export SOLARI_API_KEY=slr_live_...                        # never on screen; or a .env above the folder
twin list                                                 # No twin machines running.
```

Use a large terminal font, one clean prompt, and one window per role only if you want them: `maintainer/`, `reporter/` and `~/twin-demo` are all you need. Keep `nvm use 24.15.0` active in every terminal.

## 1. The problem (face or title card, 0:00)

Say: "If you maintain open source, you know 'works on my machine.' Your CI is green and a user's install fails. You can't see what they see, so you ask questions and wait. The hard part isn't fixing the bug. It's seeing it."

## 2. The idea (site hero, 0:30)

Say: "So I built twin. It records where a command failed, rebuilds it on a clean cloud machine, finds the one difference that causes it, and checks a fix there. It runs on Solari sandboxes."

## 3. Install (1:00)

```sh
npm install -g @crypticsaiyan/twincli
twin --help
```

Expect: the logo and the commands grouped by task. About 10 to 20 s (speed it up). Say: "One install. No account, and nothing is uploaded."

## 4. Green for the maintainer, red for the user (1:15)

```sh
cd ~/twin-demo/maintainer
npm ci
npm run test:jsdom                       # tests pass

cd ~/twin-demo/reporter
npm install --no-package-lock --before=2026-04-06T01:00:00Z
npm run test:jsdom                       # ERR_REQUIRE_ASYNC_MODULE ... lru-cache
```

Say: "Same commit, same Node version. The lockfile install passes. A fresh install fails. I pin the install date to the morning a broken release was published, because it was fixed hours later." Each install takes about a minute depending on the network and npm cache; speed them up.

## 5. Capture both environments, create `good.json` and `bad.json` (2:00)

```sh
cd ~/twin-demo/maintainer
twin capture -y -o ~/twin-demo/good.json -- npm run test:jsdom

cd ~/twin-demo/reporter
twin capture -o ~/twin-demo/bad.json -- npm run test:jsdom
```

For the second one, press `v` at the prompt to show the scrubbed JSON, then `y`. Expect `twin-capsule` summary (command, system, toolchain, repository, environment) and a file of a few kilobytes. Say: "The reporter records the environment into one file and reads it before it is written. Environment values stay out unless they are on a short safe list."

## 6. What differs (2:30)

```sh
cd ~/twin-demo
twin diff good.json bad.json
```

Expect: `Node packages` with 33 differing versions, nothing else that matters. Say: "33 packages differ. Nothing says which one matters."

## 7. Replay reproduces it, and keeps the machine (2:50)

```sh
twin replay bad.json --keep
```

Expect, in about 28 s:

```text
  ✓ install dependencies (npm ci)  9.7s
  ✓ pin 32 packages to the capsule's versions (@asamuzakjp/css-color@5.1.5, ...)  5.7s
  1  FAIL exit 1  exit1:3c9267cd7d019116
  2  FAIL exit 1  ...
  3  FAIL exit 1  ...
REPRODUCED: every attempt failed exactly as the capsule recorded.
```

Say: "twin installs from the lockfile, sees that 32 packages differ from what the reporter had, installs those versions, and runs the command three times. Reproduced, identical failure. The machine stays up."

## 8. A browser terminal on the failing machine (3:20)

```sh
twin shell --web
```

The link prints on stdout, the user `twin` and a password on stderr. Open the link in a browser, sign in, and run:

```sh
npm run test:jsdom
npm ls lru-cache
```

Expect the same `ERR_REQUIRE_ASYNC_MODULE`, and `lru-cache@11.3.0` under `@asamuzakjp/dom-selector`. Blur the password and the link, and never post them. Say: "The reporter and the maintainer can open the same machine in a browser: a root shell in the exact environment." Then free the slot:

```sh
twin stop
twin list                                # No twin machines running.
```

## 9. Bisect finds the cause (3:50)

```sh
twin bisect bad.json --good good.json
```

Takes about 245 s and 10 trials (speed up the middle, keep the real time on screen). Expect the trials halving 32, 16, 8, 4, 2, 1 and:

```text
Minimal failing difference:
  lru-cache@11.3.0
```

Say: "twin applies the differences to the good environment on a clean machine and halves the set until one is left: a version of `lru-cache` buried under jsdom. Nobody would find that by reading a diff."

## 10. Verify a real fix (5:00)

```sh
twin verify bad.json --patch fix.patch
```

Takes about 172 s. The patch adds `"overrides": { "jsdom": { "lru-cache": "^11.3.2" } }` and refreshes the lockfile. Expect:

```text
  ✓ pin 31 packages to the capsule's versions (...)
  1  PASS  34.0s
  2  PASS  33.8s
  3  PASS  34.2s
FIXED: the command passes in the reporter's environment with the fix applied.
```

Say: "Verify runs the command once without the fix to make sure the bug is really there, then applies the fix on a fresh machine in the reporter's environment. Fixed, three out of three." Optional, 78 s: a patch that does not touch the cause reports the opposite. Make one with `echo "docs" >> README.md; git diff > ../bogus.patch; git checkout README.md` in `maintainer/`, then `twin verify bad.json --patch bogus.patch` gives `STILL FAILING: the fix does not change the captured failure.`

## 11. Claude Code does the same over MCP (5:30)

Register once, before recording. `$SOLARI_API_KEY` is expanded by your shell, so the screen shows the variable name:

```sh
claude mcp add twin -e SOLARI_API_KEY=$SOLARI_API_KEY -- npx -y @crypticsaiyan/twincli mcp
```

On camera:

```sh
cd ~/twin-demo
MCP_TOOL_TIMEOUT=900000 claude --model haiku --allowedTools 'mcp__twin__*' Read
```

Paste the prompt:

> Use the twin tools. The capsule is bad.json (a failing npm test, run as npm run test:jsdom). 1) Replay it and keep the machine. 2) On the kept machine run the test and use npm ls lru-cache to find which package breaks it. 3) Read fix.patch and check that fix with twin verify (pass the patch text). 4) Release the machine. Answer in three short lines: the replay verdict, the cause, the verify verdict.

A recorded run took 256 s and 8 turns (about $0.07 on haiku): `replay` (REPRODUCED), `run` the test (exit 1, `ERR_REQUIRE_ASYNC_MODULE`), `run` `npm ls lru-cache`, `Read` the patch, `verify` (FIXED), `release`. Speed up the waits. Say: "The agent uses twin's own tools on the reporter's machine, not its own. It replayed, ran the test there, read the tree, verified the fix and released the machine." Caution: the model's final summary once misnamed the `lru-cache` version, so read the tool output on screen and keep the focus on the verdicts, not the agent's wording.

## 12. Clean up and close (6:30)

```sh
twin list                                # No twin machines running.
```

Say: "No machines left running. twin is on npm as `@crypticsaiyan/twincli`, it's open source, and it runs on Solari sandboxes."

## Timings and cost

| Step | Command | Live time |
|---|---|---|
| Replay and keep | `twin replay bad.json --keep` | 28 s |
| Browser terminal | `twin shell --web` | a few seconds (page returned HTTP 200 with the password, 401 without) |
| Bisect | `twin bisect bad.json --good good.json` | 245 s, 10 trials |
| Verify, real fix | `twin verify bad.json --patch fix.patch` | 172 s (two machines) |
| Verify, unrelated patch | same with a documentation patch | 78 s (two machines) |
| Claude Code session | replay, run, verify, release | 256 s, about $0.07 |

A whole live run is about 15 minutes of waiting. Cut the film to 4 to 5 minutes by speeding up installs, bisect trials and verify attempts, and keep the real time on screen for each sped-up stretch. Machines cost about $0.125 per sandbox hour, so a full run costs a few cents.

## Things that trip people up

- **Date pin.** Step 4's `--before=2026-04-06T01:00:00Z` is what makes a fresh install resolve the broken release today. Without it you get a fixed version and the test passes.
- **One machine at a time.** Stop the kept machine (step 8) before bisect, so a free account's single concurrent slot is free.
- **Capture recorded names, not values.** `bad.json` lists environment variable names from the machine that captured it; values are not recorded.
- **The reporters were not DOMPurify's.** The issue's reporters used other jsdom-based setups; say DOMPurify is the project used to reproduce it.
- **Key safety.** Never echo the key or run `env` on camera, and check the `twin capture` review screen and every frame before you post.
- **Agent output.** Claude Code needs approval for each twin tool unless you pass `--allowedTools 'mcp__twin__*'` as above.
