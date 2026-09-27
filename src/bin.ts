#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { main } from './cli.ts';
import { realHost } from './host.ts';
import { processIo } from './io.ts';

// Same relative location from src/ (dev) and dist/ (published).
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

process.exitCode = await main(process.argv.slice(2), {
  io: processIo(),
  host: realHost(),
  cwd: process.cwd(),
  version: pkg.version,
});
