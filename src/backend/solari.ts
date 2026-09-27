import type { Sandbox, SandboxClient } from '@solarisdk/sdk';
import { TailBuffer } from '../capture/tail-buffer.ts';
import { TwinError } from '../errors.ts';
import type { Backend, CreateMachineOptions, Machine, RunOutcome, RunSpec } from './types.ts';

/** The SDK surface twin uses, narrowed so tests can pass a structural fake. */
export type SandboxApi = Pick<SandboxClient, 'create' | 'listAll' | 'kill'>;
export type SandboxHandle = Pick<
  Sandbox,
  'id' | 'connect' | 'commands' | 'files' | 'snapshot' | 'kill'
>;

const TEMPLATE = 'base';
const OUTPUT_TAIL_CHARS = 64_000;
const SIGKILL = 9;

export class SolariMachine implements Machine {
  readonly #sandbox: SandboxHandle;
  readonly #now: () => number;

  constructor(sandbox: SandboxHandle, now: () => number = Date.now) {
    this.#sandbox = sandbox;
    this.#now = now;
  }

  get id(): string {
    return this.#sandbox.id;
  }

  /**
   * Uses commands.start rather than commands.run: the streaming path has no server-side timeout,
   * so twin enforces one itself and kills the guest process when it fires.
   */
  async run(spec: RunSpec): Promise<RunOutcome> {
    const [cmd, ...args] = spec.argv;
    if (cmd === undefined) throw new Error('SolariMachine.run: empty argv');
    const started = this.#now();
    const tail = new TailBuffer(OUTPUT_TAIL_CHARS);
    const handle = await this.#sandbox.commands.start(cmd, {
      args,
      ...(spec.cwd === undefined ? {} : { cwd: spec.cwd }),
      ...(spec.env === undefined ? {} : { env: spec.env }),
    });
    handle.onData(({ stream, data }) => {
      tail.append(data);
      spec.onOutput?.(data, stream);
    });

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), spec.timeoutMs);
    });
    try {
      const result = await Promise.race([handle.wait(), timeout]);
      if (result === 'timeout') {
        await handle.kill(SIGKILL).catch(() => {});
        return {
          exitCode: null,
          timedOut: true,
          output: tail.tail(Infinity),
          durationMs: this.#now() - started,
        };
      }
      return {
        exitCode: result,
        timedOut: false,
        output: tail.tail(Infinity),
        durationMs: this.#now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.#sandbox.files.write(path, content);
  }

  snapshot(name: string): Promise<string> {
    return this.#sandbox.snapshot(name);
  }

  kill(): Promise<void> {
    return this.#sandbox.kill();
  }
}

export class SolariBackend implements Backend {
  readonly name = 'solari';
  readonly #sandboxes: SandboxApi;

  constructor(sandboxes: SandboxApi) {
    this.#sandboxes = sandboxes;
  }

  async create(options: CreateMachineOptions): Promise<Machine> {
    const sandbox = await this.#sandboxes.create({
      template: TEMPLATE,
      metadata: options.labels,
      idleTimeoutMs: options.idleTimeoutMs,
      ...(options.fromSnapshot ? { fromSnapshot: options.fromSnapshot } : {}),
    });
    try {
      // The control channel is not opened by create(); streaming commands need it.
      await sandbox.connect();
    } catch (error) {
      await sandbox.kill().catch(() => {});
      throw error;
    }
    return new SolariMachine(sandbox);
  }

  async reap(labels: Record<string, string>): Promise<string[]> {
    const killed: string[] = [];
    for await (const view of this.#sandboxes.listAll({ metadata: labels })) {
      if (view.state === 'gone' || view.state === 'releasing') continue;
      await this.#sandboxes.kill(view.sandboxId);
      killed.push(view.sandboxId);
    }
    return killed;
  }
}

/** Builds the real backend. The SDK is imported lazily so offline commands never load it. */
export async function solariBackendFromEnv(env: NodeJS.ProcessEnv): Promise<SolariBackend> {
  const apiKey = env.SOLARI_API_KEY;
  if (!apiKey) {
    throw new TwinError(
      'SOLARI_API_KEY is not set. Get a key at https://getsolari.com, then: export SOLARI_API_KEY=...',
      {
        exitCode: 2,
      },
    );
  }
  const { SolariClient } = await import('@solarisdk/sdk');
  const client = new SolariClient({
    apiKey,
    ...(env.SOLARI_BASE_URL ? { baseUrl: env.SOLARI_BASE_URL } : {}),
  });
  return new SolariBackend(client.sandboxes);
}
