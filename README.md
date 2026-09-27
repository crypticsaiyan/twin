# twin

> Working name.

Turns "fails on my machine" into something a maintainer can run.

A reporter runs one command. twin runs their failing command, records the environment it ran in (OS, runtimes, package managers, installed dependency versions, git state, env var names, time zone, locale), strips secrets, and writes a small JSON **capsule** to attach to the issue. Nothing is uploaded.

A maintainer replays the capsule on a [Solari](https://getsolari.com) sandbox: same runtime, package manager, lockfile, commit, diff, env values and time zone, on a clean Linux machine. Given a passing capsule too, `twin bisect` finds the smallest set of differences (env values, time zone, node version, npm dependency versions, working tree diff) that turns pass into fail. See [DESIGN.md](DESIGN.md).

## Status

| Command | State |
|---|---|
| `twin capture -- <cmd>` | works |
| `twin inspect <capsule> [<other>]` | works |
| `twin replay <capsule>` | works (verified live on Solari) |
| `twin gc` | works |
| `twin bisect <bad> --good <good>` | works (verified live on Solari) |
| `twin ci`, `twin verify`, `twin shell` | planned |

## Usage

Requires Node 22 or newer.

```sh
# Reporter: run the failing command through twin, review, write twin-capsule.json
twin capture -- npm test

# Anyone: summarize a capsule, or list every difference between two
twin inspect twin-capsule.json
twin inspect good.json bad.json

# Maintainer: rebuild the reporter's environment on a Solari sandbox and rerun
export SOLARI_API_KEY=...
twin replay twin-capsule.json            # REPRODUCED / DIFFERENT FAILURE / NOT REPRODUCED / FLAKY
twin replay twin-capsule.json --keep     # keep the machine at the failure
twin gc                                  # release anything twin left running

# Maintainer: which difference between a passing and a failing environment breaks it?
twin bisect twin-capsule.json --good my-capsule.json
#   Minimal failing difference:
#     TZ=Asia/Calcutta
```

Capture options:

| Option | Effect |
|---|---|
| `-o, --out <file>` | capsule path (default `twin-capsule.json`) |
| `--include-env <name>` | also record this variable's value (repeatable) |
| `--salt <text>` | record salted hashes of other variables' values, so two capsules made with the same salt can be compared without revealing values |
| `-y, --yes` | skip the review prompt (required when not in a terminal) |

## What a capsule contains, and what it never does

- **Env vars: names only.** Values are kept only for a short allowlist of behavior-changing, non-secret variables (`NODE_ENV`, `TZ`, `LANG`, `LC_*`, `CI`, `NODE_OPTIONS`, ...) or ones you name with `--include-env`.
- **Output tail, git diff, argv and kept env values are scrubbed**: private keys, cloud and SaaS tokens (GitHub, AWS, Stripe, Slack, npm, Google, OpenAI/Anthropic, Solari), JWTs, bearer tokens, URL credentials, `password=`-style assignments and random-looking strings. Home directory paths become `~`. The capsule records how many replacements each rule made.
- **Untracked files: names only**, never contents. Git remotes lose embedded credentials.
- You see a summary before anything is written and can view the full JSON.

Redaction is pattern based. Review the capsule before posting it publicly.

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

Layout and design decisions are in [DESIGN.md](DESIGN.md).
