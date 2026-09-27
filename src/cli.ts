import { bisectCommand } from './commands/bisect.ts';
import { captureCommand } from './commands/capture.ts';
import type { Command, CommandContext } from './commands/context.ts';
import { gcCommand } from './commands/gc.ts';
import { inspectCommand } from './commands/inspect.ts';
import { replayCommand } from './commands/replay.ts';
import { verifyCommand } from './commands/verify.ts';
import { TwinError } from './errors.ts';

export const COMMANDS: readonly Command[] = [
  captureCommand,
  inspectCommand,
  replayCommand,
  bisectCommand,
  verifyCommand,
  gcCommand,
];

function usage(commands: readonly Command[]): string {
  const width = Math.max(...commands.map((command) => command.name.length));
  const rows = commands.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`);
  return [
    'Usage: twin <command> [options]',
    '',
    'Reproduce "works on my machine" bugs: capture the failing environment, then',
    'compare or replay it.',
    '',
    'Commands:',
    ...rows,
    '',
    'Run `twin <command> --help` for details.',
  ].join('\n');
}

function isArgParseError(error: unknown): error is Error {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS');
}

/** Dispatches argv to a command and maps failures to exit codes. Never throws. */
export async function main(
  argv: readonly string[],
  context: CommandContext,
  commands: readonly Command[] = COMMANDS,
): Promise<number> {
  const [name, ...rest] = argv;
  const { stdout, stderr } = context.io;

  if (name === undefined || name === '-h' || name === '--help' || name === 'help') {
    stdout.write(`${usage(commands)}\n`);
    return name === undefined ? 2 : 0;
  }
  if (name === '-v' || name === '--version') {
    stdout.write(`${context.version}\n`);
    return 0;
  }
  const command = commands.find((candidate) => candidate.name === name);
  if (!command) {
    stderr.write(`twin: unknown command "${name}"\n\n${usage(commands)}\n`);
    return 2;
  }

  try {
    return await command.run(rest, context);
  } catch (error) {
    if (error instanceof TwinError) {
      stderr.write(`twin: ${error.message}\n`);
      return error.exitCode;
    }
    if (isArgParseError(error)) {
      stderr.write(`twin ${command.name}: ${error.message}\n\n${command.usage}\n`);
      return 2;
    }
    stderr.write(`twin: unexpected error\n${(error as Error)?.stack ?? String(error)}\n`);
    return 1;
  }
}
