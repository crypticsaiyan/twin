// Renders player.html frame by frame with headless Chrome over CDP.
// usage: node render.mjs <workDir> <outDir> [--fps 30] [--at t1,t2,...]
// With --at only those timestamps are rendered (for review); otherwise every frame.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, linkSync, rmSync, copyFileSync } from 'node:fs';

const [work, out, ...rest] = process.argv.slice(2);
const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
const fps = Number(opt('--fps', 30));
const at = opt('--at', null);
const check = rest.includes('--check');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const PORT = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn('google-chrome-stable', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${out}/.profile`,
  '--allow-file-access-from-files', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-gpu',
  '--no-first-run', '--window-size=1920,1080', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch {}
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 1; const pend = new Map();
ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = id++; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.result?.value;
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `file://${work}/player.html` });
for (let i = 0; i < 200 && !(await ev('window.READY === true')); i++) await sleep(250);
if (!(await ev('window.READY === true'))) throw new Error('player not ready');
const total = await ev('DATA.total');
if (check) {
  const scenes = JSON.parse(await ev('JSON.stringify(DATA.scenes.map((s) => ({ id: s.id, start: s.start, dur: s.dur })))'));
  const seen = new Map();
  let n = 0;
  for (const sc of scenes) for (let u = DS_FADE(); u <= sc.dur - DS_FADE(); u += 0.5) {
    await ev(`seek(${sc.start + u})`);
    const issues = JSON.parse(await ev('JSON.stringify(checkLayout())'));
    n++;
    for (const i of issues) { const k = JSON.stringify({ ...i, ox: undefined, oy: undefined, r: undefined, sw: undefined, sh: undefined }); const e = seen.get(k) || { i, first: sc.start + u, last: sc.start + u, count: 0 }; e.last = sc.start + u; e.count++; seen.set(k, e); }
  }
  console.log('checked', n, 'timestamps;', seen.size, 'distinct issues');
  for (const e of seen.values()) console.log(JSON.stringify(e.i), `t=${e.first.toFixed(1)}..${e.last.toFixed(1)} (${e.count}x)`);
  ws.close(); chrome.kill(); process.exit(seen.size ? 1 : 0);
}
function DS_FADE() { return 0.5; }
const times = at ? at.split(',').map(Number) : Array.from({ length: Math.ceil(total * fps) + 1 }, (_, i) => Math.min(i / fps, total));
let prevKey = null, prevFile = null, shots = 0;
for (let n = 0; n < times.length; n++) {
  const t = times[n];
  const key = await ev(`seek(${t})`);
  const file = at ? `${out}/t${t.toFixed(1).padStart(7, "0")}.png` : `${out}/${String(n + 1).padStart(5, '0')}.png`;
  if (!at && key === prevKey) linkSync(prevFile, file);
  else {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    shots++;
  }
  prevKey = key; prevFile = file;
  if (n % 300 === 0) console.log('frame', n, '/', times.length, 'shots', shots);
}
console.log('done', times.length, 'frames,', shots, 'screenshots, total', total.toFixed(1), 's');
ws.close(); chrome.kill();
