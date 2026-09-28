import { parseArgs } from 'node:util';
import { TWIN_LABELS } from '../backend/types.ts';
import type { Command, CommandContext } from './context.ts';

const USAGE = `Usage: twin gc

Releases every machine twin started that is still running (kept replays,
or leftovers from an interrupted run). Each kill is confirmed with the gateway.
Needs SOLARI_API_KEY.`;

async function run(args: string[], context: CommandContext): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { help: { type: 'boolean', short: 'h', default: false } },
  });
  if (values.help) {
    context.io.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const backend = await context.getBackend();
  const killed = await backend.reap({ ...TWIN_LABELS });
  const { stdout } = context.io;
  stdout.write(
    killed.length
      ? `Released ${killed.length} machines: ${killed.join(', ')}\n`
      : 'No twin machines running.\n',
  );
  return 0;
}

export const gcCommand: Command = {
  name: 'gc',
  summary: 'release machines twin left running',
  usage: USAGE,
  run,
};
