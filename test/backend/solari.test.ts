import { describe, expect, it, vi } from 'vitest';
import { FakeBackend } from '../../src/backend/fake.ts';
import {
  type SandboxApi,
  type SandboxHandle,
  SolariBackend,
  SolariMachine,
  solariBackendFromEnv,
} from '../../src/backend/solari.ts';
import { TwinError } from '../../src/errors.ts';

type Chunk = { stream: 'stdout' | 'stderr'; data: string };

/** Structural stand-in for an SDK Sandbox; only the members twin calls. */
function fakeSandbox(
  options: { chunks?: Chunk[]; exitCode?: number; hang?: boolean; connectFails?: boolean } = {},
) {
  const calls: string[] = [];
  const handle = {
    cmdId: 'cmd_1',
    stdin: vi.fn(),
    onData: (cb: (chunk: Chunk) => void) => {
      for (const chunk of options.chunks ?? []) cb(chunk);
    },
    wait: () =>
      options.hang ? new Promise<number>(() => {}) : Promise.resolve(options.exitCode ?? 0),
    kill: vi.fn(async (_signal?: number) => {
      calls.push('handle.kill');
    }),
  };
  const sandbox = {
    id: 'sbx_1',
    connect: vi.fn(async () => {
      calls.push('connect');
      if (options.connectFails) throw new Error('ws refused');
    }),
    commands: {
      start: vi.fn(async (cmd: string, opts?: object) => {
        calls.push(`start ${cmd} ${JSON.stringify(opts)}`);
        return handle;
      }),
    },
    files: {
      write: vi.fn(async (path: string, _data: string) => {
        calls.push(`write ${path}`);
      }),
    },
    snapshot: vi.fn(async (name?: string) => `snap_${name}`),
    revert: vi.fn(async (id: string) => {
      calls.push(`revert ${id}`);
    }),
    reconnect: vi.fn(async () => {
      calls.push('reconnect');
    }),
    kill: vi.fn(async () => {
      calls.push('kill');
    }),
  };
  return { sandbox: sandbox as unknown as SandboxHandle, handle, calls };
}

describe('SolariMachine', () => {
  it('starts the program with args, cwd and env, streams output and returns the exit code', async () => {
    const { sandbox, calls } = fakeSandbox({
      chunks: [
        { stream: 'stdout', data: 'hello\n' },
        { stream: 'stderr', data: 'oops\n' },
      ],
      exitCode: 3,
    });
    const seen: string[] = [];
    const machine = new SolariMachine(sandbox, () => 1000);
    const outcome = await machine.run({
      argv: ['npm', 'test'],
      cwd: '/w',
      env: { A: '1' },
      timeoutMs: 1000,
      onOutput: (chunk, stream) => seen.push(`${stream}:${chunk}`),
    });
    expect(calls[0]).toBe('start npm {"args":["test"],"cwd":"/w","env":{"A":"1"}}');
    expect(outcome).toEqual({ exitCode: 3, timedOut: false, output: 'hello\noops', durationMs: 0 });
    expect(seen).toEqual(['stdout:hello\n', 'stderr:oops\n']);
  });

  it('omits unset cwd and env', async () => {
    const { sandbox, calls } = fakeSandbox();
    await new SolariMachine(sandbox).run({ argv: ['true'], timeoutMs: 1000 });
    expect(calls[0]).toBe('start true {"args":[]}');
  });

  it('kills the guest process when the timeout fires', async () => {
    const { sandbox, handle } = fakeSandbox({ hang: true });
    const outcome = await new SolariMachine(sandbox).run({ argv: ['sleep', '999'], timeoutMs: 10 });
    expect(outcome).toMatchObject({ exitCode: null, timedOut: true });
    expect(handle.kill).toHaveBeenCalledWith(9);
  });

  it('delegates files, snapshots and kill to the sandbox', async () => {
    const { sandbox, calls } = fakeSandbox();
    const machine = new SolariMachine(sandbox);
    expect(machine.id).toBe('sbx_1');
    await machine.writeFile('/tmp/x', 'data');
    expect(await machine.snapshot('fail')).toBe('snap_fail');
    await machine.revert('snap_fail');
    await machine.kill();
    expect(calls).toEqual([
      'write /tmp/x',
      'revert snap_fail',
      'reconnect',
      'start true {"args":[]}',
      'reconnect',
      'start true {"args":[]}',
      'kill',
    ]);
  });

  it('reconnects and retries when the channel dropped before the command started', async () => {
    const { sandbox, calls } = fakeSandbox({ exitCode: 0 });
    const dropped = Object.assign(new Error('Not connected'), { name: 'ConnectionError' });
    const start = sandbox.commands.start as unknown as ReturnType<typeof vi.fn>;
    const real = start.getMockImplementation();
    start.mockImplementationOnce(async () => {
      calls.push('start dropped');
      throw dropped;
    });
    if (real) start.mockImplementation(real);
    const outcome = await new SolariMachine(sandbox, Date.now, 0).run({
      argv: ['true'],
      timeoutMs: 1000,
    });
    expect(outcome.exitCode).toBe(0);
    expect(calls).toEqual(['start dropped', 'reconnect', 'start true {"args":[]}']);
  });

  it('keeps probing after a revert until the channel stays up', async () => {
    const { sandbox, handle, calls } = fakeSandbox({ exitCode: 0 });
    const closed = Object.assign(new Error('Control channel closed (1005)'), {
      name: 'ConnectionError',
    });
    const wait = vi.spyOn(handle, 'wait');
    wait.mockRejectedValueOnce(closed);
    await new SolariMachine(sandbox, Date.now, 0).revert('snap_1');
    expect(calls.filter((c) => c === 'reconnect')).toHaveLength(3);
    expect(wait).toHaveBeenCalledTimes(3);
  });

  it('fails a revert whose channel never settles, and passes other errors through', async () => {
    const { sandbox, handle } = fakeSandbox({ exitCode: 0 });
    const wait = vi.spyOn(handle, 'wait');
    wait.mockRejectedValue(Object.assign(new Error('closed'), { name: 'ConnectionError' }));
    await expect(new SolariMachine(sandbox, Date.now, 0).revert('snap_1')).rejects.toThrow(
      'did not settle',
    );
    wait.mockRejectedValue(new Error('boom'));
    await expect(new SolariMachine(sandbox, Date.now, 0).revert('snap_1')).rejects.toThrow('boom');
  });

  it('gives up after repeated connection errors and never retries other errors', async () => {
    const { sandbox } = fakeSandbox();
    const start = sandbox.commands.start as unknown as ReturnType<typeof vi.fn>;
    start.mockRejectedValue(Object.assign(new Error('Not connected'), { name: 'ConnectionError' }));
    await expect(
      new SolariMachine(sandbox, Date.now, 0).run({ argv: ['x'], timeoutMs: 1 }),
    ).rejects.toThrow('Not connected');
    expect(start).toHaveBeenCalledTimes(4);

    start.mockReset();
    start.mockRejectedValue(new Error('ENOENT'));
    await expect(
      new SolariMachine(sandbox, Date.now, 0).run({ argv: ['x'], timeoutMs: 1 }),
    ).rejects.toThrow('ENOENT');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty argv', async () => {
    const { sandbox } = fakeSandbox();
    await expect(new SolariMachine(sandbox).run({ argv: [], timeoutMs: 1 })).rejects.toThrow(
      'empty argv',
    );
  });
});

describe('SolariBackend', () => {
  function api(sandbox: SandboxHandle, views: { sandboxId: string; state: string }[] = []) {
    const create = vi.fn(async (_opts: object) => sandbox);
    const kill = vi.fn(async (_id: string) => {});
    const listAll = vi.fn(async function* (_opts: object) {
      yield* views;
    });
    const listSnapshots = vi.fn(async (_opts: object) => ({
      snapshots: [
        { id: 'snap_a', name: 'twin-r1-base' },
        { id: 'snap_b', name: 'mine' },
        { id: 'snap_c', name: null },
      ],
    }));
    const deleteSnapshot = vi.fn(async (_id: string) => {});
    return {
      sandboxes: { create, kill, listAll, listSnapshots, deleteSnapshot } as unknown as SandboxApi,
      create,
      kill,
      listAll,
      listSnapshots,
      deleteSnapshot,
    };
  }

  it('deletes only snapshots with the twin prefix', async () => {
    const { sandbox } = fakeSandbox();
    const { sandboxes, deleteSnapshot, listSnapshots } = api(sandbox);
    const backend = new SolariBackend(sandboxes);
    expect(await backend.reapSnapshots('twin-')).toEqual(['snap_a']);
    expect(listSnapshots).toHaveBeenCalledWith({ limit: 200 });
    await backend.deleteSnapshot('snap_z');
    expect(deleteSnapshot.mock.calls).toEqual([['snap_a'], ['snap_z']]);
  });

  it('creates a labeled base sandbox with an idle timeout and opens its control channel', async () => {
    const { sandbox, calls } = fakeSandbox();
    const { sandboxes, create } = api(sandbox);
    const machine = await new SolariBackend(sandboxes).create({
      labels: { app: 'twin', run: 'r1' },
      idleTimeoutMs: 900_000,
    });
    expect(create).toHaveBeenCalledWith({
      template: 'base',
      metadata: { app: 'twin', run: 'r1' },
      idleTimeoutMs: 900_000,
    });
    expect(calls).toEqual(['connect']);
    expect(machine.id).toBe('sbx_1');
  });

  it('boots from a snapshot when given one', async () => {
    const { sandbox } = fakeSandbox();
    const { sandboxes, create } = api(sandbox);
    await new SolariBackend(sandboxes).create({
      labels: {},
      idleTimeoutMs: 1,
      fromSnapshot: 'snap_x',
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ fromSnapshot: 'snap_x' }));
  });

  it('kills the sandbox if the control channel cannot be opened', async () => {
    const { sandbox, calls } = fakeSandbox({ connectFails: true });
    const { sandboxes } = api(sandbox);
    await expect(
      new SolariBackend(sandboxes).create({ labels: {}, idleTimeoutMs: 1 }),
    ).rejects.toThrow('ws refused');
    expect(calls).toEqual(['connect', 'kill']);
  });

  it('reaps live sandboxes matching the labels', async () => {
    const { sandbox } = fakeSandbox();
    const { sandboxes, kill, listAll } = api(sandbox, [
      { sandboxId: 'a', state: 'running' },
      { sandboxId: 'b', state: 'gone' },
      { sandboxId: 'c', state: 'paused' },
      { sandboxId: 'd', state: 'releasing' },
    ]);
    expect(await new SolariBackend(sandboxes).reap({ app: 'twin' })).toEqual(['a', 'c']);
    expect(listAll).toHaveBeenCalledWith({ metadata: { app: 'twin' } });
    expect(kill.mock.calls).toEqual([['a'], ['c']]);
  });
});

describe('solariBackendFromEnv', () => {
  it('explains a missing key', async () => {
    await expect(solariBackendFromEnv({})).rejects.toThrow(TwinError);
    await expect(solariBackendFromEnv({})).rejects.toThrow(/SOLARI_API_KEY is not set/);
  });

  it('builds a backend from the real SDK without network access', async () => {
    const backend = await solariBackendFromEnv({
      SOLARI_API_KEY: 'slr_test_x',
      SOLARI_BASE_URL: 'http://127.0.0.1:9',
    });
    expect(backend.name).toBe('solari');
  });
});

describe('FakeBackend', () => {
  it('reaps only live machines with matching labels', async () => {
    const backend = new FakeBackend();
    const a = await backend.create({ labels: { app: 'twin', run: '1' }, idleTimeoutMs: 1 });
    await backend.create({ labels: { app: 'other' }, idleTimeoutMs: 1 });
    expect(await backend.reap({ app: 'twin' })).toEqual([a.id]);
    expect(await backend.reap({ app: 'twin' })).toEqual([]);
  });

  it('refuses to run on a killed machine', async () => {
    const machine = await new FakeBackend().create({ labels: {}, idleTimeoutMs: 1 });
    await machine.kill();
    await expect(machine.run({ argv: ['x'], timeoutMs: 1 })).rejects.toThrow('was killed');
  });
});
