import type { Backend, CreateMachineOptions, Machine, RunOutcome, RunSpec } from './types.ts';

export interface FakeRunResult {
  exitCode: number | null;
  output?: string;
  timedOut?: boolean;
  durationMs?: number;
}

/** Decides what a command "does" on a fake machine. Unmatched commands succeed silently. */
export type FakeResponder = (spec: RunSpec, machine: FakeMachine) => FakeRunResult | undefined;

export class FakeMachine implements Machine {
  readonly id: string;
  readonly options: CreateMachineOptions;
  readonly runs: RunSpec[] = [];
  readonly files = new Map<string, string>();
  readonly snapshots: string[] = [];
  killed = false;
  readonly #respond: FakeResponder;

  constructor(id: string, options: CreateMachineOptions, respond: FakeResponder) {
    this.id = id;
    this.options = options;
    this.#respond = respond;
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
    this.snapshots.push(`${id}:${name}`);
    return id;
  }

  async kill(): Promise<void> {
    this.killed = true;
  }
}

/** In-memory backend for tests and the offline demo. Records everything it is asked to do. */
export class FakeBackend implements Backend {
  readonly name = 'fake';
  readonly machines: FakeMachine[] = [];
  readonly #respond: FakeResponder;

  constructor(respond: FakeResponder = () => undefined) {
    this.#respond = respond;
  }

  async create(options: CreateMachineOptions): Promise<Machine> {
    const machine = new FakeMachine(`sbx_fake${this.machines.length}`, options, this.#respond);
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
}
