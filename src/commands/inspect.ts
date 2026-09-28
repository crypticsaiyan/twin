import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { diffCapsules } from '../capsule/diff.ts';
import { loadCapsule } from '../capsule/source.ts';
import { TwinError } from '../errors.ts';
import { renderDifferences } from '../report/differences.ts';
import { renderSummary } from '../report/summary.ts';
import { type Command, type CommandContext, capsuleSource, stdoutStyle } from './context.ts';

const USAGE = `Usage: twin inspect <capsule> [<other-capsule>] [options]

With one capsule, prints a summary. With two, lists every environment fact
that differs between them.
Capsules can be file paths or https URLs, such as GitHub issue attachments.

Options:
      --json   machine-readable output
  -h, --help   show this help`;

async function run(args: string[], context: CommandContext): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const { io } = context;
  if (values.help) {
    io.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (positionals.length < 1 || positionals.length > 2) {
    throw new TwinError(`expected one or two capsule paths\n\n${USAGE}`, { exitCode: 2 });
  }

  const style = stdoutStyle(context);
  const [pathA, pathB] = positionals as [string, string?];
  const a = await loadCapsule(pathA, capsuleSource(context));

  if (pathB === undefined) {
    io.stdout.write(
      values.json ? `${JSON.stringify(a, null, 2)}\n` : `${renderSummary(a, style)}\n`,
    );
    return 0;
  }

  const differences = diffCapsules(a, await loadCapsule(pathB, capsuleSource(context)));
  if (values.json) {
    io.stdout.write(`${JSON.stringify(differences, null, 2)}\n`);
  } else {
    const labels = { a: basename(pathA), b: basename(pathB) };
    io.stdout.write(`${renderDifferences(differences, labels, style)}\n`);
  }
  return 0;
}

export const inspectCommand: Command = {
  name: 'inspect',
  summary: 'summarize a capsule, or diff two',
  usage: USAGE,
  run,
};
