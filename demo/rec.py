#!/usr/bin/env python3
"""Drive a real interactive bash in a pty, type commands like a person, and log
every byte of output with its timestamp (JSONL: {"t": seconds, "d": text}).

usage: rec.py spec.json out.jsonl

spec: {"cols":128,"rows":24,"env":{...},"cwd":"...",
       "hidden":[ "shell line", ... ],      # run before recording, output dropped
       "steps":[ {"type":"cmd text","wait":"regex or null","timeout":sec,"pause":sec,
                  "answer":{"when":"regex","send":"y\\n"}} ]}
Keys are sent to the pty exactly as typed; nothing in the output is edited.
"""
import json, os, pty, re, select, struct, sys, termios, time, fcntl, codecs, random

spec = json.load(open(sys.argv[1]))
out_path = sys.argv[2]
cols, rows = spec.get("cols", 128), spec.get("rows", 24)
PROMPT = re.compile(r"(^|\n)[\w.~-]* \$ $")
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07")

pid, fd = pty.fork()
if pid == 0:
    os.chdir(spec.get("cwd", os.getcwd()))
    env = dict(spec["env"])
    pass
    os.execvpe("bash", ["bash", "--norc", "--noprofile", "-i"], env)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
dec = codecs.getincrementaldecoder("utf-8")("replace")
buf = ""          # everything since last mark, ANSI stripped, for matching
log = []
t0 = None

def pump(timeout=0.05):
    global buf
    r, _, _ = select.select([fd], [], [], timeout)
    if not r:
        return False
    try:
        data = os.read(fd, 65536)
    except OSError:
        return False
    if not data:
        return False
    s = dec.decode(data)
    if t0 is not None:
        log.append({"t": round(time.time() - t0, 3), "d": s})
    buf += ANSI.sub("", s).replace("\r", "")
    return True

def wait_for(rx, timeout):
    global buf
    end = time.time() + timeout
    rx = re.compile(rx) if isinstance(rx, str) else rx
    while time.time() < end:
        pump(0.05)
        if rx.search(buf):
            return True
    raise SystemExit(f"timeout waiting for {rx.pattern!r}; tail: {buf[-400:]!r}")

def send(s):
    os.write(fd, s.encode())

time.sleep(0.8)
send("PS1='\\W \\$ '\n")
wait_for(PROMPT, 10)
for h in spec.get("hidden", []):
    buf = ""
    send(h + "\n")
    wait_for(PROMPT, spec.get("hidden_timeout", 120))
buf = ""
send("clear\n"); wait_for(PROMPT, 5)
time.sleep(0.3)
while pump(0.1):
    pass
# fresh screen: recording starts here; the first byte replays the clear
t0 = time.time()
send("\x0c")            # ctrl-L: redraw prompt on the cleared screen
buf = ""
wait_for(PROMPT, 5)

rnd = random.Random(7)
for st in spec["steps"]:
    time.sleep(st.get("pre", 0.4))
    for ch in st["type"]:
        send(ch)
        pump(0.001)
        time.sleep(rnd.uniform(0.025, 0.060))
    time.sleep(0.35)
    buf = ""
    send("\n")
    ans = st.get("answer")
    if ans:
        wait_for(ans["when"], st.get("timeout", 60))
        time.sleep(ans.get("delay", 2.5))
        send(ans["send"])
        buf = buf[-0:]
    wait_for(st["wait"] if st.get("wait") else PROMPT, st.get("timeout", 300))
    # drain trailing output
    end = time.time() + 0.4
    while time.time() < end:
        pump(0.05)
    time.sleep(st.get("pause", 1.0))
    while pump(0.05):
        pass
    if st.get("after_wait"):
        pass
with open(out_path, "w") as f:
    for e in log:
        f.write(json.dumps(e, ensure_ascii=False) + "\n")
    f.write(json.dumps({"t": round(time.time() - t0, 3), "d": "", "end": True}) + "\n")
send("exit\n")
time.sleep(0.2)
print("recorded", len(log), "chunks", round(time.time() - t0, 1), "s")
