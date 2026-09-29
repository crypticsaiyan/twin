// Records the real twin website (served locally) as 30 fps frames: eased scrolling, smooth zooms,
// a click ring and real clicks. The camera runs inside the page (requestAnimationFrame + CSS
// transform), Chrome pushes screencast frames as they change, and the frames are resampled to a
// constant 30 fps by their arrival time.
//
// usage: node site-record.mjs <outDir> [baseUrl=http://127.0.0.1:4321/twin]
import { mkdirSync, rmSync, writeFileSync, linkSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const [out, base = 'http://127.0.0.1:4321/twin'] = process.argv.slice(2);
const W = 1500;
const H = 820;
const FPS = 30;
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/raw`, { recursive: true });

const c = await launch({ port: 9950 + Math.floor(Math.random() * 40), profile: `${out}/.profile`, width: W, height: H });
const { send, ev, on } = c;
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
for (const name of ['clipboard-write', 'clipboard-read']) await send('Browser.setPermission', { permission: { name }, setting: 'granted', origin: new URL(base).origin });

// In-page camera: scroll, zoom (transform on <body>), click ring.
const PAGE_LIB = `
(() => {
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const tween = (sec, fn, e = ease) => new Promise((res) => {
    const t0 = performance.now();
    const step = (now) => { const p = Math.min(1, (now - t0) / (sec * 1000)); fn(e(p)); p < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  });
  let zoom = null;
  const install = () => {
    const st = document.createElement('style');
    st.textContent = 'html{scroll-behavior:auto !important} #__cur{position:fixed;left:0;top:0;width:36px;height:36px;margin:-18px 0 0 -18px;border:2px solid #2f5bd3;border-radius:50%;background:rgba(47,91,211,.14);pointer-events:none;z-index:2147483647;opacity:0}';
    document.head.appendChild(st);
    const d = document.createElement('div'); d.id = '__cur'; document.documentElement.appendChild(d);
  };
  document.addEventListener('DOMContentLoaded', install);
  const vis = (sel) => document.querySelector(sel);
  window.__rect = (sel) => { const r = vis(sel).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, pageY: r.top + scrollY }; };
  window.__scrollY = (y, sec) => {
    const from = scrollY; const max = document.documentElement.scrollHeight - innerHeight; const to = Math.max(0, Math.min(max, y));
    return tween(sec, (p) => scrollTo(0, from + (to - from) * p));
  };
  window.__scrollTo = (sel, sec, top) => __scrollY(__rect(sel).pageY - top, sec);
  window.__zoomTo = (r, sec, pad, maxZ) => {
    const W = innerWidth, H = innerHeight;
    const z = Math.min(maxZ, W / (r.w + 2 * pad), H / (r.h + 2 * pad));
    let cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    cx = Math.min(Math.max(cx, W / (2 * z)), W - W / (2 * z));
    cy = Math.min(Math.max(cy, H / (2 * z)), H - H / (2 * z));
    const b = document.body.getBoundingClientRect();
    document.body.style.transformOrigin = (cx - b.left) + 'px ' + (cy - b.top) + 'px';
    zoom = { z, dx: W / 2 - cx, dy: H / 2 - cy };
    return tween(sec, (p) => { document.body.style.transform = 'translate(' + zoom.dx * p + 'px,' + zoom.dy * p + 'px) scale(' + (1 + (z - 1) * p) + ')'; });
  };
  window.__zoomOut = async (sec) => {
    if (!zoom) return;
    const z = zoom;
    await tween(sec, (p) => { const q = 1 - p; document.body.style.transform = 'translate(' + z.dx * q + 'px,' + z.dy * q + 'px) scale(' + (1 + (z.z - 1) * q) + ')'; });
    document.body.style.transform = ''; zoom = null;
  };
  let cur = { x: 0, y: 0, on: false };
  const ring = () => document.getElementById('__cur');
  window.__moveTo = (x, y, sec) => {
    const d = ring();
    if (!cur.on) { cur = { x: x + 140, y: y + 100, on: true }; d.style.opacity = 1; d.style.transform = 'translate(' + cur.x + 'px,' + cur.y + 'px)'; }
    const f = { ...cur };
    return tween(sec, (p) => { cur.x = f.x + (x - f.x) * p; cur.y = f.y + (y - f.y) * p; d.style.transform = 'translate(' + cur.x + 'px,' + cur.y + 'px)'; });
  };
  window.__click = async (sel) => {
    const el = vis(sel); const r = el.getBoundingClientRect();
    await __moveTo(r.left + r.width / 2, r.top + r.height / 2, 0.5);
    const d = ring();
    await tween(0.12, (p) => { d.style.transform = 'translate(' + cur.x + 'px,' + cur.y + 'px) scale(' + (1 - 0.35 * p) + ')'; }, (p) => p);
    el.click();
    await tween(0.16, (p) => { d.style.transform = 'translate(' + cur.x + 'px,' + cur.y + 'px) scale(' + (0.65 + 0.35 * p) + ')'; }, (p) => p);
  };
  window.__hideCursor = () => { ring().style.opacity = 0; cur.on = false; };
})();`;
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('starlight-theme', 'light'); } catch {}\n${PAGE_LIB}`,
});

// screencast capture
const shots = [];
let T0 = 0;
const now = () => (Date.now() - T0) / 1000;
on((m) => {
  if (m.method !== 'Page.screencastFrame') return;
  const t = now();
  const i = shots.length;
  writeFileSync(`${out}/raw/${String(i).padStart(6, '0')}.jpg`, Buffer.from(m.params.data, 'base64'));
  shots.push(t);
  send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
});

const log = { captions: [], urls: [], zooms: [], clicks: [] };
const cap = (text) => log.captions.push({ t: now(), text });
const hold = (sec) => sleep(sec * 1000);
const R = (sel) => ev(`JSON.stringify(__rect(${JSON.stringify(sel)}))`).then(JSON.parse);
const zoomTo = async (rect, label, pad, maxZ) => {
  log.zooms.push({ t0: now(), label });
  await ev(`__zoomTo(${JSON.stringify(rect)}, 0.45, ${pad}, ${maxZ})`);
};
const zoomOut = async () => { await ev('__zoomOut(0.45)'); log.zooms[log.zooms.length - 1].t1 = now(); };
const click = async (sel, after = 0.3) => { log.clicks.push({ t: now(), sel }); await ev(`__click(${JSON.stringify(sel)})`); await hold(after); };
const scrollTo = (sel, sec, top) => ev(`__scrollTo(${JSON.stringify(sel)}, ${sec}, ${top})`);
const scrollY = (y, sec) => ev(`__scrollY(${y}, ${sec})`);
const navigate = async (to) => {
  await send('Page.navigate', { url: to });
  for (let i = 0; i < 50; i++) { await sleep(200); if ((await ev('document.readyState')) === 'complete') break; }
  await sleep(300);
  log.urls.push({ t: now(), url: to });
};

await send('Page.navigate', { url: base + '/' });
for (let i = 0; i < 50; i++) { await sleep(200); if ((await ev('document.readyState')) === 'complete') break; }
T0 = Date.now();
log.urls.push({ t: 0, url: base + '/' });
await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

cap('The twin site: install, the ten commands, and a real bug worked end to end.');
await hold(3.0); // the hero terminal plays its recording

cap('Install with one command. Copy it in one click.');
await zoomTo(await R('.install'), 'install', 110, 2.2);
await click('.copy', 0.4);
await hold(1.7); // button reads "Copied"
await zoomOut();
await ev('__hideCursor()');

cap('Ten commands, one file between them.');
await scrollTo('#commands', 1.0, 70);
await hold(1.8);

cap('A real bug: the capsule shows what it kept, value recorded, name only or not set.');
await scrollTo('[data-demo=capture]', 1.1, 130);
await hold(1.0);
await click('[data-demo=capture] .tabs button[data-group=environment]', 0.5);
await zoomTo(await R('[data-demo=capture] .capsule'), 'privacy', 30, 1.9);
await hold(2.6);
await zoomOut();
await ev('__hideCursor()');

cap('Replay rebuilds the environment on a Solari machine.');
await scrollTo('[data-demo=stream]', 1.1, 130);
await hold(1.8);

cap('Bisect narrows it down in stages: compare, trial 1, trial 2, result.');
await scrollTo('[data-demo=bisect]', 1.1, 110);
await hold(0.8);
const bis = await R('[data-demo=bisect]');
await zoomTo({ ...bis, h: 470 }, 'bisect', 20, 1.6);
for (let i = 1; i <= 4; i++) await click(`[data-demo=bisect] .tabs button[data-stage="${i}"]`, 0.8);
await zoomOut();
await ev('__hideCursor()');

cap('Verify checks the fix in the environment where the bug was reported.');
const ver = await R('ol.steps > li.pair:last-child');
await scrollY(ver.pageY - 120, 1.0);
await hold(1.6);

cap('Agents get the reporter’s machine over MCP.');
await scrollTo('[data-demo=agents]', 1.2, 110);
await hold(0.8);
await zoomTo(await R('[data-demo=agents] .timeline'), 'agents', 50, 1.9);
await click('[data-demo=agents] .call[data-i="2"] button', 0.4).catch(() => {});
await hold(2.2);
await zoomOut();
await ev('__hideCursor()');

cap('What a capsule holds, where twin fits, and its limits.');
await scrollTo('#files', 1.0, 70);
await hold(1.1);
await scrollTo('#see-also', 1.0, 70);
await hold(0.6);
await scrollTo('#limits', 1.0, 70);
await hold(0.6);
await scrollY(99999, 1.0);
await hold(0.8);

cap('Guides and a CLI reference cover every command.');
await navigate(base + '/guides/replay/');
await hold(1.4);
await scrollY(420, 1.2);
await hold(1.2);

const total = now();
await send('Page.stopScreencast');
await sleep(300);

// resample to constant fps by arrival time
const N = Math.floor(total * FPS);
let k = 0;
for (let f = 0; f < N; f++) {
  const t = f / FPS;
  while (k + 1 < shots.length && shots[k + 1] <= t) k++;
  linkSync(`${out}/raw/${String(k).padStart(6, '0')}.jpg`, `${out}/${String(f + 1).padStart(5, '0')}.jpg`);
}
writeFileSync(`${out}/site.json`, JSON.stringify({ W, H, FPS, frames: N, ...log, base }, null, 1));
const gaps = shots.slice(1).map((t, i) => t - shots[i]);
console.log('frames', N, 'seconds', total.toFixed(1), 'screencast frames', shots.length, 'max gap', Math.max(...gaps).toFixed(2));
c.close();
