// Renders player.html frame by frame with headless Chrome over CDP.
// usage: node render.mjs <workDir> <outDir> [--fps 30] [--at t1,t2,...]
// With --at only those timestamps are rendered (for review); otherwise every frame.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, linkSync, rmSync, copyFileSync } from 'node:fs';

const [work, out, ...rest] = process.argv.slice(2);
const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
const fps = Number(opt('--fps', 30));
const at = opt('--at', null);
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
