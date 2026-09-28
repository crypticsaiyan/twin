# twin

> Working name.

**Turns "cannot reproduce" into a machine you can open.** A reporter captures the environment their command failed in. A maintainer rebuilds that environment on a clean [Solari](https://getsolari.com) sandbox, finds the difference that breaks it, checks a fix there, and can open a shell in it.

Most "works on my machine" bugs are not in the code. The commit is the same; what differs is a runtime version, a dependency the lockfile resolved differently, an environment variable, the time zone. Today the maintainer gets, at best, a pasted `envinfo` block that nobody can run, and the issue sits at "cannot reproduce".

| Step | Who | Command | Needs a Solari key |
|---|---|---|---|
| Capture the failing environment | reporter | `twin capture -- npm test` | no |
| Rebuild it and rerun | maintainer | `twin replay twin-capsule.json` | yes |
| Find the difference that breaks it | maintainer | `twin bisect bad.json --good good.json` | yes |
| Check a fix in the reporter's environment | maintainer | `twin verify bad.json --patch fix.patch` | yes |
| Open a shell in it, or share one | maintainer | `twin replay … --keep`, then `twin shell --web` | yes |

## Proof on a real issue

[apache/echarts#21538](https://github.com/apache/echarts/issues/21538) (open) reports a test that fails only in time zones with daylight saving time. [`examples/echarts-21538`](examples/echarts-21538) holds capsules from New York (fails) and Kolkata (passes) and the recorded Solari runs:

| Run on Solari | Result | Time |
|---|---|---|
| `twin replay new-york.json` | `REPRODUCED`, identical failure signature | 72 s |
| `twin bisect new-york.json --good kolkata.json` | minimal difference `TZ=America/New_York` | 69 s |
| `twin verify new-york.json --patch fix.patch` | `FIXED` in the reporter's environment, nothing pushed | 71 s |

Opening the kept machine with `twin shell --web` gave a browser terminal in `/tmp/twin/repo` with `TZ=America/New_York` and Node 22.23.3, where the test fails with the issue's exact numbers.

## Quickstart

Node 22 or newer.

**Reporter**, in the project where the command fails. Nothing is uploaded, no account needed:

```sh
npx github:crypticsaiyan/twin capture -- npm test
```

twin runs the command as usual, shows what it recorded, and writes `twin-capsule.json` after you confirm. Attach that file to the issue.

**Maintainer**:

```sh
export SOLARI_API_KEY=slr_live_...     # https://console.getsolari.com
npx github:crypticsaiyan/twin replay twin-capsule.json
```

To work from a clone instead: `pnpm install`, then `pnpm dev <command>` (or `pnpm build` and `node dist/bin.js <command>`).

### Ask for capsules in your issue template

```md
If the bug does not reproduce for us, please run the failing command through twin
and attach the file it writes (it records versions and variable names, never secrets):

    npx github:crypticsaiyan/twin capture -- <your failing command>
```

## Commands

| Command | What it does |
|---|---|
| `twin capture -- <cmd>` | Run `<cmd>`, record its environment, write a capsule after review |
| `twin inspect <capsule> [<other>]` | Summarize a capsule, or list every difference between two |
| `twin replay <capsule>` | Rebuild the environment on a Solari sandbox, run the command 3 times, report `REPRODUCED`, `DIFFERENT FAILURE`, `NOT REPRODUCED`, `FLAKY` or `INCONCLUSIVE` |
| `twin replay <capsule> --keep` | Same, and leave a reproduced failure running for `twin shell` |
| `twin bisect <bad> --good <good>` | Smallest set of differences (env values, time zone, node version, npm dependency versions, working tree diff) that turns the passing environment into the failing one |
| `twin verify <capsule> --patch <file>` | Apply a candidate fix in the reporter's environment: `FIXED`, `STILL FAILING` or `DIFFERENT FAILURE`. `--ref <sha> --repo <url>` checks a pushed branch instead |
| `twin shell [id]` | Terminal on a kept machine, in the reporter's environment. Ctrl-] detaches |
| `twin shell [id] --web` | Browser terminal link plus a password, to share with the reporter |
| `twin gc` | Kill every machine twin left running, each kill confirmed |

Every command has `--help`. `replay`, `bisect` and `verify` take `--json` for machine-readable reports and `-v` to stream the sandbox's output.

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
| No leaked, billing machines | `kill()` confirmed with `get()` and repeated until gone; `listAll({ metadata })` reaper in `twin gc` |

Cost, from the account ledger: about $0.125 per sandbox-hour. A replay, bisect or verify of the echarts example takes about 70 s, so a fraction of a cent. Bisect runs every trial on one machine, so it fits a single concurrent slot.

Building this turned up platform behavior worth knowing, all measured and written up in [DESIGN.md §11](DESIGN.md): `kill()` that returned success while the sandbox kept running and billing for two hours; snapshot and revert taking 14 to 35 s; revert consuming its snapshot and sometimes failing with `Snapshot not found`; the control channel dropping after revert; listings that report dead sandboxes as live. twin works around each of them.

## Limits

- **Replay is Linux only.** A macOS or Windows capsule is replayed with the same versions on Linux; if it passes there, twin says so, which points at the OS.
- **Node and Python projects.** Verified end to end: npm projects on Solari, and uv projects (`uv.lock`) in the Docker harness. pnpm, Yarn and Bun, and Python `requirements.txt` / `pyproject.toml` projects go through the same code path but have only unit tests so far. Bisect varies npm dependency versions only.
- **Environmental causes only.** Logic bugs, network and data problems are out of scope; replay then reports `NOT REPRODUCED` or `DIFFERENT FAILURE`.
- **Values replay cannot know.** Variables recorded by name only are left unset unless provided with `--env NAME=value`.
- **A kept machine is billed** until it idles out (15 minutes) or `twin gc`. The browser terminal link and password together give a root shell on that machine; share them only with the reporter.

## How it compares

| Tool | What it does | Difference |
|---|---|---|
| `envinfo` | prints versions as text | twin's capsule is replayable, scrubbed, and diffable |
| Dev containers, Codespaces, Nix | give contributors the *maintainer's* environment | twin rebuilds the *reporter's* environment |
| StackBlitz, CodeSandbox | browser repros of a minimal example | twin uses the reporter's actual commit, lockfile, env and time zone, for Node and Python, on a real Linux VM |
| `git bisect` | finds the commit that broke something | twin finds the environment difference, at a fixed commit |
| worldbisect, crux | delta debugging over environment factors on one machine | twin runs across machines and runtimes, starting from a reporter's capture |

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

Every Solari call goes through a small `Backend` interface, so the unit tests run against an in-memory fake and the Docker harness runs the real guest scripts without a key. Layout and design decisions are in [DESIGN.md](DESIGN.md).
