---
title: Limits
description: What twin does not do, stated plainly.
sidebar:
  order: 7
---

## Platforms

- **Replay is Linux only.** Solari sandboxes are Linux microVMs. A macOS or Windows capsule is replayed with the same runtime and dependency versions on Linux, and the report says so. If it passes there, the difference is likely the OS; that is a finding, not a failure.
- **x86_64 and arm64 guests.** Node and ttyd are downloaded as prebuilt binaries for those two architectures.
- **musl is not reproduced.** A capsule captured on musl libc (for example Alpine) is replayed on glibc, with a note.

## Ecosystems

- **Node and Python projects.** Verified end to end on Solari: npm projects, pnpm projects (date-fns) and uv projects (click). Yarn (classic and Berry) and Bun projects, and Python `requirements.txt` / `pyproject.toml` projects, go through the same code path but have only unit tests so far.
- **Other runtimes are recorded, not installed.** Go, Rust, Java, Ruby, Deno and Bun versions appear in the capsule and in `inspect` diffs, but replay installs only Node and Python. Commands that need the others rely on what the `base` template ships.
- **Package managers other than npm, pnpm, Yarn and Bun** (for Node) are noted as unsupported, and dependencies are not installed for them.

## Sandbox size

- **Sandboxes are small:** about 2 GB of RAM, no swap and a 3.9 GB disk. A very large install (a big monorepo's `yarn install`, measured on mantine) can hit the guest's out-of-memory killer, which ends the sandbox's agent and drops the connection. twin then says it lost the connection, releases the machine, and suggests replaying a smaller workspace. Ordinary projects are fine, and a silent 100 second command does not drop the connection.

## What replay can copy

- **Values it does not know stay unset.** Variables recorded by name only are left unset unless you pass `--env NAME=value`. The report lists them.
- **Untracked files are names only** and are not recreated.
- **The diff can be imperfect.** It is capped at 200 KB, and scrubbing secrets out of it can stop it from applying. Both cases are noted; applying the diff is an optional step.
- **The commit must be fetchable by SHA** from the capsule's remote (or `--repo`). GitHub and GitLab allow fetching a commit by its full SHA. twin adds no credentials of its own.
- **Caches, global config and services** (a local database, `~/.npmrc`, a running daemon) are not recorded.

## Bisect

- Varies environment values, the time zone, the Node version, npm dependency versions and the working-tree diff.
- **Dependency versions are varied for npm projects only.** Python dependencies, package manager versions, build tools, other runtimes and the OS are listed as "not varied".
- Both capsules must come from the same commit.
- The result is the smallest set of *recorded* differences that flips the outcome, not a proof of root cause.
- A version-range sweep ("fails on node >= 22.3.0") is not built.

## Scope

- **Environmental causes only.** Logic bugs, network and data problems are out of scope; replay then reports `NOT REPRODUCED` or `DIFFERENT FAILURE`.
- **One command.** A capsule records one run of one command. Replay runs it non-interactively, so a command that waits for keyboard input will not get any.
- Web-app bugs (through a browser session) and GUI bugs (through a desktop) are not built. Neither is a CI mode that builds a capsule from a GitHub Actions job log.

## Cost and exposure

- **A kept machine is billed** until it has been idle for 15 minutes, or until `twin stop` (or MCP `release`).
- **The browser terminal is a root shell.** `twin shell --web` prints a link and a password; together they give a root shell on that machine until it is released. Share them only with the reporter.
- **Redaction is pattern based.** Review a capsule before posting it publicly.
