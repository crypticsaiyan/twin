#!/usr/bin/env python3
"""Writes the rec.py spec files into <work>. usage: specs.py <work> <clone>/pkgs/core"""
import json, sys, os
W, CORE = sys.argv[1], sys.argv[2]
MAINT = f"{W}/work/date-fns-2068"
base_env = {"HOME": "/tmp/twin-demo/home", "PATH": f"{W}/prefix/bin:/usr/local/bin:/usr/bin",
            "LANG": "C.UTF-8", "TERM": "xterm-256color", "USER": os.environ.get("USER", "dev")}
key = [f". {W}/keyenv.sh"]   # keyenv.sh exports SOLARI_API_KEY; never printed, never recorded
def dump(name, d):
    json.dump(d, open(f"{W}/{name}.json", "w"), indent=1)
rep = {"cols": 128, "rows": 30, "cwd": CORE, "env": {**base_env, "NO_COLOR": "1"}, "hidden": [],
       "steps": [{"type": "TZ=America/New_York twin capture -o new-york.json -- pnpm vitest run src/eachHourOfInterval/test.ts",
                  "timeout": 90, "answer": {"when": "\\[y/N\\]|\\(y/N\\)|Write", "send": "y\n", "delay": 3.5}}]}
dump("reporter", rep)
kol = json.loads(json.dumps(rep))
kol["steps"] = [{"type": "TZ=Asia/Kolkata twin capture -y -o kolkata.json -- pnpm vitest run src/eachHourOfInterval/test.ts", "timeout": 90}]
dump("kolk", kol)
m = {"cols": 128, "rows": 30, "cwd": MAINT, "env": base_env, "hidden": key}
dump("maint", {**m, "steps": [
    {"type": "twin replay new-york.json", "timeout": 300, "pause": 2.0},
    {"type": "twin bisect new-york.json --good kolkata.json", "timeout": 300, "pause": 2.0},
    {"type": "twin verify new-york.json --patch fix.patch", "timeout": 300, "pause": 3.0}]})
dump("keep", {**m, "hidden": key + ["twin stop; twin list"], "steps": [
    {"type": "twin replay new-york.json --keep", "timeout": 300, "pause": 2.0},
    {"type": "twin shell --web", "timeout": 120, "pause": 3.0}]})
dump("close", {**m, "steps": [{"type": "twin list", "pause": 1.5}, {"type": "twin stop", "timeout": 120, "pause": 1.5},
                             {"type": "twin list", "pause": 2.0}]})
dump("final", {**m, "steps": [{"type": "twin list", "pause": 3.5}]})
