import { createInterface } from 'node:readline/promises';

export interface Output {
  write(chunk: string | Uint8Array): void;
  readonly isTTY: boolean;
}

/** Terminal interaction, injected so commands can be driven from tests. */
export interface Io {
  stdout: Output;
  stderr: Output;
  /** True when a person can answer prompts. */
  interactive: boolean;
  /** Asks on stderr and returns the answer, or null if input ended. */
  prompt(question: string): Promise<string | null>;
}

function wrap(stream: NodeJS.WriteStream): Output {
  return {
    write: (chunk) => {
      stream.write(chunk);
    },
    get isTTY() {
      return stream.isTTY === true;
    },
  };
}

export function processIo(): Io {
  return {
    stdout: wrap(process.stdout),
    stderr: wrap(process.stderr),
    interactive: process.stdin.isTTY === true && process.stderr.isTTY === true,
    prompt: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        return await rl.question(question);
      } catch {
        return null;
      } finally {
        rl.close();
      }
    },
  };
}
