// Builds data.js for player.html from the raw recordings (raw logs are never edited: only
// the playback clock is mapped, and every non-1x stretch carries a visible speed tag).
//
// usage: node build.mjs <workDir> <suffix> <repoRoot>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [work, suffix = '', repo] = process.argv.slice(2);
const raw = (name) =>
  readFileSync(`${work}/raw/${name}${suffix}.jsonl`, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

/** Piecewise clock: segs = [{r0,r1,dur}] in order; returns segs with v0/v1/speed. */
function layout(segs) {
  let v = 0;
  return segs
    .filter((s) => s.r1 - s.r0 > 1e-6)
    .map((s) => {
      const dur = s.dur ?? s.r1 - s.r0;
      const o = { ...s, v0: v, v1: v + dur, speed: (s.r1 - s.r0) / dur };
      v += dur;
      return o;
    });
}
const toV = (segs, r) => {
  for (const s of segs) if (r <= s.r1 + 1e-9) return s.v0 + (Math.max(r, s.r0) - s.r0) / s.speed;
  return segs[segs.length - 1].v1;
};

/** steps: [{name, res: regex source, progress: seconds of video for the progress phase, mark}] */
function terminalScene(logName, steps, opts = {}) {
  const ev = raw(logName);
  const endT = ev[ev.length - 1].t;
  const enters = [];
  const dones = [];
  ev.forEach((e) => {
    if (e.d.includes('\x1b[?2004l')) enters.push(e.t);
  });
  for (const E of enters) {
    const d = ev.find((e) => e.t > E && e.d.includes('\x1b[?2004h'));
    dones.push(d ? d.t : endT);
  }
  const segs = [];
  let prev = 0;
  const marks = [];
  const firstAfter = (t) => ev.find((e) => e.t > t + 0.05 && !e.end);
  steps.forEach((st, k) => {
    const E = enters[k];
    const D = dones[k];
    const nextTyping = enters[k + 1] !== undefined ? firstAfter(D)?.t ?? enters[k + 1] : null;
    segs.push({ r0: prev, r1: E });
    let anchor = D;
    if (st.res) {
      const re = new RegExp(st.res);
      const R = ev.find((e) => e.t >= E && re.test(e.d))?.t ?? E;
      if (st.progress && R - E > st.progress * 1.05) segs.push({ r0: E, r1: R, dur: st.progress, enter: E });
      else segs.push({ r0: E, r1: R });
      anchor = R;
    } else segs.push({ r0: E, r1: D });
    if (st.name) marks.push({ r: D, text: `${st.name} ${Math.round(D - E)} s`, enter: E });
    // Idle time after the result: keep `hold` seconds at 1x, then shorten the rest (tagged).
    const hold = st.hold ?? Infinity;
    const stop = nextTyping ?? endT;
    if (anchor + hold < stop - 0.6) {
      segs.push({ r0: anchor, r1: anchor + hold });
      if (nextTyping !== null) {
        segs.push({ r0: anchor + hold, r1: nextTyping - 0.3, dur: 0.5, enter: anchor + hold });
        prev = nextTyping - 0.3;
      } else prev = endT + 1e6; // last step: drop the idle tail
    } else prev = anchor;
    if (prev > endT + 1e5) return;
  });
  if (prev <= endT + 1e5) segs.push({ r0: prev, r1: endT + (opts.tail ?? 0) });
  const L = layout(segs);
  return {
    events: ev.filter((e) => !e.end).map((e) => ({ v: toV(L, e.t), d: e.d })),
    segs: L.map(({ v0, v1, r0, r1, speed, enter }) => ({ v0, v1, r0, r1, speed, enter })),
    marks: marks.map((m) => ({ v: toV(L, m.r), text: m.text })),
    dur: L[L.length - 1].v1,
  };
}

const scenes = [];
const add = (s) => scenes.push(s);

add({ kind: 'title', dur: 3.0 });
add({ kind: 'issue', dur: 5.6, title: 'the problem', caption: 'Passes for the maintainer. Fails in New York.' });

const rep = terminalScene('reporter', [{ name: null }]);
add({
  kind: 'term', title: 'reporter', label: 'LIVE RUN', caption: 'Nothing is uploaded. Secrets scrubbed. You review it.',
  cols: 128, rows: 30, ...rep, dur: rep.dur + 0.4,
});

const mnt = terminalScene(
  'maint',
  [
    { name: 'replay', res: 'Replay on solari', progress: 2.5, hold: 2.5 },
    { name: 'bisect', res: 'Bisect on solari', progress: 2.5, hold: 2.5 },
    { name: 'verify', res: 'Verify on solari', progress: 2.5, hold: 3.2 },
  ],
);
add({
  kind: 'term', title: 'maintainer', label: 'LIVE RUN',
  caption: 'Rebuild the reporter’s machine. Find the difference. Verify the fix.',
  cols: 128, rows: 30, ...mnt, dur: mnt.dur + 0.4,
});

// Scene 5: three parts under one title, with a single caption.
const keep = terminalScene(
  'keep',
  [
    { name: 'replay --keep', res: 'Replay on solari', progress: 2.5, hold: 2.2 },
    { name: null, res: 'Browser terminal on', progress: 2.0, hold: 4.0 },
  ],
);
add({
  kind: 'term', title: 'browser terminal', label: 'LIVE RUN', caption: 'Share a link. The reporter joins the same machine.',
  cols: 128, rows: 30, ...keep, dur: keep.dur + 0.4, part: 'a',
});

const bdir = `${work}/raw/browser${suffix}`;
const bj = JSON.parse(readFileSync(`${bdir}/frames.json`, 'utf8'));
const evT = Object.fromEntries(bj.events.map((e) => [e.ev, e.t]));
const bsegs = layout([
  { r0: evT['auth-prompt'] - 0.7, r1: evT['auth-submit'] },
  { r0: evT['auth-submit'], r1: evT['typing-start'] - 0.8, dur: (evT['typing-start'] - 0.8 - evT['auth-submit']) / 3, enter: evT['auth-submit'] },
  { r0: evT['typing-start'] - 0.8, r1: evT['result'] + 2.1 },
]);
add({
  kind: 'browser', title: 'browser terminal', label: 'LIVE RUN', caption: 'Share a link. The reporter joins the same machine.',
  url: bj.url, W: bj.W, H: bj.H, dir: bdir,
  frames: bj.frames.map((f) => ({ r: f.t, file: f.file })),
  segs: bsegs.map(({ v0, v1, r0, r1, speed }) => ({ v0, v1, r0, r1, speed })),
  auth: { v0: toV(bsegs, evT['auth-prompt']), v1: toV(bsegs, evT['auth-submit']) },
  dur: bsegs[bsegs.length - 1].v1 + 0.3,
});

const cls = terminalScene('close', [
  { name: null, hold: 1.2 }, { name: null, res: 'Stopped', progress: 1.5, hold: 1.2 }, { name: null, hold: 1.4 },
]);
add({
  kind: 'term', title: 'browser terminal', label: 'LIVE RUN', caption: 'Share a link. The reporter joins the same machine.',
  cols: 128, rows: 30, ...cls, dur: cls.dur + 0.4,
});

// Scene 6: the recorded MCP session, replayed as an animation with shortened waits.
const mcp = readFileSync(`${repo}/examples/echarts-21538/mcp.txt`, 'utf8').replace(/\n+$/, '').split('\n');
const mev = [];
let t = 0;
const emit = (d, dt = 0) => { t += dt; mev.push({ v: t, d }); };
let i = 0;
while (i < mcp.length) {
  const line = mcp[i];
  if (line.startsWith('>>> ')) {
    t += 0.3;
    emit(`\x1b[1m${line}\x1b[22m\r\n`);
    i++;
    continue;
  }
  if (line.startsWith('<<< ')) {
    t += 0.22;
    emit(`\x1b[2m${line}\x1b[22m\r\n`);
    i++;
    continue;
  }
  const isProgress = line.startsWith('  ... ');
  emit(`${line}\r\n`, isProgress ? 0.06 : 0.02);
  i++;
}
add({
  kind: 'term', title: 'agents', label: 'RECORDED SESSION, REPLAYED', caption: 'recorded Claude Code session over MCP',
  cols: 128, rows: 30, events: mev, segs: [{ v0: 0, v1: t + 2.2, r0: 0, r1: (t + 2.2), speed: 1 }], marks: [],
  fixedTag: 'recorded; waits shortened', dur: t + 2.2,
});

// Close: logo, install line and a real `twin list` after `twin stop`.
const fin = terminalScene('final', [{ name: null }]);
add({ kind: 'close', ...fin, cols: 64, rows: 5, dur: 5.6 });

const GAP = 0.2;
let cur = 0;
for (const s of scenes) {
  s.start = cur;
  cur += s.dur + GAP;
}
const total = cur - GAP;
writeFileSync(`${work}/data.js`, `window.DATA=${JSON.stringify({ scenes, total })};`);
console.log(scenes.map((s) => `${s.kind}:${s.part ?? ''} ${s.start.toFixed(1)}+${s.dur.toFixed(1)}`).join('\n'), '\ntotal', total.toFixed(1));
