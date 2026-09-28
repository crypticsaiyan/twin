---
title: How twin uses Solari
description: The Solari primitives twin uses and why, what it costs, and platform behavior measured while building it.
sidebar:
  order: 6
---

The core requirement is that two different people share one exact machine: the reporter's environment, rebuilt, that the maintainer (or an agent, or CI) can run and open. That cannot happen on either person's laptop. [Solari](https://getsolari.com) sandboxes are disposable Linux microVMs with a streaming control channel, which is what twin needs.

Every Solari call goes through a small `Backend` interface in [`src/backend/solari.ts`](https://github.com/crypticsaiyan/twin/blob/main/src/backend/solari.ts), using `@solarisdk/sdk` 0.1.4. Unit tests run against an in-memory fake, and a development Docker harness runs the real guest scripts without a key.

## Primitives

| Need | Solari primitive | Notes |
|---|---|---|
| A clean Linux machine per replay, bisect or verify | `sandboxes.create` with template `base`, run-scoped `metadata`, and a rolling `idleTimeoutMs` | Every machine carries `metadata.app = "twin"` and a `run` id. Idle timeout 15 minutes (20 for bisect). |
| Setup steps and the command, streamed, with a real timeout | `sandbox.connect()`, `commands.start` + `onData`, `wait()`, and `kill(9)` on twin's own timer | The streaming path has no server-side timeout, so twin enforces one and kills the guest process when it fires. |
| Upload the reporter's diff and a candidate fix | `files.write` | Diff applied in the guest with `git apply`. |
| Recover from a dropped control channel | `reconnect()` | A `ConnectionError` while starting a command is retried up to 4 times with a reconnect; the command never reached the guest, so it cannot run twice. |
| A local shell at the failure point | `pty.create` | `twin shell`; the PTY has no exit event, so the guest script prints an invisible marker when the shell ends. |
| A browser shell to share | `previewUrl(7681)` in front of ttyd in the guest, behind basic auth | `twin shell --web`. |
| Re-attach later from any computer, then let go | `sandboxes.connect(id)`, then `close()` | `close()` detaches without releasing the machine. |
| Never leak billing machines | `kill()` confirmed with `sandboxes.get()`, repeated until gone; `sandboxes.listAll({ metadata })` | `twin stop` and MCP `release` reap by metadata. |

Commands are not shell-interpreted by the sandbox: twin passes argv explicitly and uses `sh -c` only for scripts it builds itself.

## Configuration

| Variable | Meaning |
|---|---|
| `SOLARI_API_KEY` | Required for every command that creates or reaches a sandbox. From [console.getsolari.com](https://console.getsolari.com). |
| `SOLARI_BASE_URL` | Optional gateway override; the default is `https://api.getsolari.com`. |

## Cost

From the account ledger: about **$0.125 per sandbox-hour**. A replay, bisect or verify of the echarts example takes about 70 seconds, a fraction of a cent. Bisect runs every trial on one machine, so it needs a single concurrent slot.

The expensive mistake is a machine left running. A kept machine is billed until it has been idle for 15 minutes or is released. twin keeps a machine only when asked (`--keep`, or the MCP `replay` default), and the MCP server releases the machines a session kept when that session ends.

## Measured on the platform

These were measured live on 2026-09-28 (SDK 0.1.4, template `base`) while building twin. They are written up in [DESIGN.md §11](https://github.com/crypticsaiyan/twin/blob/main/DESIGN.md).

### Timings

| Measured | Result |
|---|---|
| End-to-end `twin replay` of a small npm project (create, setup, 2 attempts, kill) | 43 s |
| Node tarball download and extract from nodejs.org | 2.3 to 2.5 s |
| `git fetch --depth 1` of one commit by SHA | 0.8 s |
| `npm install -g npm@<version>` | 3.5 s |
| `npm ci` for apache/echarts | about 46 s |
| `snapshot()` of a running sandbox with `node_modules` | 28.4 s and 34.7 s (docs suggest about 1 s) |
| `revert()` in place | 21.7 s and 14.2 s |
| Bisect trials that only change env, time zone or Node version | 0.3 to 0.7 s each |

The `base` template has `sh`, `curl`, `tar`/gzip and `git`; outbound HTTPS to nodejs.org, GitHub and the npm registry works and is fast; official Node binaries run. The guest runs as root. Sandbox ids are opaque strings of about 200 characters, so twin prints short prefixes.

### Behavior worth knowing

1. **`kill()` is not always effective.** Two sandboxes stayed `running` and kept billing for about two hours after `kill()` and two later `DELETE`s all returned success. Their 15-minute idle timeout did not stop them either; `expiresAt` kept moving forward. A later plain `DELETE` removed both within 16 s. twin now confirms every kill with `get()`, re-kills until the sandbox is gone (up to 8 checks, 5 s apart), and fails loudly if it never goes.
2. **Listings lag.** `listAll({ metadata })` keeps returning sandboxes as live for several minutes after a successful kill. twin checks each listed sandbox with `get()` before counting it, and treats a 404 as already gone.
3. **Snapshots are slow.** Snapshot and revert take tens of seconds, not about one second.
4. **`revert()` consumes the snapshot.** `getSnapshot` returns 404 right after the first revert, and a second revert fails with `Snapshot not found`. In one run even the first revert failed with `Snapshot not found` while `listSnapshots` still listed it.
5. **The control channel drops after revert.** The first command after `reconnect()` can still fail (`Not connected` or `Control channel closed (1005)`) while the guest finishes restoring.
6. **Snapshot listings are stale.** Consumed or deleted snapshots keep appearing, and consecutive calls return different sets.
7. **Snapshot storage.** Each snapshot with `node_modules` is about 4 GB, billed from 2026-10-01 above 10 GB, and nothing deletes it automatically.

Because of 3 to 5 and 7, bisect uses no snapshots: it undoes each trial in place, and a kept machine is the machine itself rather than a snapshot of it.

`pty.create` and `previewUrl` both work well for interactive use: a ttyd browser terminal behind basic auth answered through the preview proxy (401 without the password, a working WebSocket session with it).
