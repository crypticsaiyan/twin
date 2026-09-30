# twin

Website and docs: https://twincli.vercel.app

**Turns "cannot reproduce" into a verified fix.** A reporter captures the environment their command failed in, as a small scrubbed file attached to the issue. twin rebuilds that environment on a clean [Solari](https://getsolari.com) sandbox, finds the difference that breaks it, and checks a fix there, whether a maintainer or a coding agent wrote it.

Most "works on my machine" bugs are not in the code. The commit is the same; what differs is a runtime version, a dependency the lockfile resolved differently, an environment variable, the time zone. Today the maintainer gets, at best, a pasted list of versions that nobody can run, and the issue sits at "cannot reproduce".

| Step | Who | Command | Needs a Solari key |
|---|---|---|---|
| Capture the failing environment | reporter | `twin capture -- npm test` | no |
| Rebuild it and rerun | maintainer | `twin replay twin-capsule.json` | yes |
| Find the difference that breaks it | maintainer | `twin bisect bad.json --good good.json` | yes |
| Check a fix in the reporter's environment | maintainer | `twin verify bad.json --patch fix.patch` | yes |
| Open a shell in it, or share one | maintainer | `twin replay … --keep`, then `twin shell --web` | yes |
| Let a coding agent debug in it | agent | `twin mcp` (MCP server) | yes |
| Check that a pull request really fixes it | CI | `uses: crypticsaiyan/twin@main` | yes |

## Proof on a real issue

[apache/echarts#21538](https://github.com/apache/echarts/issues/21538) (open) reports a test that fails only in time zones with daylight saving time. [`examples/echarts-21538`](examples/echarts-21538) holds capsules from New York (fails) and Kolkata (passes) and the recorded Solari runs:

| Run on Solari | Result | Time |
|---|---|---|
| `twin replay new-york.json` | `REPRODUCED`, identical failure signature | 72 s |
| `twin bisect new-york.json --good kolkata.json` | minimal difference `TZ=America/New_York` | 69 s |
| `twin verify new-york.json --patch fix.patch` | `FIXED` in the reporter's environment, nothing pushed | 71 s |

Opening the kept machine with `twin shell --web` gave a browser terminal in `/tmp/twin/repo` with `TZ=America/New_York` and Node 22.23.3, where the test fails with the issue's exact numbers.

## For AI coding agents

Coding agents can't fix bugs they can't reproduce, and they report "fixed" after tests pass in their own sandbox, which is not where the bug happens. twin closes both gaps.

**`twin mcp`** gives an agent the reporter's machine. Add it to Claude Code (or any MCP client):

```sh
claude mcp add twin -e SOLARI_API_KEY=slr_live_... -- npx -y @crypticsaiyan/twincli mcp
```

| Tool | What the agent gets |
|---|---|
| `inspect` | the reporter's runtimes, dependencies, env and failure, or every difference between two capsules (offline) |
| `replay` | the failure rebuilt on a fresh machine, kept running when it reproduces |
| `run` | a command run in that machine, with the reporter's env, PATH, time zone and working directory |
| `write_file` | a file written there, to try a change |
| `verify` | a unified diff checked on a fresh machine: `FIXED`, `STILL FAILING` or `DIFFERENT FAILURE` |
| `bisect` | the minimal environment difference between a failing and a passing capsule |
| `release` | the machine stopped (machines kept in a session are also released when it ends) |

A capsule argument can be a path or the issue attachment's URL, so "fix #21538" is enough for the agent to start.

**The GitHub Action** checks a pull request (from an agent or a person) where the bug happens. When a pull request says `Fixes #123` and #123 has a capsule attached, it runs `twin verify` with the pull request's head commit and comments the verdict; the check fails unless it is `FIXED`.

```yaml
# .github/workflows/twin.yml
name: twin
on: pull_request
permissions:
  contents: read
  issues: read
  pull-requests: write
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: crypticsaiyan/twin@main
        with:
          solari-api-key: ${{ secrets.SOLARI_API_KEY }}
```

The pull request's code runs only inside the Solari sandbox, never on the runner, and the key stays on the runner. Fork pull requests get no secrets under `pull_request`, so the check runs for branches in the repository, which is how agents usually open them. The sandbox clones the repository without credentials, so this needs a public repository.

## Quickstart

Node 22 or newer.

```sh
npm install -g @crypticsaiyan/twincli
```

**Reporter**, in the project where the command fails. Nothing is uploaded, no account needed:

```sh
twin capture -- npm test
```

twin runs the command as usual, shows what it recorded, and writes `twin-capsule.json` after you confirm. Attach that file to the issue.

**Maintainer**:

```sh
export SOLARI_API_KEY=slr_live_...     # https://console.getsolari.com, or put it in a .env file
twin replay twin-capsule.json
```

To try it without installing, prefix a command with `npx @crypticsaiyan/twincli`. To work from a clone instead: `pnpm install`, then `pnpm dev <command>` (or `pnpm build` and `node dist/bin.js <command>`).

### Ask for capsules in your issue template

```md
If the bug does not reproduce for us, please run the failing command through twin
and attach the file it writes (it records versions and variable names, never secrets):

    npm install -g @crypticsaiyan/twincli
    twin capture -- <your failing command>
```

## Commands

| Command | What it does |
|---|---|
| `twin capture -- <cmd>` | Run `<cmd>`, record its environment, write a capsule after review |
| `twin inspect <capsule>` | Summarize what a capsule recorded |
| `twin diff <capsule> <other>` | List every environment difference between two capsules |
| `twin replay <capsule>` | Rebuild the environment on a Solari sandbox, run the command 3 times, report `REPRODUCED`, `DIFFERENT FAILURE`, `NOT REPRODUCED`, `FLAKY` or `INCONCLUSIVE` |
| `twin replay <capsule> --keep` | Same, and leave a reproduced failure running for `twin shell` |
| `twin bisect <bad> --good <good>` | Smallest set of differences (env values, time zone, node version, npm dependency versions, working tree diff) that turns the passing environment into the failing one |
| `twin verify <capsule> --patch <file>` | Apply a candidate fix in the reporter's environment: `FIXED`, `STILL FAILING` or `DIFFERENT FAILURE`. `--ref <sha> --repo <url>` checks a pushed branch instead |
| `twin shell [id]` | Terminal on a kept machine, in the reporter's environment. Ctrl-] detaches |
| `twin shell [id] --web` | Browser terminal link plus a password, to share with the reporter |
| `twin list` | Show machines twin has running (kept replays, leftovers) |
| `twin stop [id]` | Stop one machine, or all twin left running; each stop confirmed |
| `twin mcp` | Serve these commands to AI coding agents over MCP (stdio) |

Every command has `--help` (or `twin help <command>`); `twin --help` lists them by task. Capsules can be paths or https URLs (such as issue attachments). `replay`, `bisect` and `verify` take `--json` for machine-readable reports and `-v` to stream the sandbox's output; `verify --comment <file>` also writes a pull request comment.

## What a capsule contains, and what it never does

- **The environment that matters**: OS and libc, runtimes (Node, Python from the project's venv, Go, Rust, and others), package managers and a hash of each lockfile, installed Node and Python package versions, git remote, commit, branch and `git diff HEAD`, time zone and locale, and the command's exit status with a fingerprint of its failure.
- **Env vars: names only.** Values are kept only for a short allowlist of behavior-changing, non-secret variables (`NODE_ENV`, `TZ`, `LANG`, `LC_*`, `CI`, `NODE_OPTIONS`, ...) or ones you name with `--include-env`. `--salt` records salted hashes instead, so two capsules can be compared without revealing values.
- **Scrubbed text**: the output tail, diff, argv and kept values pass through secret rules (private keys; GitHub, AWS, Stripe, Slack, npm, Google, OpenAI/Anthropic and Solari tokens; JWTs; bearer tokens; URL credentials; `password=`-style assignments; random-looking strings). Home directory paths become `~`. The capsule counts every replacement.
- **Untracked files: names only**, never contents.
- **You review it first**: a summary is shown and the full JSON can be viewed before anything is written.

Redaction is pattern based; review the capsule before posting it publicly.

## How it uses Solari

| Need | Solari primitive |
|---|---|
| A clean Linux machine per run | `sandboxes.create` with run-scoped `metadata` and a rolling `idleTimeoutMs` |
| Setup and the command, streamed, with a real timeout | `commands.start` + `onData`, twin's own timer and `kill(9)` |
| A shell at the failure point | `pty.create` (`twin shell`), and `previewUrl` in front of a guest web terminal behind a password (`twin shell --web`) |
| Re-attach from any computer, then let go | `sandboxes.connect(id)`, `close()` to detach without releasing |
| An agent working inside the reporter's machine | `connect` once per session, then `commands.start` and `files.write` on the kept sandbox (`twin mcp`) |
| No leaked, billing machines | `kill()` confirmed with `get()` and repeated until gone; Ctrl-C mid-run releases live machines before exiting; `listAll({ metadata })` reaper in `twin stop` |

Cost, from the account ledger: about $0.125 per sandbox-hour. A replay, bisect or verify of the echarts example takes about 70 s, so a fraction of a cent. Bisect runs every trial on one machine, so it fits a single concurrent slot.

Building this turned up platform behavior worth knowing, all measured and written up in [DESIGN.md §11](DESIGN.md): `kill()` that returned success while the sandbox kept running and billing for two hours; snapshot and revert taking 14 to 35 s; revert consuming its snapshot and sometimes failing with `Snapshot not found`; the control channel dropping after revert; listings that report dead sandboxes as live. twin works around each of them.


## Development

```sh
pnpm install
pnpm check        # typecheck + lint + tests
pnpm coverage     # tests with coverage thresholds
pnpm dev capture -- npm test     # run from source (Node 22.18+)
pnpm build        # compile to dist/
pnpm e2e:docker <capsule.json>                  # replay in a local Docker container (no key)
pnpm e2e:docker:bisect <bad.json> <good.json>   # bisect in a local Docker container
```

The website and documentation live in [`site/`](site) (Astro Starlight): `cd site && pnpm install && pnpm dev`.

Every Solari call goes through a small `Backend` interface, so the unit tests run against an in-memory fake and the Docker harness runs the real guest scripts without a key. Layout and design decisions are in [DESIGN.md](DESIGN.md).
