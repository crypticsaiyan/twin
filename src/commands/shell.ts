import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { type Backend, type MachineInfo, TWIN_LABELS } from '../backend/types.ts';
import { TwinError } from '../errors.ts';
import { script } from '../replay/shell.ts';
import { SHELL_SCRIPT, WEB_TERMINAL_PORT, webTerminalScript } from '../shell/guest.ts';
import { attach } from '../shell/session.ts';
import { type Command, type CommandContext, stderrStyle } from './context.ts';

const USAGE = `Usage: twin shell [machine] [--web]

Opens a terminal on a machine kept by \`twin replay --keep\`, in the reporter's
environment (same env, PATH and working directory as the failing command).
[machine] is the start of its id; it can be left out when only one twin machine
is running.

Options:
      --web    start a browser terminal and print a link plus a password,
               to share with the reporter. Anyone with both gets a root shell
               on that machine until it is released.
  -h, --help   show this help

Ctrl-] detaches without stopping the machine. It keeps running (and billing)
until 15 minutes idle, or until \`twin gc\`.`;

export const WEB_USER = 'twin';

async function resolveMachine(backend: Backend, prefix: string | undefined): Promise<MachineInfo> {
  const running = await backend.list({ ...TWIN_LABELS });
  const matches = prefix ? running.filter((m) => m.id.startsWith(prefix)) : running;
  if (matches.length === 1) return matches[0] as MachineInfo;
  const known = running.map((m) => `  ${m.id.slice(0, 12)}  run ${m.labels.run ?? '?'}`).join('\n');
  if (matches.length === 0) {
    throw new TwinError(
      running.length === 0
        ? 'no twin machine is running; keep one with: twin replay <capsule> --keep'
        : `no running twin machine starts with "${prefix}". Running:\n${known}`,
    );
  }
  throw new TwinError(`several twin machines match; pass more of the id:\n${known}`, {
    exitCode: 2,
  });
}

async function run(args: string[], context: CommandContext): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      web: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const { io } = context;
  if (values.help) {
    io.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new TwinError(`expected at most one machine\n\n${USAGE}`, { exitCode: 2 });
  if (!values.web && !io.terminal) {
    throw new TwinError(
      'twin shell needs an interactive terminal; use --web for a browser terminal',
      {
        exitCode: 2,
      },
    );
  }

  const style = stderrStyle(context);
  const backend = await context.getBackend();
  const info = await resolveMachine(backend, positionals[0]);
  const machine = await backend.connect(info.id);
  const short = info.id.slice(0, 12);

  const ready = await machine.run({ argv: ['test', '-x', SHELL_SCRIPT], timeoutMs: 30_000 });
  if (ready.exitCode !== 0) {
    throw new TwinError(
      `machine ${short} was not kept by \`twin replay --keep\` (no ${SHELL_SCRIPT})`,
    );
  }

  if (values.web) {
    const password = randomBytes(12).toString('base64url');
    const started = await machine.run({
      argv: script(webTerminalScript({ port: WEB_TERMINAL_PORT, user: WEB_USER, password })),
      timeoutMs: 120_000,
    });
    if (started.exitCode !== 0) {
      throw new TwinError(`could not start the browser terminal:\n${started.output}`);
    }
    const url = await machine.previewUrl(WEB_TERMINAL_PORT);
    io.stdout.write(`${url}\n`);
    io.stderr.write(
      [
        style.bold(`Browser terminal on ${short}`),
        `  user      ${WEB_USER}`,
        `  password  ${password}`,
        style.dim('The link and password together give a root shell on this machine. Share them'),
        style.dim(
          'only with the reporter. The machine stops after 15 minutes idle or with: twin gc',
        ),
        '',
      ].join('\n'),
    );
    return 0;
  }

  const local = io.terminal as NonNullable<typeof io.terminal>;
  const { cols, rows } = local.size();
  const terminal = await machine.openTerminal({ cols, rows, command: SHELL_SCRIPT });
  io.stderr.write(style.dim(`twin: connected to ${short}. Ctrl-] detaches.\n`));
  const end = await attach(terminal, local);
  io.stderr.write(
    style.dim(
      `\ntwin: ${end === 'exited' ? 'shell exited' : 'detached'}. ${short} keeps running until 15 minutes idle or twin gc.\n`,
    ),
  );
  return 0;
}

export const shellCommand: Command = {
  name: 'shell',
  summary: 'open a terminal on a machine kept by replay --keep',
  usage: USAGE,
  run,
};
