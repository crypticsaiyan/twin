import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readCapsule } from '../capsule/file.ts';
import { TwinError } from '../errors.ts';
import { replay } from '../replay/replay.ts';
import { renderReplay } from '../report/replay.ts';
import { type Command, type CommandContext, stderrStyle, stdoutStyle } from './context.ts';

const USAGE = `Usage: twin replay <capsule> [options]

Rebuilds the capsule's environment on a fresh Solari sandbox (same runtime,
package manager and lockfile, same commit and diff, same env values and time
zone), runs the command and reports whether the failure reproduces.

Needs SOLARI_API_KEY in the environment.

Options:
      --attempts <n>       runs of the command (default 3)
      --keep               keep the machine at the failure when it reproduces
      --repo <url>         clone from here instead of the capsule's remote
      --ref <sha>          check out this commit instead (skips the diff)
      --env <NAME=value>   value for a variable the capsule recorded by name (repeatable)
      --timeout <minutes>  per-attempt limit (default 15)
  -v, --verbose            stream guest output
      --json               machine-readable report on stdout
  -h, --help               show this help

Exit status: 0 reproduced, 1 anything else, 2 usage error.`;

export function parseEnvAssignments(assignments: readonly string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const assignment of assignments) {
    const eq = assignment.indexOf('=');
    if (eq <= 0)
      throw new TwinError(`--env expects NAME=value, got "${assignment}"`, { exitCode: 2 });
    env[assignment.slice(0, eq)] = assignment.slice(eq + 1);
  }
  return env;
}

function positiveInt(value: string | undefined, flag: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new TwinError(`${flag} expects a positive whole number, got "${value}"`, { exitCode: 2 });
  }
  return parsed;
}

async function run(args: string[], context: CommandContext): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      attempts: { type: 'string' },
      keep: { type: 'boolean', default: false },
      repo: { type: 'string' },
      ref: { type: 'string' },
      env: { type: 'string', multiple: true, default: [] },
      timeout: { type: 'string' },
      verbose: { type: 'boolean', short: 'v', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const { io } = context;
  if (values.help) {
    io.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (positionals.length !== 1)
    throw new TwinError(`expected one capsule path\n\n${USAGE}`, { exitCode: 2 });

  const attempts = positiveInt(values.attempts, '--attempts', 3);
  const timeoutMinutes = positiveInt(values.timeout, '--timeout', 15);
  const env = parseEnvAssignments(values.env);
  const capsule = await readCapsule(resolve(context.cwd, positionals[0] as string));
  const backend = await context.getBackend();
  const style = stderrStyle(context);
  const progress = (text: string) => io.stderr.write(style.dim(`twin: ${text}\n`));

  const report = await replay(capsule, backend, {
    attempts,
    keep: values.keep,
    env,
    commandTimeoutMs: timeoutMinutes * 60_000,
    ...(values.repo === undefined ? {} : { repoUrl: values.repo }),
    ...(values.ref === undefined ? {} : { ref: values.ref }),
    onEvent: (event) => {
      if (event.type === 'machine') progress(`machine ${event.id} ready`);
      else if (event.type === 'step-start') progress(event.step.title);
      else if (event.type === 'attempt-start')
        progress(`attempt ${event.index + 1}/${event.total}`);
      else if (event.type === 'output' && values.verbose) io.stderr.write(event.chunk);
    },
  });

  if (values.json) io.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else io.stdout.write(`${renderReplay(report, stdoutStyle(context))}\n`);
  return report.verdict === 'reproduced' ? 0 : 1;
}

export const replayCommand: Command = {
  name: 'replay',
  summary: 'rebuild a capsule on a Solari sandbox and rerun the command',
  usage: USAGE,
  run,
};
