// Drives a real headless Chrome over CDP against the `twin shell --web` link: opens it,
// answers the HTTP basic-auth challenge with the printed user and password, types a command
// into the browser terminal and records screenshots with timestamps.
//
// usage: node browser.mjs <url> <user> <password> <outDir> "<command to type>"
// output: <outDir>/f0001.jpg ... and <outDir>/frames.json ({t, file}[] plus auth events)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const [url, user, password, outDir, command] = process.argv.slice(2);
const W = 1400;
const H = 800;
const PORT = 9333 + Math.floor(Math.random() * 500);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const profile = `${outDir}/profile`;

const chrome = spawn(
  'google-chrome-stable',
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`,
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--no-first-run',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    if (targets.some((t) => t.type === 'page')) break;
  } catch {}
  await sleep(200);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let nextId = 1;
const pending = new Map();
const listeners = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method) listeners.forEach((l) => l(msg));
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = nextId++;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: W,
  height: H,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Fetch.enable', { handleAuthRequests: true });

const T0 = Date.now();
const now = () => (Date.now() - T0) / 1000;
const events = [];
listeners.push(async (msg) => {
  if (msg.method === 'Fetch.requestPaused') {
    send('Fetch.continueRequest', { requestId: msg.params.requestId });
  }
  if (msg.method === 'Fetch.authRequired') {
    events.push({ t: now(), ev: 'auth-prompt' });
    await sleep(3200); // let the viewer read the prompt
    events.push({ t: now(), ev: 'auth-submit' });
    send('Fetch.continueWithAuth', {
      requestId: msg.params.requestId,
      authChallengeResponse: { response: 'ProvideCredentials', username: user, password },
    });
  }
});

const frames = [];
let capturing = true;
const grab = (async () => {
  let n = 0;
  while (capturing) {
    const t = now();
    const r = await Promise.race([
      send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }),
      sleep(1500).then(() => null),
    ]);
    if (r?.result?.data) {
      n++;
      const file = `f${String(n).padStart(4, '0')}.jpg`;
      writeFileSync(`${outDir}/${file}`, Buffer.from(r.result.data, 'base64'));
      frames.push({ t, file });
    }
    await sleep(60);
  }
})();

await sleep(800);
events.push({ t: now(), ev: 'navigate' });
send('Page.navigate', { url });
for (let i = 0; i < 100; i++) {
  await sleep(300);
  if ((await evaluate('typeof window.term !== "undefined"')) === true) break;
}
events.push({ t: now(), ev: 'terminal-ready' });
await evaluate(
  `term.options.fontFamily = "'JetBrains Mono', monospace"; term.options.fontSize = 17; term.options.lineHeight = 1.15; true`,
);
await sleep(700);
await evaluate(`window.dispatchEvent(new Event('resize')); true`);
await sleep(1500);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 400, y: 300, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 400, y: 300, button: 'left', clickCount: 1 });
await sleep(1200);
events.push({ t: now(), ev: 'typing-start' });
for (const ch of command) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
  await sleep(45 + Math.random() * 40);
}
await sleep(400);
await send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'Enter',
  code: 'Enter',
  windowsVirtualKeyCode: 13,
  text: '\r',
});
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
events.push({ t: now(), ev: 'enter' });

const dump = `(() => { const b = term.buffer.active; let s = ''; for (let i = 0; i < b.length; i++) s += b.getLine(i).translateToString(true) + '\\n'; return s; })()`;
let text = '';
for (let i = 0; i < 100; i++) {
  await sleep(300);
  text = (await evaluate(dump)) || '';
  if (/Tests\s+\d+ failed/.test(text) || /Tests\s+\d+ passed/.test(text)) break;
}
events.push({ t: now(), ev: 'result' });
await sleep(4000);
capturing = false;
await grab;
writeFileSync(`${outDir}/frames.json`, JSON.stringify({ W, H, url, events, frames }, null, 1));
writeFileSync(`${outDir}/terminal.txt`, text);
ws.close();
chrome.kill();
console.log('frames', frames.length, 'events', JSON.stringify(events));
