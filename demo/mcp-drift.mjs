// Drives `twin mcp` like a coding agent would: replay and keep, run the failing test on the kept
// machine, write the fix there and try it, verify the fix on fresh machines, release.
// usage: node demo/mcp-drift.mjs <capsule.json> <fix.patch> [kept-machine-id]   (needs SOLARI_API_KEY, a built dist/)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [capsule, patchFile, existing] = process.argv.slice(2);
const bin = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/bin.js');
const patch = readFileSync(patchFile, 'utf8');

const client = new Client({ name: 'drift-demo', version: '0.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: [bin, 'mcp'], env: process.env }));

const t0 = Date.now();
const call = async (name, args) => {
  const started = Date.now();
  const result = await client.callTool({ name, arguments: args }, undefined, {
    timeout: 20 * 60_000,
    resetTimeoutOnProgress: true,
  });
  const text = result.content.map((part) => part.text ?? '').join('\n');
  console.log(`\n=== ${name} ${JSON.stringify(args).slice(0, 90)} (${((Date.now() - started) / 1000).toFixed(0)} s)${result.isError ? ' ERROR' : ''}\n${text}`);
  return text;
};

console.log('tools:', (await client.listTools()).tools.map((tool) => tool.name).join(', '));
// The kept machine's id is printed on the line after "still running at the failure".
const machine = existing ?? /^\s*machine (\S+)$/m.exec(await call('replay', { capsule: resolve(capsule), keep: true }))?.[1];
if (!machine) throw new Error('no kept machine id in the replay result');
await call('run', { machine, command: 'npm run test:jsdom 2>&1 | tail -8' });
await call('run', { machine, command: 'npm ls lru-cache 2>/dev/null | grep -B2 "lru-cache@11"' });
await call('write_file', { machine, path: 'fix.patch', content: patch });
await call('run', {
  machine,
  command: 'git apply fix.patch && rm -rf node_modules && npm ci --no-audit --no-fund >/dev/null 2>&1 && npm run test:jsdom 2>&1 | tail -6',
  timeout_seconds: 600,
});
await call('verify', { capsule: resolve(capsule), patch });
await call('release', { machine });
await client.close();
console.log(`\ntotal ${((Date.now() - t0) / 1000).toFixed(0)} s`);
