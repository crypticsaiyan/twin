import type {
  Backend,
  CreateMachineOptions,
  Machine,
  MachineInfo,
  RunOutcome,
  RunSpec,
  Terminal,
} from './types.ts';

/** Called when the first machine becomes live and when the last one is released or let go. */
export interface LiveHooks {
  onLive(): void;
  onIdle(): void;
}

/**
 * A backend that knows which machines this process created and has not released yet, so an
 * interrupted command can release them instead of leaving them billing. A machine stops being
 * tracked once it is killed, or detached on purpose (a kept machine the user asked for).
 */
export class TrackedBackend implements Backend {
  readonly #inner: Backend;
  readonly #hooks: LiveHooks;
  readonly #live = new Set<Machine>();
  #releasing = false;

  constructor(inner: Backend, hooks: LiveHooks) {
    this.#inner = inner;
    this.#hooks = hooks;
  }

  get name(): string {
    return this.#inner.name;
  }

  /** Ids of machines created here and still running. */
  get live(): string[] {
    return [...this.#live].map((machine) => machine.id);
  }

  async create(options: CreateMachineOptions): Promise<Machine> {
    const machine = await this.#inner.create(options);
    if (this.#releasing) {
      // An interrupt arrived while the machine was being created.
      await machine.kill();
      throw new Error('interrupted');
    }
    const tracked = new TrackedMachine(machine, () => this.#forget(tracked));
    this.#live.add(tracked);
    if (this.#live.size === 1) this.#hooks.onLive();
    return tracked;
  }

  /** Kills every live machine; each kill is confirmed by the inner backend. Returns released ids. */
  async releaseAll(): Promise<{ released: string[]; failed: string[] }> {
    this.#releasing = true;
    const machines = [...this.#live];
    const results = await Promise.allSettled(machines.map((machine) => machine.kill()));
    const released: string[] = [];
    const failed: string[] = [];
    results.forEach((result, index) => {
      const id = (machines[index] as Machine).id;
      (result.status === 'fulfilled' ? released : failed).push(id);
    });
    return { released, failed };
  }

  reap(labels: Record<string, string>): Promise<string[]> {
    return this.#inner.reap(labels);
  }

  list(labels: Record<string, string>): Promise<MachineInfo[]> {
    return this.#inner.list(labels);
  }

  /** Re-attached machines were kept earlier; an interrupt leaves them running. */
  connect(id: string): Promise<Machine> {
    return this.#inner.connect(id);
  }

  #forget(machine: Machine): void {
    if (this.#live.delete(machine) && this.#live.size === 0) this.#hooks.onIdle();
  }
}

class TrackedMachine implements Machine {
  readonly #inner: Machine;
  readonly #forget: () => void;

  constructor(inner: Machine, forget: () => void) {
    this.#inner = inner;
    this.#forget = forget;
  }

  get id(): string {
    return this.#inner.id;
  }

  run(spec: RunSpec): Promise<RunOutcome> {
    return this.#inner.run(spec);
  }

  writeFile(path: string, content: string): Promise<void> {
    return this.#inner.writeFile(path, content);
  }

  async kill(): Promise<void> {
    await this.#inner.kill();
    this.#forget();
  }

  async detach(): Promise<void> {
    await this.#inner.detach();
    this.#forget();
  }

  openTerminal(options: { cols: number; rows: number; command: string }): Promise<Terminal> {
    return this.#inner.openTerminal(options);
  }

  previewUrl(port: number): Promise<string> {
    return this.#inner.previewUrl(port);
  }
}
