#!/usr/bin/env bash
# Records every scene from live runs. Live commands: replay, bisect, verify, replay --keep,
# shell --web (5 machine commands). twin stop + twin list always run at the end.
# usage: WORK=<demo-raw> CLONE=<date-fns clone> demo/record-all.sh [suffix]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${WORK:-/home/cryptosaiyan/Documents/solaribuild/demo-raw}"; CLONE="${CLONE:-$W/date-fns}"; SUF="${1:-}"
export PATH="$W/prefix/bin:$PATH"
cleanup() { (. "$W/keyenv.sh"; cd "$W/work/date-fns-2068" && twin stop; twin list); }
trap cleanup EXIT
python3 "$HERE/specs.py" "$W" "$CLONE/pkgs/core"
mkdir -p "$W/raw"
python3 "$HERE/rec.py" "$W/reporter.json" "$W/raw/reporter$SUF.jsonl"
python3 "$HERE/rec.py" "$W/kolk.json" "$W/raw/kolk$SUF.jsonl"
cp "$CLONE/pkgs/core/new-york.json" "$CLONE/pkgs/core/kolkata.json" "$W/work/date-fns-2068/"
python3 "$HERE/rec.py" "$W/maint.json" "$W/raw/maint$SUF.jsonl"
WORK="$W" DEMO_SUFFIX="$SUF" bash "$HERE/scene5.sh"
python3 "$HERE/rec.py" "$W/final.json" "$W/raw/final$SUF.jsonl"
