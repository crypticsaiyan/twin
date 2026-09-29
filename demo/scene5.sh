#!/usr/bin/env bash
# Scene 5: replay --keep + shell --web in a terminal, then a real headless Chrome on the link,
# then twin list / twin stop / twin list. Cleans up (twin stop) even on failure.
# env: DEMO_WORK (scratch dir with keep.json, close.json, work/), DEMO_SUFFIX (raw file suffix)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${DEMO_WORK:?}"; SUF="${DEMO_SUFFIX:-}"
export PATH="$W/prefix/bin:$PATH"
cleanup() { (. "$W/keyenv.sh"; cd "$W/work/date-fns-2068" && twin stop >/dev/null 2>&1; twin list); }
trap cleanup EXIT
python3 "$HERE/rec.py" "$W/keep.json" "$W/raw/keep$SUF.jsonl" || exit 1
read -r URL USER PASS < <(python3 - "$W/raw/keep$SUF.jsonl" <<PY
import json,re,sys
t="".join(json.loads(l)["d"] for l in open(sys.argv[1]))
t=re.sub(r"\x1b\[[0-9;?]*[A-Za-z]","",t)
url=re.search(r"https://\S+",t.split("twin shell --web",1)[1]).group(0)
pw=re.search(r"password\s+(\S+)",t).group(1)
us=re.search(r"user\s+(\S+)",t).group(1)
print(url,us,pw)
PY
)
node "$HERE/browser.mjs" "$URL" "$USER" "$PASS" "$W/raw/browser$SUF" "pnpm vitest run src/eachHourOfInterval/test.ts"
python3 "$HERE/rec.py" "$W/close.json" "$W/raw/close$SUF.jsonl"
