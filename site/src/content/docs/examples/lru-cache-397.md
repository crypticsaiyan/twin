---
title: "Case study: lru-cache#397"
description: "A buried package version breaks a fresh install: 33 packages differ, bisect isolates the one."
sidebar:
  order: 5
---

[isaacs/node-lru-cache#397](https://github.com/isaacs/node-lru-cache/issues/397) (fixed in 11.3.2, the day it was opened) reports that `lru-cache@11.3.0` has a top-level `await` in its ESM build. Anything that `require()`s it, such as `jsdom`, throws `ERR_REQUIRE_ASYNC_MODULE`. Reporters used jsdom, vitest and mocha. The project replayed here is [cure53/DOMPurify](https://github.com/cure53/DOMPurify) at commit `883ac15`, whose jsdom tests reach `lru-cache` through `jsdom` and `@asamuzakjp/dom-selector`.

The story: an install from the committed lockfile passes. A fresh install on 2026-04-06 resolved `lru-cache@11.3.0` and failed, so a maintainer and a user see different results from the same commit.

| File | What it is |
|---|---|
| `good.json` | `npm ci` from the committed lockfile: `npm run test:jsdom` passes |
| `bad.json` | a fresh install of what npm resolved that morning: the same command fails with `ERR_REQUIRE_ASYNC_MODULE` |
| `bisect.txt` | `twin bisect bad.json --good good.json` on Solari |
| `replay.txt` | `twin replay bad.json` on Solari: `NOT REPRODUCED`, see below |
| `verify.txt` | `twin verify bad.json --patch <placeholder>` on Solari: `INCONCLUSIVE`, see below |

Both capsules are from the same commit, with Node 24.15.0 and npm 11.12.1, and 705 installed Node packages each. `twin diff good.json bad.json` lists 33 packages whose version differs.

## How the capsules were made

```sh
# good: the maintainer's install, from the lockfile
npm ci
twin capture --yes -- npm run test:jsdom

# bad: a fresh install, as it resolved just after lru-cache@11.3.0 was published
rm -rf node_modules
npm install --no-package-lock --before=2026-04-06T01:00:00Z
twin capture --yes -- npm run test:jsdom
```

## What happened

**Bisect (245 s wall, 10 trials).** twin built the good environment (22 s), then applied the failing side's package versions on top of it. Candidates: 32 (`picomatch` was not varied, because several new copies of it are installed). Applying all 32 fails; halving found that `lru-cache@11.3.0` alone fails and the good environment passes:

```text
Minimal failing difference:
  lru-cache@11.3.0
```

The tree holds five copies of `lru-cache`, one per dependent (versions 4, 5, 6, 7 and 11). Only the new 11.3.0 copy differs from the lockfile install, and twin varies that one. No test names this package, so nothing in the failure would lead there without the comparison.

## Honest notes

- **Replay cannot reproduce this failure.** `twin replay bad.json` installs from the repository's committed lockfile, so it passes (`NOT REPRODUCED`, 3 of 3 attempts, `replay.txt`). Only bisect applies the package versions the capsule recorded.
- **Verify refuses to call this fixed.** `twin verify` first runs the command once without the fix. Here that run passes, so the verdict is `INCONCLUSIVE`, not `FIXED` (`verify.txt`, run with a placeholder patch that was never applied). A pass with the fix would prove nothing.
- **The fix is upstream.** `lru-cache` 11.3.2 removed the top-level `await`. This example shows finding the cause, not a patch.
- **The reporters were not DOMPurify's.** The issue's reporters ran into it with other jsdom-based test setups. DOMPurify is the project replayed here because its lockfile and jsdom tests make the drift reproducible.
- **The fresh install is date pinned.** `npm install --before=<date>` reproduces what npm resolved at that time; it is not a capture from a reporter's real machine.
- Capture recorded environment variable names only, so `bad.json` lists names such as `CLAUDECODE` from the machine that captured it, with no values.

## Run it yourself

```sh
export SOLARI_API_KEY=...
twin diff examples/lru-cache-397/good.json examples/lru-cache-397/bad.json
twin bisect examples/lru-cache-397/bad.json --good examples/lru-cache-397/good.json
```

Bisect takes about 4 minutes and one Solari machine.

Every file referenced here is in [`examples/lru-cache-397`](https://github.com/crypticsaiyan/twin/tree/main/examples/lru-cache-397).
