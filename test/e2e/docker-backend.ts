import { execFile } from 'node:child_process';
import type {
  Backend,
  CreateMachineOptions,
  Machine,
  RunOutcome,
  RunSpec,
} from '../../src/backend/types.ts';

/**
 * Development-only backend: a local Docker container stands in for a Solari sandbox so the real
 * guest shell scripts (runtime downloads, git fetch by SHA, dependency installs) can be exercised
 * without an API key. Not shipped; the product only talks to Solari.
 */

/** Close to Solari's base template: Debian with curl, git and CA certificates. */
export const DEFAULT_IMAGE = 'buildpack-deps:bookworm-scm';

function docker(
  args: string[],
  timeoutMs = 60_000,
): Promise<{ code: number | null; out: string; stdout: string }> {
  return new Promise((resolve) => {
    execFile(
      'docker',
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : null) : 0;
        resolve({ code, out: `${stdout}${stderr}`, stdout });
      },
    );
  });
}

class DockerMachine implements Machine {
  // Docker cannot restore a container in place, so revert swaps in a new container.
  id: string;

  constructor(id: string) {
    this.id = id;
  }

  async run(spec: RunSpec): Promise<RunOutcome> {
    const started = Date.now();
    const args = ['exec'];
    if (spec.cwd) args.push('-w', spec.cwd);
    for (const [name, value] of Object.entries(spec.env ?? {})) args.push('-e', `${name}=${value}`);
    const { code, out } = await docker([...args, this.id, ...spec.argv], spec.timeoutMs);
    spec.onOutput?.(out, 'stdout');
    const timedOut = code === null;
    return {
      exitCode: timedOut ? null : code,
      timedOut,
      output: out.trimEnd(),
      durationMs: Date.now() - started,
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    const { code, out } = await new Promise<{ code: number | null; out: string }>((resolve) => {
      const child = execFile(
        'docker',
        ['exec', '-i', this.id, 'sh', '-c', 'cat > "$1"', 'sh', path],
        (error, stdout, stderr) => resolve({ code: error ? 1 : 0, out: `${stdout}${stderr}` }),
      );
      child.stdin?.end(content);
    });
    if (code !== 0) throw new Error(`docker write ${path} failed: ${out}`);
  }

  async snapshot(name: string): Promise<string> {
    const { out } = await docker(['commit', this.id, `twin-e2e:${name}`]);
    return out.trim();
  }

  async revert(snapshotId: string): Promise<void> {
    const run = ['run', '-d', '--network', 'host', snapshotId, 'sleep', 'infinity'];
    const { code, out, stdout } = await docker(run);
    if (code !== 0) throw new Error(`docker revert failed: ${out}`);
    await docker(['rm', '-f', this.id]);
    this.id = stdout.trim();
  }

  async kill(): Promise<void> {
    await docker(['rm', '-f', this.id]);
  }
}

export class DockerBackend implements Backend {
  readonly name = 'docker';
  readonly #image: string;

  constructor(image = DEFAULT_IMAGE) {
    this.#image = image;
  }

  async create(options: CreateMachineOptions): Promise<Machine> {
    const labels = Object.entries(options.labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]);
    const { code, out, stdout } = await docker(
      // Host networking sidesteps bridge DNS problems on some dev machines.
      ['run', '-d', '--network', 'host', ...labels, this.#image, 'sleep', 'infinity'],
      10 * 60_000,
    );
    if (code !== 0) throw new Error(`docker run failed: ${out}`);
    return new DockerMachine(stdout.trim());
  }

  async reap(labels: Record<string, string>): Promise<string[]> {
    const filters = Object.entries(labels).flatMap(([k, v]) => ['--filter', `label=${k}=${v}`]);
    const { out } = await docker(['ps', '-q', ...filters]);
    const ids = out.split('\n').filter(Boolean);
    if (ids.length > 0) await docker(['rm', '-f', ...ids]);
    return ids;
  }
}
