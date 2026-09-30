---
title: MCP server reference
description: The tools twin mcp exposes to AI coding agents, with every argument and default.
sidebar:
  order: 3
---

`twin mcp` is an MCP server over stdio, built on the official `@modelcontextprotocol/sdk`. Setup and a worked example are in [AI agents](../../guides/ai-agents/). The source is [`src/mcp/server.ts`](https://github.com/crypticsaiyan/twin/blob/main/src/mcp/server.ts).

## Running it

```sh
npx -y @crypticsaiyan/twincli mcp
```

| Requirement | |
|---|---|
| Node | 22 or newer |
| `SOLARI_API_KEY` | In the server's environment. Needed by every tool except `inspect`. |
| Transport | stdio. stdout carries the protocol; any other output goes to stderr. |

Client configuration:

```sh
claude mcp add twin -e SOLARI_API_KEY=slr_live_... -- npx -y @crypticsaiyan/twincli mcp
```

```json
{"mcpServers":{"twin":{"command":"npx","args":["-y","@crypticsaiyan/twincli","mcp"],"env":{"SOLARI_API_KEY":"slr_live_..."}}}}
```

The server also sends the client short instructions describing the loop below, so agents that read server instructions know how to use the tools without extra prompting.

## Conventions

- **Capsule arguments** (`capsule`, `compare_to`, `bad`, `good`) are a file path, relative to the server's working directory, or an `https://` URL such as a GitHub issue attachment (`https://github.com/user-attachments/files/…/twin-capsule.json`). URLs are downloaded with a 30 second timeout and a 5 MB size cap.
- **Machine arguments** take a kept machine's id or any unique prefix of it, and can be omitted when only one twin machine is running.
- **Results** are plain text: the same reports the CLI prints, without colors.
- **Errors** come back as tool errors (`isError`) whose text starts with `twin:`, for example `twin: pass exactly one of patch or ref`. The session stays up.
- **Progress.** `replay`, `verify` and `bisect` take a minute or more. They send MCP progress notifications (steps, attempts, trials) when the client asks for them.

## inspect

Summarize a capsule (the reporter's OS, runtimes, package managers, dependencies, repo, env and failure), or list every difference between two capsules. Offline; no key needed. Read-only.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `capsule` | string | yes | | Capsule path or URL. |
| `compare_to` | string | no | | A second capsule to diff against. |

## replay

Rebuild the capsule's environment on a fresh machine and rerun the failing command, like [`twin replay`](../cli/#twin-replay).

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `capsule` | string | yes | | Capsule path or URL. |
| `keep` | boolean | no | `true` | Keep a reproduced failure running for `run` and `write_file`. |
| `attempts` | integer, 1 to 10 | no | `3` | Runs of the command. |
| `env` | object | no | | Values for variables the capsule recorded by name only, e.g. `{"API_URL": "..."}`. |
| `ref` | string | no | capsule's commit | Check out this commit instead. |
| `repo` | string | no | capsule's remote | Clone from this URL instead (forks). |

Returns the replay report with the verdict (`REPRODUCED`, `DIFFERENT FAILURE`, `NOT REPRODUCED`, `FLAKY` or `INCONCLUSIVE`) and the failure signatures. When the failure reproduced and `keep` is true, the report ends with the full machine id:

```text
The machine is still running at the failure, in the reporter's environment:
  machine <id>
Explore and try fixes with run and write_file on this machine, check the final diff with
verify, then release it. It is billed while running and released after 15 minutes idle.
```

## run

Run a shell command line on a kept machine, in the reporter's environment: same environment values, `PATH`, runtimes, time zone and working directory as the failing command.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `machine` | string | no | the only running machine | Kept machine id or unique prefix. |
| `command` | string | yes | | Shell command line, e.g. `npm test -- -t locale`. |
| `timeout_seconds` | integer, 1 to 3600 | no | `300` | Kill the command after this long. |

The command runs through `/tmp/twin/run.sh` on the machine, which loads the replay environment (`/tmp/twin/env.sh`), changes to the failing command's directory and runs the line with `bash -c` (or `sh -c` if bash is missing). The result is a header such as `exit 1 (8.0s)` or `timed out after 300s (300.0s)`, followed by the last 200 lines of output (at most 16,000 characters).

## write_file

Create or overwrite a file on a kept machine.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `machine` | string | no | the only running machine | Kept machine id or unique prefix. |
| `path` | string | yes | | File path. Relative paths resolve against the failing command's working directory (inside the reporter's checkout). Missing directories are created. |
| `content` | string | yes | | Full new file content. |

Returns `wrote <bytes> bytes to <absolute path>`.

## verify

Check a candidate fix in the reporter's environment on a **fresh** machine, like [`twin verify`](../cli/#twin-verify). Leftover state from exploring a kept machine cannot affect it.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `capsule` | string | yes | | Capsule path or URL. Must record a failure. |
| `patch` | string | one of `patch`, `ref` | | Unified diff (`git diff` output) applied on top of the capsule's tree. |
| `ref` | string | one of `patch`, `ref` | | Commit to check out instead, e.g. a pushed fix. |
| `repo` | string | no | capsule's remote | Clone from this URL (forks); use with `ref`. |
| `attempts` | integer, 1 to 10 | no | `3` | Runs of the command. |
| `env` | object | no | | Values for variables the capsule recorded by name only. |

Returns the verify report: `FIXED`, `STILL FAILING`, `DIFFERENT FAILURE`, `FLAKY` or `INCONCLUSIVE`.

## bisect

Given a failing capsule and a passing one from the same commit, find the smallest set of environment differences that causes the failure, like [`twin bisect`](../cli/#twin-bisect). Takes a few minutes.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `bad` | string | yes | | Capsule of the failing environment. |
| `good` | string | yes | | Capsule of an environment where the command passes. |
| `attempts` | integer, 1 to 10 | no | `1` | Runs per trial. |
| `env` | object | no | | Values for variables the good capsule recorded by name only. |

## release

Stop a kept machine, or every twin machine when no id is given. Each kill is confirmed with the Solari gateway.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `machine` | string | no | all twin machines | Kept machine id or prefix. |

Returns `released <ids>` or `no twin machines running`.

## Session end and billing

Kept machines are billed until they are released or have been idle for 15 minutes. When the MCP session ends (the client disconnects or stops the server), the server **releases the machines that session kept** with `replay`. Machines kept by someone else (a `twin replay --keep` from a terminal, or another session) that the agent used are only disconnected, and keep running until their own idle timeout or `twin stop`.
