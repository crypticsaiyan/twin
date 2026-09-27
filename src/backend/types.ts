/**
 * The narrow slice of a cloud machine that replay and bisect need. Solari implements it for real;
 * FakeBackend implements it in memory for tests and the offline demo.
 */

export interface RunSpec {
  argv: readonly string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Enforced by the backend: the command is killed when it runs longer. */
  timeoutMs: number;
  onOutput?: (chunk: string, stream: 'stdout' | 'stderr') => void;
}

export interface RunOutcome {
  /** Null when the command was killed for exceeding its timeout. */
  exitCode: number | null;
  timedOut: boolean;
  /** Interleaved stdout and stderr, bounded to the most recent output. */
  output: string;
  durationMs: number;
}

export interface Machine {
  readonly id: string;
  run(spec: RunSpec): Promise<RunOutcome>;
  writeFile(path: string, content: string): Promise<void>;
  /** Checkpoints the running machine; it keeps running. Returns the snapshot id. */
  snapshot(name: string): Promise<string>;
  /** Restores this machine in place (disk and memory) to a snapshot taken from it. */
  revert(snapshotId: string): Promise<void>;
  /** Releases the machine. Idempotent. */
  kill(): Promise<void>;
}

export interface CreateMachineOptions {
  /** Attached as provider metadata so leftovers can be found and reaped. */
  labels: Record<string, string>;
  /** Rolling idle window after which the provider releases the machine on its own. */
  idleTimeoutMs: number;
  fromSnapshot?: string;
}

export interface Backend {
  readonly name: string;
  create(options: CreateMachineOptions): Promise<Machine>;
  /** Kills every live machine carrying all of `labels`. Returns the killed ids. */
  reap(labels: Record<string, string>): Promise<string[]>;
}

/** Labels every twin machine carries. */
export const TWIN_LABELS = { app: 'twin' } as const;
