---
title: Troubleshooting
description: Account errors, INCONCLUSIVE replays, unknown environment values, leftover machines, and the exact messages twin prints.
sidebar:
  order: 8
---

twin prints expected problems as one line starting with `twin:` and no stack trace. This page lists them by symptom.

## Key and account

**`twin: SOLARI_API_KEY is not set. Get a key at https://console.getsolari.com, then export SOLARI_API_KEY=... or add SOLARI_API_KEY=... to a .env file in this project.`** (exit 2)

replay, bisect, verify, list, shell, stop and the MCP server's sandbox tools need the key. Export it in the shell you run twin from, or add `SOLARI_API_KEY=...` to a `.env` file in the directory you run twin from (or any parent). For the MCP server, pass it with `-e` / `env` in the client configuration, or keep a `.env` in the directory the client starts the server in.

**`twin: Solari refused the request: <message>`** (exit 1)

The Solari gateway rejected the request for an account reason: an invalid key, the plan, credit, a concurrency limit, or no capacity. twin prints the gateway's message. Check the key and balance in the [Solari console](https://console.getsolari.com). For a concurrency limit, release kept machines (`twin stop`) or wait for running ones to finish. Bisect always uses a single machine.

## Capsule problems

| Message | Fix |
|---|---|
| `cannot read <path>: ENOENT` | Wrong path. |
| `cannot download <url>: HTTP 404` | The URL is wrong or not public. Use the attachment link from the issue. |
| `only https URLs are supported for capsules: <url>` | Use an `https://` URL or a local path. |
| `<file> is not valid JSON: …` / `<file> is not a valid twin capsule (…)` | The file is damaged or not a capsule. The message names the offending field. |
| `format vN is newer than this twin understands (v1); upgrade twin` | Run the latest twin (`npx github:crypticsaiyan/twin` fetches it). |
| `the capsule has no git remote; pass --repo <url>` | The reporter's repo has no `origin`. Pass the project's URL. |
| `the capsule has no commit to check out; pass --ref <sha>` | Captured outside a git repo or before the first commit. Pass a commit. |

## INCONCLUSIVE

`INCONCLUSIVE: setup failed or an attempt timed out.` The report marks the failing step with `✗`, its exit code (or `timeout`) and the last 30 lines of its output. Rerun with `-v` to stream everything.

| Failing step | Likely cause | What to do |
|---|---|---|
| `check out <sha>` | The commit is not on the remote: the reporter never pushed it, or it lives on a fork. | Ask the reporter to push, or pass `--repo <fork url>`. For a private repo, the sandbox fetches with no credentials of its own. |
| `install node <version>` | The version has no official Linux tarball for the guest's architecture. | Replay with a close version by editing a copy of the capsule's `runtimes.node`, and say so in the issue. |
| `install <manager> <version>` | The captured package manager version cannot be installed from npm. | Same as above, for `packageManagers[].version`. |
| `install dependencies (npm ci)` | The lockfile is out of sync with `package.json` at that commit plus diff, or a dependency needs a private registry or native build tools the template lacks. | Check the output tail. Private registries are not supported. |
| `apply candidate fix` (verify) | The patch does not apply to the capsule's commit. | Rebase the patch onto the capsule's commit, or push it and verify with `--ref`. |
| an attempt shows `TIMEOUT` | The command ran past `--timeout` (default 15 minutes). | Raise `--timeout`, or capture a narrower command. |

A failed **working-tree diff** step is not fatal: it shows as `!`, the replay continues, and a note says `Optional step failed: apply working-tree diff.` Usually the diff was scrubbed (`diffRedacted`) or truncated. Ask the reporter to commit and push the change, or replay with `--ref`.

## NOT REPRODUCED or DIFFERENT FAILURE

Read the **Notes** section of the report first. The most common causes, in order:

1. **Unknown values.** `N variables were set on the reporter's machine with unknown values and are left unset (…). Provide any that matter with --env NAME=value.` Pick the plausible ones, ask the reporter for non-secret values (or a recapture with `--include-env NAME`), and replay with `--env`.
2. **The OS.** `Captured on darwin (…); replayed on Linux with the same versions.` If it passes on Linux, the cause is likely macOS or Windows specific.
3. **Untracked files.** `N untracked files existed on the reporter's machine (names only, not recreated).` Check the names with `twin inspect`.
4. **A cosmetic difference.** For `DIFFERENT FAILURE`, compare "Key lines here" with "Key lines in capsule". The same bug can print differently on another runtime version.

If you have a passing capsule, [bisect](../../guides/bisect/) narrows it down.

## Bisect stops early

| Result | Meaning |
|---|---|
| `NO CANDIDATES` | Nothing in "Not varied" can be varied. Often the only difference is a variable recorded by name only: recapture with `--include-env` or compare with `--salt`. |
| `BASELINE FAILS` | The good capsule fails on the sandbox too. The cause is something both environments share on Linux, or something the good capsule did not record. |
| `NOT REPRODUCED` | All differences together do not fail the captured way. The cause is outside what the capsules record. Check "Also failing, but not the captured way". |
| `RESET FAILED` | A trial could not be undone (usually a dependency reinstall). Rerun; if it persists, the dependency install is not repeatable at that commit. |

Before starting, bisect refuses capsules from different commits, a bad capsule that passed, or a good capsule that failed (exit 2).

## Shell

| Message | Fix |
|---|---|
| `no twin machine is running; keep one with: twin replay <capsule> --keep` | Replay with `--keep`. It keeps the machine only for `REPRODUCED`. |
| `no running twin machine starts with "<prefix>". Running: …` | Use one of the listed ids. |
| `several twin machines match; pass more of the id: …` | Pass a longer prefix. |
| `` machine <id> was not kept by `twin replay --keep` (no /tmp/twin/shell.sh) `` | The machine is a leftover from another run, not a kept replay. Release it with `twin stop`. |
| `twin shell needs an interactive terminal; use --web for a browser terminal` | Run from a real terminal, or use `--web`. |

## Leftover and zombie machines

See what is still running, then stop everything twin started:

```sh
twin list
twin stop
```

`twin stop` prints `Stopped N machines` and their ids, or `No twin machines running.` Each kill is confirmed with the gateway before it counts.

Solari has been observed to report a successful kill while the sandbox kept running and billing (see [Solari](../solari/)). twin re-kills until `get()` stops reporting the machine as live. If it never goes, twin says so:

```text
sandbox <id>… still reports running after 9 kills; it is billed until it stops, check the Solari console
```

Stop it from the [Solari console](https://console.getsolari.com) and check the ledger. If a replay itself could not release its machine, the report's notes say `` Could not release <id> (…); run `twin stop`. ``

## Capture

| Message | Fix |
|---|---|
| `not running in a terminal; pass --yes to write the capsule without review` | In CI or scripts, add `--yes`. |
| `missing command to run` | Put the command after `--`: `twin capture -- npm test`. |
| `command not found: <name>` (exit 127) | The command is not on `PATH` in that shell. |
| `interrupted; no capsule written` (exit 130) | Ctrl-C during the run. |
| `twin: interrupted, releasing …` (exit 130) | Ctrl-C during `replay`, `bisect` or `verify`. twin kills the machine and waits for Solari to confirm it is gone. Press Ctrl-C again to skip the wait, then run `twin stop`. |
