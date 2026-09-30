# twin: design

> Working name. Final name TBD; everything here is renamed in one pass before launch.

## 1. Problem

A user reports "`npm test` fails on my machine". The maintainer runs it and it passes. The issue sits at "cannot reproduce" until someone gives up. The difference is almost never the code (same commit). It is the environment: a runtime version, a transitive dependency the lockfile resolved differently, an env var, the timezone, a stale cache, the OS.

Today the maintainer gets, at best, a pasted list of versions. Nobody can run that.

**twin** turns the reporter's environment into something runnable:

1. The reporter runs one command. It records the environment facts that matter, with secrets stripped, into a small file (a *capsule*).
2. The maintainer replays the capsule on a Solari sandbox and gets a machine where the failure actually happens, plus a live terminal on it.
3. twin then searches the differences between the failing capsule and a known-good environment and reports the smallest set that flips pass to fail: "fails only with Node 22.3 and TZ=Asia/Kolkata".

The reporter needs no Solari account. Only the maintainer (or a CI bot) does.

## 2. Why Solari, specifically

The core requirement is that two different people share one exact machine. That cannot be done on either person's laptop.

| Need | Solari primitive |
|---|---|
| A clean Linux machine per replay, bisect or verify run | `sandboxes.create` (template `base`, run-scoped `metadata`, rolling `idleTimeoutMs`) |
| Run setup and the command with live output and a real timeout | `commands.start` + `onData` + twin's own timer and `kill(9)` (the streaming path has no server-side timeout) |
| Get the reporter's exact commit and diff | `git fetch` of one SHA in the guest + `files.write` of the diff |
| Hand the maintainer a live shell at the failure point | `pty.create` (`twin shell`) and `previewUrl` in front of a guest web terminal (`twin shell --web`) |
| Re-attach later, from any computer | `sandboxes.connect(id)`, then `close()` to detach without releasing |
| Never leak billing VMs | `kill()` confirmed with `get()` and repeated until gone; Ctrl-C or a stop signal releases every live machine (`src/interrupt.ts`) before exiting 130; `listAll({ metadata })` reaper in `twin stop` |
| Web-app bugs (later) | `previewUrl` + recorded Solari browser session |
| GUI/Electron bugs (later) | Solari desktop |

Snapshots were the original plan for bisect (build once, fork trials). Measured live they take 28 to 35 s, revert consumes them and sometimes fails, so bisect undoes trials in place instead (section 7, findings in section 11).

## 3. Users and flows

### 3.1 Reporter: capture

```
npx twin capture -- npm test
```

- Runs the command locally, records exit code and a trimmed output tail.
- Collects the environment facts (section 4), applies redaction (section 5).
- Shows exactly what will be written and asks for confirmation.
- Writes `twin-capsule.json`. The reporter attaches it to the issue.

No network calls, no Solari key.

### 3.2 Maintainer: replay

```
npx twin replay ./twin-capsule.json
```

- Builds a sandbox matching the capsule (section 6), runs the command.
- Verdict: `REPRODUCED` (same failure identity), `DIFFERENT FAILURE`, `NOT REPRODUCED` (the same versions pass on Linux, see 3.6), `FLAKY` (attempts disagree), or `INCONCLUSIVE` (setup failed or a timeout).
- With `--keep`, on `REPRODUCED` the machine stays running at the failure with the reporter's env written to `/tmp/twin/env.sh`, and twin prints:
  - `twin shell <id>`: a local terminal (PTY over the control channel; Ctrl-] detaches)
  - `twin shell <id> --web`: a browser terminal (ttyd in the guest behind a random password, exposed with `previewUrl`) the maintainer can share with the reporter.

### 3.3 Maintainer: bisect

```
npx twin bisect ./twin-capsule.json --good ./good.json  # a capsule where the command passes
```

Finds the smallest set of environment differences that turns the good world into the failing one (section 7).

### 3.4 CI mode: "passes locally, fails in CI" (not built yet)

```
npx twin ci https://github.com/o/r/actions/runs/123/job/456
```

The CI side needs no capture: GitHub Actions logs state the runner image and version, and `setup-node` / `setup-python` log the exact runtime installed. twin builds a capsule from the job log, replays it, and bisects against the developer's local capsule.

### 3.5 Verify a fix, then guard it

```
npx twin verify ./twin-capsule.json --patch fix.patch   # nothing pushed yet
npx twin verify ./twin-capsule.json --ref <sha> --repo <fork-url>
```

Rebuilds the reporter's environment, applies the fix and reports `FIXED`, `STILL FAILING` or `DIFFERENT FAILURE`. A GitHub Action that reruns stored capsules nightly as regression guards is not built yet.

### 3.7 Coding agents

Agents are the new source of both fixes and false "fixed" claims: they run the tests in their own sandbox, which is exactly where the bug does not happen. twin serves them in two places.

- **`twin mcp`** (MCP over stdio, official SDK) exposes the CLI as tools (`inspect`, `replay`, `verify`, `bisect`, `release`) plus two that only make sense for agents: `run` and `write_file` on a kept machine. `replay --keep` writes `/tmp/twin/run.sh`, which sources the reporter's env and enters the failing command's directory, so each agent command runs exactly where the failure lives. Connections are opened once per session; machines the session kept are released when the client disconnects, so a forgotten `release` costs at most the session. Long calls send MCP progress notifications. Stdin closing ends the session only after every received request is answered (`src/mcp/transport.ts`), otherwise a running replay would be cut off.
- **The GitHub Action** (`action.yml`, logic in `scripts/action/`) checks pull requests: it follows `closingIssuesReferences` to the issue, takes the first capsule attachment, runs `twin verify --ref <head sha> --repo <head repo> --comment`, and keeps one comment up to date through a marker. It fails the check unless the verdict is `FIXED`. Pull request code runs only in the sandbox; the runner only runs twin, which is why the key can live there.

No LLM is built in: twin is the environment and the judge, the agent brings its own model. That keeps a second vendor key out of the headline path.

### 3.6 Linux-only, stated plainly

Solari sandboxes are Linux microVMs. A macOS or Windows capsule is replayed with the same runtime and dependency versions on Linux. If it passes there, that is reported as a finding, not a failure: "same versions pass on Linux, the difference is likely OS-specific". That alone rules out half the search space for the maintainer.

## 4. Capsule format (v1)

JSON, versioned, small (target under 200 KB). Everything is a fact that can be *applied* on replay or *compared* in bisect.

The source of truth is `src/capsule/schema.ts` (TypeScript types plus the runtime decoder that validates every capsule read from disk).

```jsonc
{
  "twin": 1,
  "createdAt": "2026-09-28T10:00:00Z",
  "generator": "twin 0.1.0",
  "command": { "argv": ["npm", "test"], "cwd": "packages/api", "exitCode": 1, "signal": null,
               "durationMs": 4210, "outcome": "fail",
               "failure": { "signature": "exit1:9f2c…", "keyLines": ["…normalized error lines…"],
                            "outputTail": "…scrubbed, last 200 lines…" } },
  "os": { "platform": "darwin", "arch": "arm64", "release": "24.1.0",
          "distro": "macos", "distroVersion": "15.1", "libc": null, "libcVersion": null },
  "runtimes": { "node": "22.3.0", "python": "3.12.4" },          // only what is installed
  "tools": { "npm": "10.8.1", "pnpm": "9.12.0", "git": "2.46.0" },
  "packageManagers": [ { "name": "pnpm", "ecosystem": "node", "version": "9.12.0", "declared": "9.12.0",
                         "lockfile": "pnpm-lock.yaml", "lockfileSha256": "…" } ],
  "resolved": { "node": { "left-pad": ["1.3.0"] },               // installed, from node_modules
                "python": { "requests": "2.32.3" } },            // installed, from pip list
  "repo": { "remote": "https://github.com/o/r", "commit": "abc123", "branch": "main", "dirty": true,
            "diff": "…git diff HEAD, scrubbed…", "diffTruncated": false, "diffRedacted": false,
            "untracked": ["names only"] },
  "env": { "NODE_ENV": { "state": "set", "value": "test" },     // allowlisted value
           "CI":       { "state": "absent" },
           "API_TOKEN":{ "state": "set" },                       // name only
           "DB_URL":   { "state": "set", "hash": "…" } },        // only with --salt
  "locale": { "timeZone": "Asia/Kolkata", "locale": "en-IN" },
  "redaction": { "rulesVersion": 1, "valuesIncluded": ["NODE_ENV"], "hashedValues": false,
                 "scrubbed": { "github-token": 1, "home-path": 3 } }
}
```

Failure identity (`signature`): exit code plus a normalized fingerprint of the output tail (strip timestamps, durations, absolute paths, hex addresses, ANSI). Replay compares signatures so a *different* failure is not reported as a reproduction.

## 5. Redaction and trust

Getting this wrong once (a token in a public issue) kills the project, so the defaults are strict:

- **Env values are never captured by default.** Only name and state (`set` / `empty` / `absent`).
- A small built-in allowlist of known-safe variables keeps values (`NODE_ENV`, `TZ`, `LANG`, `LC_*`, `CI`, `FORCE_COLOR`, `NODE_OPTIONS` after scrubbing). `--include-env NAME` opts more in.
- **Output tail and diff are scrubbed** with secret patterns (AWS keys, GitHub tokens, JWTs, private key blocks, generic `key=`/`token=`/`password=` assignments, high-entropy strings) and home-directory paths are rewritten to `~`.
- **Untracked files: names only**, never contents.
- **Preview before write.** The reporter sees the full capsule and confirms. `--yes` skips it for scripted use.
- **Value comparison without disclosure (optional).** For "same variable, different value" bugs, both sides can hash values with an issue-specific salt the maintainer provides (`--salt`). Plain unsalted hashes of low-entropy values are guessable, so twin never emits them.

On the replay side: env vars that were captured as name-only are set to a placeholder, or taken from the maintainer's shell with `--env-from-shell NAME`. The capsule never makes a secret appear inside the sandbox.

## 6. Replay pipeline

```
capsule
  │
  ▼
create sandbox (template "base", metadata {app:"twin", run:<id>}, idleTimeoutMs)
  │  install runtimes: node from official tarball, python via uv (both fast, no compiling)
  │  fetch the commit by SHA → apply the reporter's diff
  │  install the package manager at the captured version → install deps (frozen lockfile)
  │  env: allowlisted values, TZ from the captured zone, PATH to the installed runtime
  ▼
run command N times (default 3) → fingerprint each failure → verdict
  │
  ├─ --keep and REPRODUCED → write env.sh + shell.sh, detach, leave running for `twin shell`
  └─ otherwise → kill, confirmed with get()
```

Notes:
- Commands are not shell-interpreted by the sandbox. twin passes argv explicitly and uses `sh -c` only where it builds a script itself; the captured command runs as `sh -c 'exec "$@"'` so PATH resolves to the installed runtime without re-parsing arguments.
- Everything runs inside `try/finally`. Every VM carries `metadata.run`; `twin stop` reaps leftovers with `listAll({ metadata })`, checking each with `get()` because the listing lags.
- `idleTimeoutMs` is a rolling idle window, not a deadline (cookbook gotcha); long installs keep it alive.

## 7. Bisect

**Worlds.** GOOD = a capsule that passes (maintainer's local, CI, or any other). BAD = the reporter's capsule. Both must be the same commit (or the diff is itself one candidate).

**Candidates.** Each differing fact is one atom:
- a runtime version (`node 20.17.0 → 22.3.0`)
- package manager version
- each resolved dependency version that differs
- each env var whose state or (salted) value differs
- TZ, LANG / LC_*
- the working-tree diff (one atom, or per-file atoms)
- OS (only as a note: cannot be varied on Linux)

**Search.** Classic ddmin over the atom set: start from GOOD, apply subsets of BAD's atoms, run the predicate, keep shrinking until removing any single remaining atom makes it pass. This is established delta debugging (Zeller's ddmin); twin's contribution is running it on disposable VMs from a reporter's capsule.

**Each trial** runs on the one machine that holds GOOD's world, applies the subset, and runs the command N times: FAIL only if every run fails with BAD's signature, PASS if every run passes, otherwise unresolved (reported, never counted as the bug). The search is bracketed by two checks: GOOD alone must pass and all atoms together must fail.

**Resetting between trials without snapshots.** Env, time zone and runtime atoms are process settings (both node versions are installed up front and switched through PATH), so those trials need no reset. Working-tree trials swap diffs with `git apply` and undo with an idempotent `git apply -R`. Dependency trials (`npm install --no-save`) are undone by rerunning GOOD's install. If an undo fails, bisect stops rather than trust later trials. One machine means it fits a single concurrent slot.

**Output.** The minimal set ("Together they fail the captured way; removing any one of them makes it pass"), every trial, and the smallest trials that failed with a *different* signature (for example the right cause with a runtime that formats the error differently). A version-range sweep ("fails on node ≥ 22.3.0") is not built yet.

**Not a claim of root cause.** Scoped to the captured differences and this predicate, stated in the report.

## 8. Commands

| Command | Needs Solari key | What it does | State |
|---|---|---|---|
| `twin capture -- <cmd>` | no | record a capsule | done |
| `twin inspect <capsule>` | no | summarize a capsule | done |
| `twin diff <capsule> <other>` | no | list differences between two capsules | done |
| `twin replay <capsule> [--keep]` | yes | reproduce on a sandbox | done |
| `twin bisect <bad> --good <good>` | yes | minimal failing difference | done |
| `twin verify <capsule> --patch <file> \| --ref <sha>` | yes | check a fix in the reporter's environment | done |
| `twin shell [id] [--web]` | yes | terminal or browser terminal on a kept machine | done |
| `twin list` | yes | running twin machines | done |
| `twin stop [id]` | yes | stop one or all twin machines, confirmed (`gc` is an alias) | done |
| `twin mcp` | yes (for machine tools) | MCP server for coding agents | done |
| `uses: crypticsaiyan/twin@main` | yes | verify pull requests against the issue's capsule | done |
| `twin ci <job-url>` | yes | capsule from a GitHub Actions job | not built |

## 9. Implementation

- TypeScript, Node ≥ 22, ESM. Published as `@crypticsaiyan/twincli` (the unscoped `twin`, `twin-cli` and `twincli` names are taken or too similar); `npx @crypticsaiyan/twincli` or `npm install -g` gives the `twin` command.
- Runtime dependencies: `@solarisdk/sdk` (added with replay), `@modelcontextprotocol/sdk` and its schema library `zod` (added with `twin mcp`). Argument parsing with `node:util` `parseArgs`. No framework. Dev: TypeScript, Vitest, Biome.
- A `Backend` / `Machine` interface (`create`, `connect`, `list`, `reap`; `run`, `writeFile`, `openTerminal`, `previewUrl`, `detach`, `kill`) with `SolariBackend`, an in-memory `FakeBackend` for unit tests, and a development-only Docker backend (`test/e2e/`) that runs the real guest scripts without a key.

```
src/
  bin.ts            entry (process glue only)
  cli.ts            dispatch, exit codes
  host.ts  io.ts    injected machine and terminal access
  commands/         capture, inspect (+ diff), replay, bisect, verify, list, shell, stop, mcp
  capsule/          schema + decoder, file io, https source, diff
  capture/          orchestrator, run-command, tail buffer
    facts/          os, probes, package managers, node/python deps, repo, env, project root
  redact/           secret rules, entropy heuristic, Redactor
  signature/        output normalization, failure identity
  replay/  bisect/  plans, runs, verdicts; ddmin over environment atoms
  shell/            guest scripts, PTY session, kept-machine lookup
  mcp/              MCP tools, kept machines per session, transport
  report/           terminal and pull request (Markdown) rendering
  backend/          Backend interface, Solari and in-memory fake
  util/             exec, fs, hash
test/               mirrors src/, fakes in test/helpers
```

Every collector takes its dependencies (an `Exec`, a `Host`, a `Redactor`) as arguments, so unit tests use fakes and a few integration tests use real git and real processes in temp dirs.

## 10. Cookbook submission shape

- Lives in `applications/twin/` of the fork with one row in `applications/README.md`. Nothing else in the fork changes.
- Synced from this standalone repo by `scripts/sync-fork.sh` (rsync with an exclude list: `.github/`, videos, `node_modules/`, build output, `.env`).
- Quickstart uses `export SOLARI_API_KEY=...`, not a `.env` the code does not read.
- `.env.example` lists exactly the variables the code reads.
- A possible small extracted example as a separate PR: `sandbox-runtime-matrix-ts` (same command across runtime versions on one sandbox).

## 11. Open questions for the first live check

1. What does the `base` template ship (Node version, python3, git, curl, tar, build-essential, apt)? Issue #34 says Node 18.
2. Outbound network on `dedicated` for nodejs.org / PyPI / npm registry downloads: speed?
3. `snapshot()` and `create({ fromSnapshot })` timings for a sandbox with `node_modules` (docs say about 1 s; desktop measurements in forks were 20 s+).
4. Are unpromoted snapshots durable enough for a bisect session (fork reports say they can vanish on gateway restart)?
5. Does `pty.create` stream well enough for an interactive shell? Is `previewUrl` plus a guest web terminal (ttyd or a small xterm.js server) viable, and how is the preview token shared safely?
6. Free-plan concurrency, session lifetime and disk size.

Each answer that contradicts the docs becomes a precise issue on the cookbook repo.

### Live check, 2026-09-28 (SDK 0.1.4, template `base`, dedicated isolation)

Capsule: a time-zone-dependent assertion in `sindresorhus/is-plain-obj@666df7c`, captured on Asia/Kolkata.

| Measured | Result |
|---|---|
| End to end `twin replay` (create, setup, 2 attempts, kill) | 43 s |
| Node 26.7.0 tarball download + extract from nodejs.org | 2.3 to 2.5 s |
| `git fetch --depth 1` of one commit by SHA | 0.8 s |
| `npm install -g npm@12.0.2` | 3.5 s |
| `npm install` (project devDependencies) | 31 to 34 s |
| Verdict | REPRODUCED, same signature as the reporter's machine |
| Control with `--env TZ=UTC` | NOT REPRODUCED (passes), as expected |

Answers so far: `base` has `sh`, `curl`, `tar`/gzip and `git`; outbound HTTPS to nodejs.org, GitHub and the npm registry works and is fast; Node 26 official binaries run. Dependency install dominates, which confirms the bisect design (install once, snapshot, fork trials). Sandbox ids are opaque strings of about 200 characters.

### Live bisect and snapshot measurements, 2026-09-28

Bisect of the same capsule against a passing capsule (`TZ=UTC`, `NODE_ENV=test`, `FORCE_COLOR=0`, plus a README edit):

| Measured | Result |
|---|---|
| End to end `twin bisect` (build good world, snapshot, 5 trials, kill) | 76 s |
| `snapshot()` of a running sandbox with `node_modules` | 28.4 s and 34.7 s (docs suggest about 1 s) |
| `revert()` in place | 21.7 s and 14.2 s |
| Trials that only change env, time zone or node version | 0.3 to 0.7 s each, no reset needed |
| Result | minimal difference `TZ=Asia/Calcutta`, 5 trials |

Platform behavior found, candidates for cookbook issues:

1. After `revert()` the control channel is closed, and the first command after `reconnect()` still fails (`Not connected` or `Control channel closed (1005)`) while the guest finishes restoring. twin works around it by reconnecting and running a no-op until two succeed in a row.
2. `listAll({ metadata })` keeps returning sandboxes as live for several minutes after `kill()` succeeded, so orphan reapers report and re-kill machines that are already gone.
3. Snapshot and revert take tens of seconds, not about one second.
4. `revert()` consumes the snapshot: `getSnapshot` returns 404 immediately after the first revert, and a second revert fails with `Snapshot not found`. In one run even the first revert failed with `Snapshot not found` while `listSnapshots` still listed the snapshot.
5. Each snapshot with `node_modules` is about 4 GB of storage, billed from 2026-10-01 above 10 GB, and nothing deletes it automatically.
8. Sandboxes have about 2 GB RAM, no swap and a 3.9 GB disk (measured 2026-09-29). A yarn 4 install of the mantine monorepo hit the guest OOM killer (`Out of memory: Killed process ... node`, in guest-agent.service), which ended the agent and closed the control channel with code 1005. It is not an idle timeout: a silent 100 s command and a chatty 100 s command both ran fine. twin reports the lost connection with this cause.
7. `kill()` is not always effective. Two sandboxes from replays at about 06:15 UTC stayed `running` and kept billing (ledger: about 0.5 cents every few minutes each, 06:20 to 08:19, until the balance ran out) after twin's `kill()` and two later `DELETE`s from `twin stop` all returned success. Their 15-minute idle timeout did not stop them either (`expiresAt` kept moving forward). At 08:36 a plain `DELETE` removed both within 16 s. twin now confirms every kill with `get()` and re-kills until the sandbox is gone, and reports loudly if it never goes. About 7.5 hours after that `DELETE`, at about 16:10 UTC, `twin stop` found the same two sandboxes again (run `fd0c959a`, the recorded `replay.txt`, is one of them): `listAll` returned them and `get()` reported them live, although `get()` had returned 404 at 08:36. gc killed both with confirmation. Whether they billed in between needs the ledger.
6. `listSnapshots` returns stale entries: snapshots consumed by a revert or already deleted keep appearing, `getSnapshot`/`deleteSnapshot` on them return 404, and the listed set differs between consecutive calls. `listAll` for sandboxes shows the same pattern for killed machines. `twin stop` treats a 404 on delete as already gone.

Because of 3 to 5, bisect uses no snapshots. Env, time zone and runtime trials need no reset (both runtimes are installed up front and switched through PATH); working-tree trials are undone with an idempotent `git apply -R`; dependency trials are undone by rerunning the good world's install.

Final live run on a pair with five differences (node version, an npm dependency, two env unsets, time zone): 66 s end to end, 15 trials, result identical to the Docker harness. It also showed why trials that fail with a different signature are reported separately: on node 22 the time zone bug fails too, but the assertion message is formatted differently, so the exact captured failure needs node 26 and the time zone together.

Guest runs as root (npm logs under `/root/.npm`). `pty.create` and `previewUrl` both work for interactive use: a ttyd browser terminal behind basic auth answered through the preview proxy (401 without the password, a working WebSocket session with it), and a PTY session ended cleanly on an exit marker (the SDK's PTY has no exit event).

## 12. Milestones

1. **Capture + inspect** (offline). Done.
2. **Replay** on Solari, `--keep`, `shell`, browser terminal. Done, verified live.
3. **Bisect** (atoms, ddmin, in-place undo). Done, verified live. Version sweep not built.
4. **Proof** on a real issue: apache/echarts#21538 reproduced, bisected and fix-verified (`examples/echarts-21538`). Done.
5. **Verify** done; CI mode and a nightly guard Action not built.
6. Web-app bugs via the browser and GUI bugs via desktops: not built.
7. Packaging, README, fork sync, PRs, launch: in progress.
