// Builds data.js for player.html from the raw recordings. Raw logs are never edited: only the
// playback clock is mapped, and every non-1x stretch carries a visible speed chip with its real total.
//
// usage: node build.mjs <workDir> <repoRoot>
// Raw inputs (in <workDir>/raw): see RAW below. Site frames in <workDir>/site.
import { readFileSync, writeFileSync } from 'node:fs';

const [work, repo] = process.argv.slice(2);
const RAW = {
  reporter: 'reporter-v4', maint: 'maint-v3', keep: 'keep-v3', browser: 'browser-v3',
  close: 'close-v3', final: 'final-v3', claude: 'claude-v4b',
};
const readLog = (name) =>
  readFileSync(`${work}/raw/${name}.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

/** Piecewise clock: segs = [{r0,r1,dur?,real?}] in order; adds v0, v1, speed. */
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
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const SEGK = ['v0', 'v1', 'r0', 'r1', 'speed', 'real'];

/** A recorded pty session: steps = [{name, res, progress, hold}] (one per typed command). */
function session(logName, steps, opts = {}) {
  const ev = readLog(logName);
  const endT = ev[ev.length - 1].t;
  const enters = ev.filter((e) => e.d.includes('\x1b[?2004l')).map((e) => e.t);
  const dones = enters.map((E) => ev.find((e) => e.t > E && e.d.includes('\x1b[?2004h'))?.t ?? endT);
  const firstAfter = (t) => ev.find((e) => e.t > t + 0.05 && !e.end);
  const segs = [];
  const marks = [];
  const raws = [];
  let prev = 0;
  steps.forEach((st, k) => {
    const E = enters[k];
    const D = dones[k];
    const nextTyping = enters[k + 1] !== undefined ? firstAfter(D)?.t ?? enters[k + 1] : null;
    segs.push({ r0: prev, r1: E });
    let anchor = D;
    let R = D;
    if (st.res) {
      const re = new RegExp(st.res);
      R = ev.find((e) => e.t >= E && re.test(e.d))?.t ?? E;
      if (st.progress && R - E > st.progress * 1.05) segs.push({ r0: E, r1: R, dur: st.progress, real: D - E });
      else segs.push({ r0: E, r1: R });
      anchor = R;
    } else segs.push({ r0: E, r1: D });
    if (st.name) marks.push({ r: D, text: `${st.name} ${Math.round(D - E)} s` });
    const hold = st.hold ?? Infinity;
    const stop = nextTyping ?? endT;
    let cut = false;
    if (anchor + hold < stop - 0.6) {
      segs.push({ r0: anchor, r1: anchor + hold });
      if (nextTyping !== null) {
        segs.push({ r0: anchor + hold, r1: nextTyping - 0.3, dur: 0.5, idle: true });
        prev = nextTyping - 0.3;
      } else cut = true;
    } else prev = anchor;
    raws.push({ E, R, D, B: nextTyping !== null ? nextTyping - 0.3 : null });
    if (cut) prev = null;
  });
  if (prev !== null) segs.push({ r0: prev, r1: endT + (opts.tail ?? 0) });
  const L = layout(segs);
  const info = raws.map((x) => ({ vE: toV(L, x.E), vR: toV(L, x.R), vD: toV(L, x.D), vB: x.B === null ? L[L.length - 1].v1 : toV(L, x.B) }));
  return {
    ev, L, info,
    events: ev.filter((e) => !e.end).map((e) => ({ v: toV(L, e.t), d: e.d })),
    segs: L.map((g) => pick(g, SEGK)),
    marks: marks.map((m) => ({ v: toV(L, m.r), text: m.text })),
    dur: L[L.length - 1].v1,
    vOf: (re) => { const e = ev.find((x) => re.test(x.d)); return e ? toV(L, e.t) : 0; },
  };
}

/** Cut a session to the video interval [vA, vB]. Earlier output is drawn at once (pre). */
function slice(sess, vA, vB) {
  const pre = sess.events.filter((e) => e.v < vA - 1e-9).map((e) => e.d).join('');
  const events = sess.events.filter((e) => e.v >= vA - 1e-9 && e.v <= vB + 1e-9).map((e) => ({ v: e.v - vA, d: e.d }));
  const segs = [];
  for (const g of sess.segs) {
    if (g.v1 <= vA + 1e-9 || g.v0 >= vB - 1e-9) continue;
    const a = Math.max(g.v0, vA);
    const b = Math.min(g.v1, vB);
    segs.push({ ...g, v0: a - vA, v1: b - vA, r0: g.r0 + (a - g.v0) * g.speed, r1: g.r0 + (b - g.v0) * g.speed });
  }
  const marks = sess.marks.filter((m) => m.v <= vB + 1e-9).map((m) => ({ v: Math.max(0, m.v - vA), text: m.text }));
  return { pre, events, segs, marks, dur: vB - vA };
}

const scenes = [];
const add = (s) => scenes.push(s);
const term = (title, label, sc, extra) => add({ kind: 'term', title, label, cols: 128, rows: 30, ...sc, ...extra });
const card = (t0, dur, status, text, tone) => ({ t0, t1: Math.min(dur - 0.05, t0 + 3.0), status, text, tone });
const strip = (num, verb, text) => add({ kind: 'strip', num, verb, text, dur: 1.8 });

// ---- 1. explainer (drawn in player.html) ----
add({ kind: 'explain', title: 'what twin does', dur: 22.6 });

// ---- 2. capture ----
strip(1, 'Capture', 'the reporter records the failing environment');
const rep = session(RAW.reporter, [{ name: null }]);
{
  const tWrote = rep.vOf(/Wrote new-york/);
  const tWrite = rep.vOf(/Write new-york/);
  const tCmd = rep.vOf(/Command\r?\n/);
  const dur = tWrote + 3.0;
  const last = rep.segs[rep.segs.length - 1];
  last.v1 = dur; last.r1 = last.r0 + (dur - last.v0) * last.speed;
  term('capture', 'LIVE RUN', { ...rep, dur }, {
    caps: [
      { t: 0, text: 'The reporter runs the failing test through twin capture.' },
      { t: tCmd - 0.2, text: 'twin lists exactly what it recorded. Secrets are scrubbed.' },
      { t: tWrite, text: 'The reporter reviews it and says yes. Nothing is uploaded.' },
    ],
    card: card(tWrote + 0.2, dur, 'Captured', 'a small file with the environment. Nothing left the machine.', 'neutral'),
  });
}

// ---- 3. maintainer: replay, bisect, verify ----
const mnt = session(RAW.maint, [
  { name: 'replay', res: 'Replay on solari', progress: 2.5, hold: 3.2 },
  { name: 'bisect', res: 'Bisect on solari', progress: 2.5, hold: 3.2 },
  { name: 'verify', res: 'Verify on solari', progress: 2.5, hold: 3.4 },
]);
const cuts = [0, mnt.info[0].vB, mnt.info[1].vB, mnt.dur];
const M = [
  ['Replay', 'rebuild it on a clean machine', 'replay', 'Rebuilding the reporter’s environment on a clean Solari machine.', 'Reproduced', 'fails the same way, 3 of 3 runs', 'fail'],
  ['Bisect', 'find the one difference that causes it', 'bisect', 'Comparing with a machine where the test passes, one difference at a time.', 'Cause found', 'TZ=America/New_York, everything else identical', 'neutral'],
  ['Verify', 'check the fix where it failed', 'verify', 'Applying the candidate fix to a fresh copy of the reporter’s machine.', 'Fixed', 'passes with the patch, 3 of 3 runs', 'pass'],
];
M.forEach(([verb, text, name, cap, st, ct, tone], k) => {
  strip(k + 2, verb, text);
  const sc = slice(mnt, cuts[k], cuts[k + 1]);
  const vR = mnt.info[k].vR - cuts[k];
  term(name, 'LIVE RUN', sc, {
    caps: [{ t: 0, text: cap }],
    card: card(vR + 0.3, sc.dur, st, ct, tone),
  });
});

// ---- 4. share: keep the machine, browser terminal, stop ----
strip(5, 'Share', 'the reporter joins the same machine in the browser');
const keep = session(RAW.keep, [
  { name: 'replay --keep', res: 'Replay on solari', progress: 1.8, hold: 0.8 },
  { name: null, res: 'Browser terminal on', progress: 1.2, hold: 2.2 },
]);
term('share', 'LIVE RUN', { ...keep, dur: keep.dur + 0.3 }, {
  caps: [
    { t: 0, text: 'Replay again, but keep the machine alive at the failure.' },
    { t: keep.info[1].vE - 0.2, text: 'twin shell --web prints a link and a one-time password.' },
  ],
});
const bdir = `${work}/raw/${RAW.browser}`;
const bj = JSON.parse(readFileSync(`${bdir}/frames.json`, 'utf8'));
const evT = Object.fromEntries(bj.events.map((e) => [e.ev, e.t]));
const bsegs = layout([
  { r0: evT['auth-prompt'] - 0.4, r1: evT['auth-submit'], dur: 2.0 },
  { r0: evT['auth-submit'], r1: evT['typing-start'] - 0.8, dur: (evT['typing-start'] - 0.8 - evT['auth-submit']) / 3 },
  { r0: evT['typing-start'] - 0.8, r1: evT['result'] + 2.6 },
]);
{
  const dur = bsegs[bsegs.length - 1].v1 + 0.3;
  const vRes = toV(bsegs, evT['result']);
  add({
    kind: 'browser', title: 'share', label: 'LIVE RUN', url: bj.url, W: bj.W, H: bj.H, dir: bdir,
    frames: bj.frames.map((f) => ({ r: f.t, file: f.file })),
    segs: bsegs.map((g) => pick(g, SEGK)),
    auth: { v0: toV(bsegs, evT['auth-prompt']), v1: toV(bsegs, evT['auth-submit']) },
    caps: [
      { t: 0, text: 'The reporter opens the link and signs in with the password.' },
      { t: toV(bsegs, evT['typing-start']) - 0.3, text: 'Same machine, same environment: the failing test runs in the browser.' },
    ],
    card: card(vRes + 0.2, dur, 'Same failure', 'the reporter sees it on the very same machine', 'fail'),
    dur,
  });
}
const cls = session(RAW.close, [
  { name: null, hold: 0.5 }, { name: null, res: 'Stopped', progress: 1.0, hold: 0.5 }, { name: null, hold: 1.0 },
]);
term('share', 'LIVE RUN', { ...cls, dur: cls.dur + 0.3 }, {
  caps: [{ t: 0, text: 'twin stop releases the machine. Nothing keeps running.' }],
});

// ---- 5. agents: a REAL interactive Claude Code session (tmux pane snapshots) ----
strip(6, 'Agents', 'Claude Code does the same loop');
{
  const snaps = readLog(RAW.claude);
  const endT = snaps[snaps.length - 1].t;
  const cuts = [[0, 21.5, 8.0], [21.5, 58.5, 6.5], [58.5, 97, 4.5], [97, 283, 5.5], [283, 344, 5.5], [344, endT, 7.5]];
  const L = layout(cuts.map(([r0, r1, dur]) => ({ r0, r1, dur, real: r1 - r0 })));
  const redact = (s) => s.replace(/ · Claude (Pro|Max|Team|Enterprise)/g, '');
  const events = [];
  let lastV = -1;
  snaps.forEach((sn, i) => {
    const v = toV(L, sn.t);
    const nextV = i + 1 < snaps.length ? toV(L, snaps[i + 1].t) : Infinity;
    if (v - lastV < 0.02 && nextV - v < 0.02 && !sn.end) return; // thin out sub-frame updates
    lastV = v;
    const lines = redact(sn.screen).replace(/\n$/, '').split('\n').map((l) => l + '\x1b[0m');
    events.push({ v, d: `\x1b[?25l\x1b[H\x1b[2J${lines.join('\r\n')}\x1b[${sn.cy + 1};${sn.cx + 1}H\x1b[?25h` });
  });
  const dur = L[L.length - 1].v1;
  add({
    kind: 'term', title: 'agents', label: 'LIVE: REAL CLAUDE CODE SESSION', cols: 128, rows: 30,
    events, segs: L.map((g) => pick(g, SEGK)), marks: [], dur,
    caps: [{ t: 0, text: 'A real Claude Code session, not a replay. It uses twin over MCP.' }],
    card: { t0: dur - 4.2, t1: dur - 0.05, status: 'Done', text: 'Claude Code reproduced it, fixed it, verified the fix and released the machine.', tone: 'pass' },
  });
}

// ---- 6. website walkthrough: real site frames ----
{
  const sj = JSON.parse(readFileSync(`${work}/site/site.json`, 'utf8'));
  add({
    kind: 'site', title: 'the website', dir: `${work}/site`, W: sj.W, H: sj.H, nframes: sj.frames,
    captions: sj.captions.map((c) => ({ t: c.t, text: c.text })),
    urls: sj.urls.map((c) => ({ t: c.t, url: c.url })),
    zooms: sj.zooms.map((z) => ({ t0: z.t0, t1: z.t1 ?? z.t0, label: z.label })),
    caption: ' ', dur: sj.frames / sj.FPS,
  });
}

// ---- 7. summary and close ----
add({ kind: 'summary', title: 'twin gives you', dur: 6.2 });
const fin = session(RAW.final, [{ name: null }]);
add({ kind: 'close', ...fin, cols: 64, rows: 5, dur: 6.0 });

const GAP = 0.2;
let cur = 0;
for (const s of scenes) {
  s.start = cur;
  cur += s.dur + GAP;
}
const total = cur - GAP;
writeFileSync(`${work}/data.js`, `window.DATA=${JSON.stringify({ scenes, total })};`);
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
console.log(scenes.map((s) => `${fmt(s.start)}  ${s.kind}${s.title ? ' ' + s.title : ''}${s.num ? ' ' + s.num + ' ' + s.verb : ''}  ${s.dur.toFixed(1)}s`).join('\n'), '\ntotal', fmt(total));
