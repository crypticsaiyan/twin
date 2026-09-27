import type { Backend, CreateMachineOptions, Machine, RunOutcome, RunSpec } from './types.ts';

export interface FakeRunResult {
  exitCode: number | null;
  output?: string;
  timedOut?: boolean;
  durationMs?: number;
}

/** Decides what a command "does" on a fake machine. Unmatched commands succeed silently. */
export type FakeResponder = (spec: RunSpec, machine: FakeMachine) => FakeRunResult | undefined;

/** Snapshot ids to names, shared by a backend's machines. Reverting consumes one, like Solari. */
type SnapshotRegistry = Map<string, string>;

export class FakeMachine implements Machine {
  readonly id: string;
  readonly options: CreateMachineOptions;
  readonly runs: RunSpec[] = [];
  readonly files = new Map<string, string>();
  /** Ids of every snapshot this machine took. */
  readonly snapshots: string[] = [];
  readonly reverts: string[] = [];
  killed = false;
  readonly #respond: FakeResponder;
  readonly #registry: SnapshotRegistry;

  constructor(
    id: string,
    options: CreateMachineOptions,
    respond: FakeResponder,
    registry: SnapshotRegistry = new Map(),
  ) {
    this.id = id;
    this.options = options;
    this.#respond = respond;
    this.#registry = registry;
  }

  async run(spec: RunSpec): Promise<RunOutcome> {
    if (this.killed) throw new Error(`machine ${this.id} was killed`);
    this.runs.push(spec);
    const result = this.#respond(spec, this) ?? { exitCode: 0 };
    const output = result.output ?? '';
    if (output) spec.onOutput?.(output, 'stdout');
    return {
      exitCode: result.exitCode,
      timedOut: result.timedOut ?? false,
      output,
      durationMs: result.durationMs ?? 1,
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async snapshot(name: string): Promise<string> {
    const id = `snap_${this.id}_${this.snapshots.length}`;
    this.snapshots.push(id);
    this.#registry.set(id, name);
    return id;
  }

  async revert(snapshotId: string): Promise<void> {
    if (!this.#registry.delete(snapshotId)) throw new Error('Snapshot not found');
    this.reverts.push(snapshotId);
  }

  async kill(): Promise<void> {
    this.killed = true;
  }
}

/** In-memory backend for tests and the offline demo. Records everything it is asked to do. */
export class FakeBackend implements Backend {
  readonly name = 'fake';
  readonly machines: FakeMachine[] = [];
  /** Live snapshots (not yet consumed by a revert or deleted), id to name. */
  readonly snapshots: SnapshotRegistry = new Map();
  readonly #respond: FakeResponder;

  constructor(respond: FakeResponder = () => undefined) {
    this.#respond = respond;
  }

  async create(options: CreateMachineOptions): Promise<Machine> {
    const machine = new FakeMachine(
      `sbx_fake${this.machines.length}`,
      options,
      this.#respond,
      this.snapshots,
    );
    this.machines.push(machine);
    return machine;
  }

  async reap(labels: Record<string, string>): Promise<string[]> {
    const matches = this.machines.filter(
      (machine) =>
        !machine.killed &&
        Object.entries(labels).every(([key, value]) => machine.options.labels[key] === value),
    );
    for (const machine of matches) await machine.kill();
    return matches.map((machine) => machine.id);
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    if (!this.snapshots.delete(snapshotId)) throw new Error('Snapshot not found');
  }

  async reapSnapshots(prefix: string): Promise<string[]> {
    const ids = [...this.snapshots].filter(([, name]) => name.startsWith(prefix)).map(([id]) => id);
    for (const id of ids) this.snapshots.delete(id);
    return ids;
  }
}
