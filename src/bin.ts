#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { solariBackendFromEnv } from './backend/solari.ts';
import { main } from './cli.ts';
import { realHost } from './host.ts';
import { interruptible } from './interrupt.ts';
import { processIo } from './io.ts';

// Same relative location from src/ (dev) and dist/ (published).
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const host = realHost();
const io = processIo();
const argv = process.argv.slice(2);
const solari = () => solariBackendFromEnv(host.env);
process.exitCode = await main(argv, {
  io,
  host,
  cwd: process.cwd(),
  version: pkg.version,
  // The MCP server releases its own machines when its session ends.
  getBackend:
    argv[0] === 'mcp' ? solari : interruptible(solari, { signals: process, stderr: io.stderr }),
});
