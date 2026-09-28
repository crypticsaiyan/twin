import { parseArgs } from 'node:util';
import { loadCapsule } from '../capsule/source.ts';
import { TwinError } from '../errors.ts';
import type { Io } from '../io.ts';
import { type ReplayEvent, replay } from '../replay/replay.ts';
import { renderReplay, shortId } from '../report/replay.ts';
import type { Style } from '../report/style.ts';
import {
  type Command,
  type CommandContext,
  capsuleSource,
  stderrStyle,
  stdoutStyle,
} from './context.ts';
import { parseEnvAssignments, positiveInt } from './options.ts';

const USAGE = `Usage: twin replay <capsule> [options]

Rebuilds the capsule's environment on a fresh Solari sandbox (same runtime,
package manager and lockfile, same commit and diff, same env values and time
zone), runs the command and reports whether the failure reproduces.
Capsules can be file paths or https URLs, such as GitHub issue attachments.

Needs SOLARI_API_KEY in the environment.

Options:
      --attempts <n>       runs of the command (default 3)
      --keep               keep the machine running at the failure (then: twin shell)
      --repo <url>         clone from here instead of the capsule's remote
      --ref <sha>          check out this commit instead (skips the diff)
      --env <NAME=value>   value for a variable the capsule recorded by name (repeatable)
      --timeout <minutes>  per-attempt limit (default 15)
  -v, --verbose            stream guest output
      --json               machine-readable report on stdout
  -h, --help               show this help

Exit status: 0 reproduced, 1 anything else, 2 usage error.`;

/** Progress lines on stderr (and guest output when verbose), shared by replay and verify. */
export function replayProgress(
  io: Io,
  style: Style,
  verbose: boolean,
): (event: ReplayEvent) => void {
  const progress = (text: string) => io.stderr.write(style.dim(`twin: ${text}\n`));
  return (event) => {
    if (event.type === 'machine') progress(`machine ${shortId(event.id)} ready`);
    else if (event.type === 'step-start') progress(event.step.title);
    else if (event.type === 'attempt-start') progress(`attempt ${event.index + 1}/${event.total}`);
    else if (event.type === 'output' && verbose) io.stderr.write(event.chunk);
  };
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
  const capsule = await loadCapsule(positionals[0] as string, capsuleSource(context));
  const backend = await context.getBackend();
  const style = stderrStyle(context);
  const report = await replay(capsule, backend, {
    attempts,
    keep: values.keep,
    env,
    commandTimeoutMs: timeoutMinutes * 60_000,
    ...(values.repo === undefined ? {} : { repoUrl: values.repo }),
    ...(values.ref === undefined ? {} : { ref: values.ref }),
    onEvent: replayProgress(io, style, values.verbose),
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
