import type { Backend } from '../backend/types.ts';
import type { Host } from '../host.ts';
import type { Io } from '../io.ts';
import { createStyle, type Style, shouldColor } from '../report/style.ts';

export interface CommandContext {
  io: Io;
  host: Host;
  cwd: string;
  version: string;
  /** Resolved lazily so offline commands never need a key or load the SDK. */
  getBackend: () => Promise<Backend>;
}

export interface Command {
  name: string;
  summary: string;
  usage: string;
  run(args: string[], context: CommandContext): Promise<number>;
}

/** Style for human-facing messages, which twin writes to stderr. */
export function stderrStyle(context: CommandContext): Style {
  return createStyle(shouldColor(context.io.stderr.isTTY, context.host.env));
}

export function stdoutStyle(context: CommandContext): Style {
  return createStyle(shouldColor(context.io.stdout.isTTY, context.host.env));
}
