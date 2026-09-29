// Minimal Chrome DevTools Protocol helper (Node 22+ global WebSocket).
import { spawn } from 'node:child_process';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function launch({ port, profile, width, height, extra = [] }) {
  const chrome = spawn('google-chrome-stable', [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--hide-scrollbars', '--force-color-profile=srgb',
    '--no-first-run', '--disable-gpu', '--mute-audio', ...extra, 'about:blank',
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch {}
    await sleep(200);
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 1; const pend = new Map(); const listeners = [];
  ws.onmessage = (m) => {
    const j = JSON.parse(m.data);
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } else if (j.method) listeners.forEach((l) => l(j));
  };
  const send = (method, params = {}, ms = 15000) => new Promise((res) => { const i = id++; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); console.log('cdp timeout', method); res({ error: 'timeout' }); } }, ms); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result?.result?.value;
  };
  const on = (fn) => listeners.push(fn);
  const close = () => { try { ws.close(); } catch {} chrome.kill(); };
  return { send, ev, on, close };
}
