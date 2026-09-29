---
title: Capsule format
description: The twin capsule (format v1), field by field, with a trimmed real example.
sidebar:
  order: 2
---

A capsule is a JSON file that records one run of one command and the environment it ran in. Every fact in it can be *applied* on replay or *compared* by `inspect` and `bisect`. The source of truth is [`src/capsule/schema.ts`](https://github.com/crypticsaiyan/twin/blob/main/src/capsule/schema.ts), which also holds the decoder that validates every capsule twin reads.

## Versioning

The top-level `twin` field is the format version, currently `1`. It is bumped only for breaking changes. A reader rejects a capsule newer than it understands:

```text
format v2 is newer than this twin understands (v1); upgrade twin
```

## Example

The New York capsule from the [echarts case study](../../examples/echarts-21538/), trimmed where marked (the full file lists 617 installed Node packages and 23 environment entries):

```jsonc
{
  "twin": 1,
  "createdAt": "2026-09-27T20:25:46.262Z",
  "generator": "twin 0.1.0",
  "command": {
    "argv": ["npx", "jest", "--config", "test/ut/jest.config.cjs", "--coverage=false", "test/ut/spec/util/time.test.ts"],
    "cwd": ".",
    "exitCode": 1,
    "signal": null,
    "durationMs": 795,
    "outcome": "fail",
    "failure": {
      "signature": "exit1:0aee0834ac9c4d2d",
      "keyLines": [
        "FAIL test/ut/spec/util/time.test.ts",
        "✕ roundTime_locale",
        "expect(received).toEqual(expected) // deep equality",
        "Expected: 528526800000",
        "Received: 528523200000",
        "Test Suites: 1 failed, 1 total",
        "Tests: 1 failed, 14 passed, 15 total"
      ],
      "outputTail": "FAIL test/ut/spec/util/time.test.ts\n  util/time\n …" // trimmed
    }
  },
  "os": {
    "platform": "linux", "arch": "x64", "release": "7.1.8-arch1-3",
    "distro": "garuda", "distroVersion": null, "libc": "glibc", "libcVersion": "2.44"
  },
  "runtimes": {
    "node": "22.23.3", "bun": "1.3.14", "deno": "2.9.5", "python": "3.14.7",
    "go": "1.26.6", "rustc": "1.97.1", "java": "26.0.2.1", "ruby": "3.4.10"
  },
  "tools": {
    "npm": "10.9.9", "pnpm": "10.20.0", "yarn": "1.22.22", "pip": "26.2.1", "cargo": "1.97.1",
    "git": "2.55.0", "make": "4.4.1", "gcc": "16.2.1", "clang": "22.1.8", "cmake": "4.4.2", "docker": "29.7.2"
  },
  "packageManagers": [
    {
      "name": "npm", "ecosystem": "node", "version": "10.9.9", "declared": null,
      "lockfile": "package-lock.json",
      "lockfileSha256": "93494698b0bb4b27f9a6c7e64d2ee495df56ef3027e36eaaeb6887ae259b5868"
    }
  ],
  "resolved": {
    "node": {
      "@ampproject/remapping": ["2.3.0"],
      "@babel/code-frame": ["7.10.4", "7.26.2"],
      "@babel/compat-data": ["7.26.2"]
      // … 614 more
    }
  },
  "repo": {
    "remote": "https://github.com/apache/echarts",
    "commit": "984bf46b2f905dd0ad909a2d5e6e9d66a1b6568c",
    "branch": "master",
    "dirty": false,
    "diff": "",
    "diffTruncated": false,
    "diffRedacted": false,
    "untracked": []
  },
  "env": {
    "CI": { "state": "absent" },
    "LANG": { "state": "set", "value": "en_US.UTF-8" },
    "NODE_ENV": { "state": "absent" },
    "PATH": { "state": "set" },
    "TZ": { "state": "set", "value": "America/New_York" }
    // … 18 more, all "absent"
  },
  "locale": { "timeZone": "America/New_York", "locale": "en-US" },
  "redaction": { "rulesVersion": 1, "valuesIncluded": ["LANG", "TZ"], "hashedValues": false, "scrubbed": {} }
}
```

## Top level

| Field | Type | Description |
|---|---|---|
| `twin` | integer | Format version. `1`. |
| `createdAt` | string | ISO 8601 time of capture. |
| `generator` | string | The twin version that wrote it, e.g. `twin 0.1.0`. |
| `command` | object | The command and how it ended. |
| `os` | object | Operating system facts. |
| `runtimes` | map of string | Installed runtime versions, keyed by name. Only what was found. |
| `tools` | map of string | Installed tool versions, keyed by name. |
| `packageManagers` | array | Package managers the project uses. |
| `resolved` | object | Installed dependency versions. |
| `repo` | object or `null` | Git state; `null` outside a git work tree. |
| `env` | map of env fact | Environment variables by name. |
| `locale` | object | Time zone and locale the process resolved. |
| `redaction` | object | What redaction did. |

## `command`

| Field | Type | Description |
|---|---|---|
| `argv` | string[] | The command as given after `--`, each argument scrubbed. |
| `cwd` | string | Working directory relative to the repo root (or `.` outside a repo), forward slashes. |
| `exitCode` | integer or `null` | Exit code; `null` when ended by a signal. |
| `signal` | string or `null` | Signal name when ended by one. |
| `durationMs` | number | Wall time of the run. |
| `outcome` | `"pass"` or `"fail"` | `fail` when the exit code was not 0. |
| `failure` | object or `null` | Present when `outcome` is `fail`. |

### `command.failure`

| Field | Type | Description |
|---|---|---|
| `signature` | string | Stable identity of the failure: `exit<code>` (or the signal) and the first 16 hex characters of a SHA-256 of the key lines, e.g. `exit1:0aee0834ac9c4d2d`. |
| `keyLines` | string[] | The normalized lines the signature is computed from: the first 12 lines that look like errors, or the last 8 lines when none do. |
| `outputTail` | string | Interleaved stdout and stderr, last 200 lines (at most 64,000 characters), scrubbed. |

Normalization strips terminal escapes and progress-bar redraws, drops Node's internal stack frames and `Node.js v…` trailers, and replaces times, UUIDs, `0x` addresses, hashes of 12+ hex characters, absolute paths (keeping the last segment), localhost ports, pids and durations with placeholders. That is why the same failure on two machines gets the same signature.

## `os`

| Field | Type | Description |
|---|---|---|
| `platform` | string | Node's `process.platform`: `linux`, `darwin`, `win32`, … |
| `arch` | string | `x64`, `arm64`, … |
| `release` | string | Kernel or OS release. |
| `distro` | string or `null` | Linux `ID` from `/etc/os-release`; `macos` on macOS. |
| `distroVersion` | string or `null` | Linux `VERSION_ID`; `sw_vers -productVersion` on macOS. |
| `libc` | `"glibc"`, `"musl"` or `null` | Linux C library. |
| `libcVersion` | string or `null` | Its version. |

## `runtimes` and `tools`

Found by running version commands with a 10 second timeout each; anything missing is simply absent. Corepack is told not to download or prompt, so probing stays offline.

- **runtimes**: `node`, `bun`, `deno`, `python`, `go`, `rustc`, `java`, `ruby`. For Python projects, `python` is the version of the project's own interpreter (a `.venv` in the project, then `$VIRTUAL_ENV`, then `python3`), not whatever `python3` is on `PATH`.
- **tools**: `npm`, `pnpm`, `yarn`, `pip`, `uv`, `poetry`, `cargo`, `git`, `make`, `gcc`, `clang`, `cmake`, `docker`.

## `packageManagers[]`

Detected from lockfiles between the working directory and the repo root, plus the `packageManager` field in `package.json`. A project can use several (for example pnpm and uv). A `package.json` with no lockfile and no pin is recorded as npm.

| Field | Type | Description |
|---|---|---|
| `name` | string | `npm`, `pnpm`, `yarn`, `bun`, `uv`, `poetry`, `pipenv`, `cargo` or `go`. |
| `ecosystem` | `"node"`, `"python"`, `"rust"`, `"go"` | |
| `version` | string or `null` | Installed version, from the probes. |
| `declared` | string or `null` | Version pinned by `package.json` `packageManager`, when it names this manager. |
| `lockfile` | string or `null` | Lockfile path relative to the repo root. |
| `lockfileSha256` | string or `null` | SHA-256 of the lockfile. |

Lockfiles recognized: `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`, `uv.lock`, `poetry.lock`, `Pipfile.lock`, `Cargo.lock`, `go.sum`.

## `resolved`

| Field | Type | Description |
|---|---|---|
| `node` | map of string[] (optional) | Installed package versions found in every `node_modules` from the working directory up to the repo root, including pnpm's `.pnpm` store. Several versions mean duplicates. Up to 50,000 packages. |
| `python` | map of string (optional) | Installed distributions in the project's Python environment (`pip list`, or `uv pip list` for venvs without pip), names PEP 503 normalized. |

These are what is *installed*, not what the lockfile says, because the two drift and the installed tree is what the failing command ran against.

## `repo`

| Field | Type | Description |
|---|---|---|
| `remote` | string or `null` | URL of `origin`, with any username and password removed. |
| `commit` | string or `null` | `HEAD` SHA. |
| `branch` | string or `null` | Current branch; `null` when detached. |
| `dirty` | boolean | Whether there is a diff or untracked files. |
| `diff` | string | `git diff HEAD --binary` of tracked files (external diff drivers and textconv disabled), scrubbed, at most 200,000 bytes. |
| `diffTruncated` | boolean | The diff was cut at a line boundary to fit. |
| `diffRedacted` | boolean | Scrubbing changed the diff, so it may not apply cleanly on replay. |
| `untracked` | string[] | Untracked file names (not ignored ones), never contents. At most 200. |

## `env`

A map from variable name to an env fact. Every variable in the process environment is listed except session and launcher noise (`SSH_*`, `XDG_*`, `npm_*`, `HOME`, `USER`, `PWD`, `SHLVL`, terminal and desktop session variables, and similar). The allowlisted variables are always listed, as `absent` when unset, because unset-versus-set is itself a difference worth bisecting.

| Field | Type | Description |
|---|---|---|
| `state` | `"set"`, `"empty"`, `"absent"` | |
| `value` | string (optional) | Only for allowlisted variables and those named with `--include-env`. Scrubbed. |
| `hash` | string (optional) | Only with `--salt`: the first 32 hex characters of HMAC-SHA-256 of the value, keyed by the salt. |

The allowlist is in [Privacy](../privacy/).

## `locale`

| Field | Type | Description |
|---|---|---|
| `timeZone` | string or `null` | The IANA zone the process resolved (`Intl.DateTimeFormat().resolvedOptions()`). Replay sets `TZ` to it when the capsule has no explicit `TZ` value. |
| `locale` | string or `null` | The resolved locale, e.g. `en-US`. |

## `redaction`

| Field | Type | Description |
|---|---|---|
| `rulesVersion` | integer | Version of the secret rules that scrubbed this capsule. Currently `2`. |
| `valuesIncluded` | string[] | Variables whose values were recorded. |
| `hashedValues` | boolean | Whether `--salt` was used. |
| `scrubbed` | map of integer | Replacement counts per rule id (e.g. `github-token`, `home-path`) across all captured text. |
