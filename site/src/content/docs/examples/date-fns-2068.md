---
title: "Case study: date-fns#2068"
description: "An hour missing when clocks go back: reproduced, bisected and fix-verified on Solari with pnpm."
sidebar:
  order: 2
---

[date-fns/date-fns#2068](https://github.com/date-fns/date-fns/issues/2068) (open when this was recorded) reports that `eachHourOfInterval` returns one hour too few when the interval spans the night the clocks go back. It only shows in time zones with daylight saving time, so UTC machines and CI never see it.

| File | What it is |
|---|---|
| `new-york.json` | capsule from a reporter in `America/New_York`: the regression test fails |
| `kolkata.json` | capsule from a maintainer in `Asia/Kolkata`: the same test passes |
| `replay.txt` | `twin replay new-york.json` on Solari, recorded 2026-09-29 |
| `bisect.txt` | `twin bisect new-york.json --good kolkata.json` on Solari, recorded 2026-09-29 |
| `fix.patch` | a candidate fix for `pkgs/core/src/eachHourOfInterval/index.ts` |
| `verify.txt` | `twin verify new-york.json --patch fix.patch` on Solari, recorded 2026-09-29 |

Both capsules are from date-fns commit `717ce0a` (main), Node 26.7.0, pnpm 10.20.0. The regression test is present as an uncommitted change, so it travels inside the capsule's working-tree diff (`fix.patch` only touches the source file).

## What happened

**Capture.** Run from `pkgs/core`, the same command under two time zones, with `LANG=C.UTF-8`, no `LC_*` variables and `NO_COLOR=1`:

```sh
pnpm vitest run src/eachHourOfInterval/test.ts
```

`TZ=America/New_York` fails (one entry missing, `1604210400000`); `TZ=Asia/Kolkata` passes. `twin diff kolkata.json new-york.json` shows only the time zone.

**Replay (32 s wall).** twin rebuilt the environment on a fresh Solari sandbox: Node 26.7.0, the commit fetched by SHA, the working-tree diff applied, pnpm 10.20.0, `pnpm install --frozen-lockfile`, and `TZ=America/New_York`. All three attempts failed with the capsule's signature: `REPRODUCED`.

**Bisect (32 s wall).** twin built the Kolkata environment (20 s), confirmed it passes, applied the failing environment's differences and reported the minimal one: `TZ=America/New_York`.

**Verify (32 s wall).** The function advances with `date.setHours(date.getHours() + step)`. On the night of a fall back, one local hour occurs twice and this call resolves to its first occurrence, so the second one is never produced. `fix.patch` steps by elapsed time instead (`date.setTime(+date + step * millisecondsInHour)`) and re-aligns to the hour start for zones whose DST shift is not a whole hour. twin applied it on a fresh sandbox at the captured commit: 3 of 3 attempts passed, `FIXED`.

Wall times are the whole `twin` command, measured around it. Setup is dominated by `pnpm install` (12 to 14 s).

## Honest notes

- An open pull request, date-fns/date-fns#4140, covers the same function. This example shows the twin workflow, not a claim of a new fix.
- Capture used `NO_COLOR=1`. Without it, replay printed `DIFFERENT FAILURE` with an identical assertion: vitest prints the project name as `|main|` when it sees no color support (the local, piped capture) and as `main` otherwise (the sandbox run), so the signatures differed.

## Run it yourself

```sh
export SOLARI_API_KEY=...
twin replay examples/date-fns-2068/new-york.json
twin bisect examples/date-fns-2068/new-york.json --good examples/date-fns-2068/kolkata.json
twin verify examples/date-fns-2068/new-york.json --patch examples/date-fns-2068/fix.patch
```

Every file referenced here is in [`examples/date-fns-2068`](https://github.com/crypticsaiyan/twin/tree/main/examples/date-fns-2068).
