# iamkun/dayjs: a `localizedFormat` test that fails west of UTC

No upstream issue was found for this one. It is a found-in-the-wild failure: on `iamkun/dayjs` at `436bde0` (dev, 2026-09-15), `test/plugin/localizedFormat.test.js` fails in any time zone west of UTC and passes elsewhere. `test/plugin/dayOfYear.test.js` fails the same way (same cause: fixtures written as UTC instants read back as local dates); only the first is covered here.

The test formats `new Date(0)` and expects the year `1970`. In `America/New_York` that instant is 1969-12-31 19:00 local, so dayjs correctly prints `1969`.

| File | What it is |
|---|---|
| `new-york.json` | capsule from a reporter in `America/New_York`: the test fails |
| `kolkata.json` | capsule from a maintainer in `Asia/Kolkata`: the test passes |
| `replay.txt` | `twin replay new-york.json` on Solari, recorded 2026-09-29 |
| `bisect.txt` | `twin bisect new-york.json --good kolkata.json` on Solari, recorded 2026-09-29 |
| `fix.patch` | candidate fix for the test |
| `verify.txt` | `twin verify new-york.json --patch fix.patch` on Solari, recorded 2026-09-29 |

Both capsules: Node 26.7.0, npm 12.0.2 (`npm ci` from `package-lock.json`), captured with `LANG=C.UTF-8`, no `LC_*` and `NO_COLOR=1`.

## What happened

Capture, from the repository root:

```sh
npx jest --coverage=false test/plugin/localizedFormat.test.js
```

`TZ=America/New_York` fails (`Expected "1970 l 1970"`, `Received "1969 l 1969"`), `TZ=Asia/Kolkata` passes. `twin diff` shows only the time zone.

| Command | Verdict | Wall time |
|---|---|---|
| `twin replay new-york.json` | REPRODUCED (3 of 3 attempts, same signature) | 46 s |
| `twin bisect new-york.json --good kolkata.json` | minimal difference `TZ=America/New_York` | 44 s |
| `twin verify new-york.json --patch fix.patch` | FIXED (3 of 3 attempts pass) | 45 s |

`fix.patch` builds the date with `new Date(1970, 0, 1, 12)` (local noon) so the year is 1970 in every zone. It passes locally in UTC, New York, Los Angeles, Kolkata, Auckland and Kiritimati. Wall times are the whole command; `npm ci` is about 25 s of that.

## Run it yourself

```sh
export SOLARI_API_KEY=...
twin replay examples/dayjs-localizedformat-tz/new-york.json
twin bisect examples/dayjs-localizedformat-tz/new-york.json --good examples/dayjs-localizedformat-tz/kolkata.json
twin verify examples/dayjs-localizedformat-tz/new-york.json --patch examples/dayjs-localizedformat-tz/fix.patch
```
