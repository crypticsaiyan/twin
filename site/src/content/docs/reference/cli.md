---
title: CLI reference
description: Every twin command, flag, default and exit code.
sidebar:
  order: 1
---

```text
Usage: twin <command> [options]
```

Run `twin <command> --help` (or `twin help <command>`) for the same details in the terminal; `twin --help` lists the commands grouped by task. A mistyped command gets a suggestion. `twin --version` (or `-v` as the first argument) prints the version. Install with `npm install -g @crypticsaiyan/twincli`; Node 22 or newer.

| Command | Needs `SOLARI_API_KEY` | What it does |
|---|---|---|
| [`capture`](#twin-capture) | no | Run a command and record the environment it ran in. |
| [`inspect`](#twin-inspect) | no | Summarize what a capsule recorded. |
| [`diff`](#twin-diff) | no | List environment differences between two capsules. |
| [`replay`](#twin-replay) | yes | Rebuild a capsule on a Solari sandbox and rerun the command. |
| [`bisect`](#twin-bisect) | yes | Find the minimal environment difference that causes a failure. |
| [`verify`](#twin-verify) | yes | Check a candidate fix in the reporter's environment. |
| [`shell`](#twin-shell) | yes | Open a terminal on a machine kept by `replay --keep`. |
| [`list`](#twin-list) | yes | Show machines twin has running. |
| [`stop`](#twin-stop) | yes | Stop machines twin left running (`gc` still works as an alias). |
| [`mcp`](#twin-mcp) | yes, except `inspect` | Serve twin's tools to AI coding agents over MCP (stdio). |

## Conventions

- Human-facing progress goes to **stderr**; reports go to **stdout**. `--json` output on stdout is therefore safe to pipe.
- Colors are used only when the stream is a terminal, and never when `NO_COLOR` is set or `TERM=dumb`.
- Inside a command, `-v` means `--verbose`. Only as the first argument does it mean `--version`.
- Numeric options (`--attempts`, `--timeout`) must be positive whole numbers.
- `--env` expects `NAME=value` and splits on the first `=`, so values may contain `=`.
- **Capsule arguments** of `inspect`, `replay`, `bisect` (including `--good`) and `verify` are a file path or an `https://` URL, such as a GitHub issue attachment. URLs are downloaded with a 30 second timeout; anything over 5 MB is rejected. Other URL schemes are a usage error (`only https URLs are supported for capsules`).

### Exit codes common to all commands

| Code | Meaning |
|---|---|
| 0 | Success (see each command for what counts). |
| 1 | The command ran and the result was negative, or an error such as an unreadable file or a Solari account error. |
| 2 | Usage error: a bad flag or argument, `SOLARI_API_KEY` not set, or input that cannot be used (for example bisect capsules from different commits). |

`twin` with no arguments prints the usage and exits 2; `twin --help` exits 0.

### Environment variables

| Variable | Used by | Meaning |
|---|---|---|
| `SOLARI_API_KEY` | replay, bisect, verify, list, shell, stop, mcp | Solari API key from [console.getsolari.com](https://console.getsolari.com). Export it, or put `SOLARI_API_KEY=...` in a `.env` file: twin reads it (and `SOLARI_BASE_URL`, nothing else) from the nearest `.env` above the working directory that sets the key. An exported value wins. |
| `SOLARI_BASE_URL` | same | Optional gateway override. Defaults to the SDK's gateway, `https://api.getsolari.com`. |
| `NO_COLOR` | all | Any value disables colored output. |

## twin capture

```text
Usage: twin capture [options] -- <command> [args...]
```

Runs `<command>`, records the environment it ran in, and writes a capsule a maintainer can replay. Nothing is uploaded. You review the capsule before it is written.

| Option | Default | Description |
|---|---|---|
| `-o, --out <file>` | `twin-capsule.json` | Capsule path. |
| `--include-env <name>` | | Also record this variable's value. Repeatable. |
| `--salt <text>` | | Record salted hashes of other variables' values, so a maintainer can compare them without seeing them. |
| `-y, --yes` | off | Write without the review prompt. |
| `-h, --help` | | Show help. |

| Exit | Meaning |
|---|---|
| 0 | Capsule written, whether the command passed or failed. |
| 1 | Declined at the review prompt. |
| 2 | No command given, or not running in a terminal without `--yes`. |
| 127 | Command not found. |
| 130 | Interrupted; no capsule written. |

See [Capture](../../guides/capture/).

## twin inspect

```text
Usage: twin inspect <capsule> [options]
```

Prints a summary of what a capsule recorded: system, runtimes, package manager, commit and diff, environment and the failing command. Capsules can be file paths or https URLs. `twin show` is an alias. Given two capsules, it behaves like `twin diff`.

| Option | Description |
|---|---|
| `--json` | Machine-readable output: the capsule itself. |
| `-h, --help` | Show help. |

Exit `0` on success; `2` for the wrong number of paths; `1` when a file cannot be read or is not a valid capsule. Offline; no key needed.

## twin diff

```text
Usage: twin diff <capsule> <other-capsule> [options]
```

Lists every environment fact that differs between two capsules, such as a failing and a passing run. To find which differences cause the failure, use [`twin bisect`](#twin-bisect).

| Option | Description |
|---|---|
| `--json` | Machine-readable list of differences (`category`, `key`, `a`, `b`). |
| `-h, --help` | Show help. |

Exit `0` on success; `2` unless given exactly two paths; `1` when a file cannot be read or is not a valid capsule. Offline; no key needed.

## twin replay

```text
Usage: twin replay <capsule> [options]
```

Rebuilds the capsule's environment on a fresh Solari sandbox (same runtime, package manager and lockfile, same commit and diff, same env values and time zone), runs the command and reports whether the failure reproduces. Capsules can be file paths or https URLs, such as GitHub issue attachments.

| Option | Default | Description |
|---|---|---|
| `--attempts <n>` | `3` | Runs of the command. |
| `--keep` | off | Keep the machine running at the failure (then: `twin shell`). Only when the verdict is `REPRODUCED`. |
| `--repo <url>` | capsule's remote | Clone from here instead of the capsule's remote. |
| `--ref <sha>` | capsule's commit | Check out this commit instead (skips the diff). |
| `--env <NAME=value>` | | Value for a variable the capsule recorded by name. Repeatable. |
| `--timeout <minutes>` | `15` | Maximum time per attempt. |
| `-v, --verbose` | off | Stream guest output. |
| `--json` | off | Machine-readable report on stdout. |
| `-h, --help` | | Show help. |

Verdicts: `REPRODUCED`, `DIFFERENT FAILURE`, `NOT REPRODUCED`, `FLAKY`, `INCONCLUSIVE` (JSON: `reproduced`, `different-failure`, `not-reproduced`, `flaky`, `inconclusive`).

Exit status: `0` reproduced, `1` anything else, `2` usage error.

See [Replay](../../guides/replay/).

## twin bisect

```text
Usage: twin bisect <failing-capsule> --good <passing-capsule> [options]
```

Finds the smallest set of environment differences (env values, time zone, node version, npm dependency versions, working tree diff) that turns the passing environment into the failing one. Both capsules must come from the same commit. Runs on one Solari sandbox: the passing environment is built once, and each trial applies a subset of differences on that machine. Capsules can be file paths or https URLs, such as GitHub issue attachments.

| Option | Default | Description |
|---|---|---|
| `--good <capsule>` | required | Capsule of an environment where the command passes. |
| `--attempts <n>` | `1` | Runs per trial; raise for flaky commands. |
| `--env <NAME=value>` | | Value for a variable the good capsule recorded by name. Repeatable. |
| `--timeout <minutes>` | `15` | Maximum time per run. |
| `-v, --verbose` | off | Stream guest output. |
| `--json` | off | Machine-readable report on stdout. |
| `-h, --help` | | Show help. |

Results: a minimal failing difference, or `NO CANDIDATES`, `SETUP FAILED`, `BASELINE FAILS`, `NOT REPRODUCED`, `RESET FAILED` (JSON `verdict`: `found`, `no-candidates`, `setup-failed`, `baseline-fails`, `not-reproduced`, `reset-failed`).

Exit status: `0` minimal difference found, `1` otherwise, `2` usage error.

See [Bisect](../../guides/bisect/).

## twin verify

```text
Usage: twin verify <capsule> (--patch <file> | --ref <sha>) [options]
```

Checks a candidate fix in the reporter's environment: rebuilds it on a Solari sandbox like replay, applies the fix, reruns the command and reports whether the captured failure is gone. With `--patch` nothing has to be pushed first. Capsules can be file paths or https URLs, such as GitHub issue attachments.

| Option | Default | Description |
|---|---|---|
| `--patch <file>` | | Unified diff applied on top of the capsule's tree. |
| `--ref <sha>` | | Check out this commit instead (e.g. a fix branch). |
| `--repo <url>` | capsule's remote | Clone from here (forks); use with `--ref`. |
| `--attempts <n>` | `3` | Runs of the command. |
| `--env <NAME=value>` | | Value for a variable the capsule recorded by name. Repeatable. |
| `--timeout <minutes>` | `15` | Maximum time per attempt. |
| `-v, --verbose` | off | Stream guest output. |
| `--json` | off | Machine-readable report on stdout. |
| `--comment <file>` | | Also write a Markdown pull request comment to `<file>`. |
| `-h, --help` | | Show help. |

Exactly one of `--patch` and `--ref` is required. The capsule must record a failing run.

Verdicts: `FIXED`, `STILL FAILING`, `DIFFERENT FAILURE`, `FLAKY`, `INCONCLUSIVE`. In JSON the `verdict` field keeps replay's names (`not-reproduced` is `FIXED`, `reproduced` is `STILL FAILING`).

`--comment <file>` writes the pull request comment the [GitHub Action](../action/) posts. Its first line is a hidden marker, `<!-- twin-verify verdict=<outcome> -->`, where the outcome is `fixed`, `still-failing`, `different-failure`, `flaky` or `inconclusive`. Then a headline, a table (command, the reporter's environment, the checked ref or `patch`, attempts passed, a link to the capsule when it was a URL) and the verify log in a collapsed `<details>` block.

Exit status: `0` fixed, `1` otherwise, `2` usage error.

See [Verify](../../guides/verify/).

## twin shell

```text
Usage: twin shell [machine] [--web]
```

Opens a terminal on a machine kept by `twin replay --keep`, in the reporter's environment (same env, PATH and working directory as the failing command). `[machine]` is the start of its id; it can be left out when only one twin machine is running.

| Option | Description |
|---|---|
| `--web` | Start a browser terminal and print a link plus a password, to share with the reporter. Anyone with both gets a root shell on that machine until it is released. |
| `-h, --help` | Show help. |

Ctrl-] detaches without stopping the machine. It keeps running (and billing) until 15 minutes idle, or until `twin stop`.

Exit `0` after detaching, exiting the shell, or printing the web link. `2` without an interactive terminal (and no `--web`), with more than one machine argument, or when several machines match. `1` when no running twin machine matches or the machine was not kept.

See [Shell](../../guides/shell/).

## twin list

```text
Usage: twin list [--json]
```

Lists machines twin started that are still running (and billing): machines kept with `twin replay --keep`, or leftovers from an interrupted run. Prints a `MACHINE  RUN  STATE` table or `No twin machines running.` `twin ls` is an alias; `--json` prints the list (`id`, `state`, `labels`). Exit `0`.

## twin stop

```text
Usage: twin stop [machine]
```

Stops machines twin started that are still running. Without `[machine]`, stops all of them; with it (the start of an id from `twin list`), only that one. Each stop is confirmed with the gateway, so nothing keeps billing. Prints `Stopped N machines` and their ids, or `No twin machines running.` `twin stop`, the old name, still works. Exit `0`; `1` when no running machine matches; `2` when several do.

## twin mcp

```text
Usage: twin mcp
```

Serves twin's tools to AI coding agents over MCP (stdio): `inspect`, `replay`, `run`, `write_file`, `verify`, `bisect` and `release`. An agent can rebuild the reporter's environment, debug inside it and check its fix there.

Needs `SOLARI_API_KEY` in the server's environment (every tool except `inspect` uses it). For example, in Claude Code:

```sh
claude mcp add twin -e SOLARI_API_KEY=slr_live_... -- npx -y @crypticsaiyan/twincli mcp
```

Machines kept during the session are released when it ends. The server exits with `0` when the client closes the session (or on SIGINT / SIGTERM). You normally do not run it by hand; your agent's client starts it.

See [AI agents](../../guides/ai-agents/) and the [MCP reference](../mcp/).
