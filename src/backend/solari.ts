import type { Sandbox, SandboxClient } from '@solarisdk/sdk';
import { TailBuffer } from '../capture/tail-buffer.ts';
import { TwinError } from '../errors.ts';
import type { Backend, CreateMachineOptions, Machine, RunOutcome, RunSpec } from './types.ts';

/** The SDK surface twin uses, narrowed so tests can pass a structural fake. */
export type SandboxApi = Pick<
  SandboxClient,
  'create' | 'listAll' | 'kill' | 'listSnapshots' | 'deleteSnapshot'
>;
export type SandboxHandle = Pick<
  Sandbox,
  'id' | 'connect' | 'reconnect' | 'commands' | 'files' | 'snapshot' | 'revert' | 'kill'
>;

const TEMPLATE = 'base';
const OUTPUT_TAIL_CHARS = 64_000;
const SIGKILL = 9;
const START_ATTEMPTS = 4;
const RETRY_BASE_MS = 500;
/** Measured live: after revert the guest drops even a freshly reopened channel once or twice. */
const SETTLE_ATTEMPTS = 20;
const SETTLE_PROBES = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Matched by name so this module does not have to load the SDK eagerly. */
function isConnectionError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConnectionError';
}

export class SolariMachine implements Machine {
  readonly #sandbox: SandboxHandle;
  readonly #now: () => number;

  readonly #retryBaseMs: number;

  constructor(sandbox: SandboxHandle, now: () => number = Date.now, retryBaseMs = RETRY_BASE_MS) {
    this.#sandbox = sandbox;
    this.#now = now;
    this.#retryBaseMs = retryBaseMs;
  }

  /**
   * Starting a command fails with ConnectionError when the control channel dropped (it does after
   * a revert, once the gateway notices the restored guest). The command never reached the guest in
   * that case, so reconnecting and starting again cannot run it twice.
   */
  async #start(cmd: string, options: Parameters<SandboxHandle['commands']['start']>[1]) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#sandbox.commands.start(cmd, options);
      } catch (error) {
        if (!isConnectionError(error) || attempt >= START_ATTEMPTS) throw error;
        await sleep(this.#retryBaseMs * attempt);
        await this.#sandbox.reconnect().catch(() => {});
      }
    }
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
    const handle = await this.#start(cmd, {
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

  /**
   * Measured on SDK 0.1.4: revert returns with the channel closed, and the guest drops the next
   * reopened channel too while it finishes restoring. Keep reconnecting and running a no-op until
   * it succeeds twice in a row. Retrying is safe only because `true` has no effect.
   */
  async revert(snapshotId: string): Promise<void> {
    await this.#sandbox.revert(snapshotId);
    let streak = 0;
    for (let attempt = 1; attempt <= SETTLE_ATTEMPTS; attempt++) {
      try {
        await this.#sandbox.reconnect();
        const probe = await this.run({ argv: ['true'], timeoutMs: 30_000 });
        if (probe.exitCode === 0 && ++streak >= SETTLE_PROBES) return;
      } catch (error) {
        if (!isConnectionError(error)) throw error;
        streak = 0;
        await sleep(this.#retryBaseMs * 2);
      }
    }
    throw new Error(`control channel did not settle after reverting to ${snapshotId}`);
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
  deleteSnapshot(snapshotId: string): Promise<void> {
    return this.#sandboxes.deleteSnapshot(snapshotId);
  }

  /** Snapshots are billed storage (about 4 GB each with node_modules), so leftovers matter. */
  async reapSnapshots(prefix: string): Promise<string[]> {
    const { snapshots } = await this.#sandboxes.listSnapshots({ limit: 200 });
    const deleted: string[] = [];
    for (const { id, name } of snapshots) {
      if (!name?.startsWith(prefix)) continue;
      try {
        await this.#sandboxes.deleteSnapshot(id);
        deleted.push(id);
      } catch (error) {
        // Measured: listSnapshots also returns stale entries that 404 on get and delete.
        if ((error as { status?: unknown }).status !== 404) throw error;
      }
    }
    return deleted;
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
