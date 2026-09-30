// Records the real twin website (served locally) as 30 fps frames: eased scrolling, smooth zooms,
// a click ring and real clicks. The camera runs inside the page (requestAnimationFrame + CSS
// transform), Chrome pushes screencast frames as they change, and the frames are resampled to a
// constant 30 fps by their arrival time.
//
// usage: [THEME=dark] node site-record.mjs <outDir> [baseUrl=http://127.0.0.1:4321]
import { mkdirSync, rmSync, writeFileSync, linkSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const [out, base = 'http://127.0.0.1:4321'] = process.argv.slice(2);
const W = 1584;
const H = 810;
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';
const FPS = 30;
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/raw`, { recursive: true });

const c = await launch({ port: 9950 + Math.floor(Math.random() * 40), profile: `${out}/.profile`, width: W, height: H });
const { send, ev, on } = c;
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: THEME }] });
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
  source: `try { localStorage.setItem('starlight-theme', '${THEME}'); } catch {}\n${PAGE_LIB}`,
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

cap('The twin site: one install, and a short film of the whole loop.');
await hold(2.4);

cap('Install once with npm, then use the twin command.');
await zoomTo(await R('.install'), 'install', 110, 2.2);
await click('.copy', 0.4);
await hold(2.0); // button reads "Copied"
await zoomOut();
await ev('__hideCursor()');

cap('Four commands, one file between them.');
await scrollTo('#flow', 1.0, 90);
await hold(0.4);
await zoomTo(await R('.flow'), 'flow', 60, 1.5);
await hold(2.0);
await zoomOut();

cap('For agents: the MCP server and the GitHub Action, each a few lines.');
await scrollTo('#agents', 1.0, 90);
await hold(0.4);
await zoomTo(await R('.agents'), 'agents', 60, 1.5);
await hold(2.2);
await zoomOut();
await scrollY(99999, 0.8);
await hold(0.6);

// Docs pages. Each navigation shows the last frame of the previous page until the new one has rendered.
log.cuts = [];
const docsPage = async (path, text, scrolls) => {
  const from = now();
  await navigate(base + path);
  await sleep(200);
  log.cuts.push({ from, to: now() });
  log.urls[log.urls.length - 1].t = now();
  cap(text);
  await hold(1.4);
  for (const y of scrolls) {
    await scrollY(y, 1.1);
    await hold(1.0);
  }
};
await docsPage('/examples/echarts-21538/', 'The docs keep the full case studies: every capsule and recording of a real bug.', [420, 900]);
await docsPage('/reference/privacy/', 'Privacy and redaction: exactly what a capsule records, and what it never does.', [520, 900]);
await docsPage('/reference/cli/', 'Every command, option and exit code in one reference.', [500]);
await docsPage('/guides/ai-agents/', 'Guides for coding agents and for pull request checks.', [400]);

const total = now();
await send('Page.stopScreencast');
await sleep(300);

// resample to constant fps by arrival time
const N = Math.floor(total * FPS);
let k = 0;
for (let f = 0; f < N; f++) {
  const t = f / FPS;
  if (log.cuts?.some((c) => t >= c.from && t < c.to)) { linkSync(`${out}/raw/${String(k).padStart(6, '0')}.jpg`, `${out}/${String(f + 1).padStart(5, '0')}.jpg`); continue; }
  while (k + 1 < shots.length && shots[k + 1] <= t) k++;
  linkSync(`${out}/raw/${String(k).padStart(6, '0')}.jpg`, `${out}/${String(f + 1).padStart(5, '0')}.jpg`);
}
writeFileSync(`${out}/site.json`, JSON.stringify({ W, H, FPS, frames: N, ...log, base }, null, 1));
const gaps = shots.slice(1).map((t, i) => t - shots[i]);
console.log('frames', N, 'seconds', total.toFixed(1), 'screencast frames', shots.length, 'max gap', Math.max(...gaps).toFixed(2));
c.close();
