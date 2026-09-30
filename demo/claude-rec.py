#!/usr/bin/env python3
"""Records a REAL interactive Claude Code session in tmux and logs the pane (with colors) as
timestamped screen snapshots: JSONL {"t","screen","cx","cy"} written only when the pane changes.

usage: claude-rec.py <work> <out.jsonl>
Needs: claude, tmux, and <work>/keyenv.sh (exports SOLARI_API_KEY; the key never touches a file).
Runs in /tmp/twin-demo (neutral path). The MCP config uses ${SOLARI_API_KEY} expansion.
"""
import json, os, random, subprocess, sys, time

W, OUT = sys.argv[1], sys.argv[2]
DIR = "/tmp/twin-demo"
PROMPT = ("This bug report has a twin capsule at /tmp/twin-demo/new-york.json. Reproduce the failure "
          "with twin, find what causes it, fix it and verify the fix. Release the machine when you are done.")
CMD = "claude --model haiku --mcp-config /tmp/twin-demo/mcp.json --strict-mcp-config --allowedTools 'mcp__twin__*'"
TIMEOUT = 900
rnd = random.Random(3)
def sh(*a):
    return subprocess.run(["tmux", *a], capture_output=True, text=True).stdout
os.makedirs(DIR, exist_ok=True)
open(f"{DIR}/tmux.conf", "w").write("set -g focus-events on\nset -g status off\n")
open(f"{DIR}/mcp.json", "w").write(json.dumps({"mcpServers": {"twin": {
    "command": "npx", "args": ["-y", "@crypticsaiyan/twincli", "mcp"],
    "env": {"SOLARI_API_KEY": "${SOLARI_API_KEY}"}}}}))
sh("kill-server")
# the key is exported into the tmux server's environment only, never written or printed
subprocess.run(["bash", "-c", f". {W}/keyenv.sh; export CLAUDE_CODE_HIDE_ACCOUNT_INFO=1; "
                f"tmux -f {DIR}/tmux.conf new-session -d -s cc -x 128 -y 30 -c {DIR} 'bash --norc'"], check=True)
time.sleep(1)
sh("send-keys", "-t", "cc", "PS1='\\W $ '; clear", "Enter")
time.sleep(1.2)

log = []
last = None
t0 = time.time()
def poll():
    global last
    scr = sh("capture-pane", "-e", "-p", "-t", "cc")
    if scr != last:
        cur = sh("display-message", "-p", "-t", "cc", "#{cursor_x} #{cursor_y}").split()
        log.append({"t": round(time.time() - t0, 3), "screen": scr, "cx": int(cur[0]), "cy": int(cur[1])})
        last = scr
def wait(sec):
    end = time.time() + sec
    while time.time() < end:
        poll(); time.sleep(0.1)
def plain():
    import re
    return re.sub(r"\x1b\[[0-9;]*m|\x1b\]8;[^\x1b]*\x1b\\", "", last or "")
def typeit(s):
    for ch in s:
        sh("send-keys", "-t", "cc", "-l", ch); poll(); time.sleep(rnd.uniform(0.02, 0.05))

poll(); wait(0.8)
typeit(CMD); wait(0.4); sh("send-keys", "-t", "cc", "Enter")
for _ in range(200):
    wait(0.2)
    if "❯" in plain() and "Claude Code" in plain(): break
wait(2.0)
typeit(PROMPT); wait(0.6); sh("send-keys", "-t", "cc", "Enter")
seen_tool = False; idle_since = None; perm = 0
while time.time() - t0 < TIMEOUT:
    wait(0.5)
    p = plain()
    if "twin" in p and ("replay" in p or "Called" in p): seen_tool = True
    if "Do you want" in p or "Allow" in p and "Deny" in p:
        perm += 1; print("permission prompt seen", perm); sh("send-keys", "-t", "cc", "Enter"); wait(1)
    import re as _re
    busy = bool(_re.search(r"… \(\d", p)) or "Calling twin" in p or "esc to interrupt" in p
    if seen_tool and not busy:
        idle_since = idle_since or time.time()
        if time.time() - idle_since > 12: break
    else:
        idle_since = None
wait(3.0)
log.append({"t": round(time.time() - t0, 3), "screen": last, "cx": log[-1]["cx"], "cy": log[-1]["cy"], "end": True})
with open(OUT, "w") as f:
    for e in log: f.write(json.dumps(e, ensure_ascii=False) + "\n")
sh("send-keys", "-t", "cc", "/exit", "Enter"); time.sleep(2); sh("kill-server")
print("recorded", len(log), "snapshots", round(time.time() - t0, 1), "s, permission prompts", perm)
