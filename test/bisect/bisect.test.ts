import { describe, expect, it } from 'vitest';
import { FakeBackend, type FakeMachine } from '../../src/backend/fake.ts';
import type { RunSpec } from '../../src/backend/types.ts';
import { type BisectEvent, bisect } from '../../src/bisect/bisect.ts';
import type { Capsule } from '../../src/capsule/schema.ts';
import { failureIdentity } from '../../src/signature/signature.ts';
import { makeCapsule } from '../helpers/capsule.ts';

const FAILURE = 'AssertionError: expected 1 to be 2';

/** Good passes; bad differs in TZ, NODE_ENV, CI, node version and working tree diff. */
function capsules(): { good: Capsule; bad: Capsule } {
  const base = makeCapsule();
  const repo = base.repo as NonNullable<Capsule['repo']>;
  const good = makeCapsule({
    command: { ...base.command, exitCode: 0, outcome: 'pass', failure: null },
    runtimes: { node: '20.17.0' },
    env: { NODE_ENV: { state: 'set', value: 'test' }, CI: { state: 'set', value: 'true' } },
    locale: { timeZone: 'UTC', locale: 'en-IN' },
  });
  const bad = makeCapsule({
    command: {
      ...base.command,
      failure: { ...failureIdentity({ exitCode: 1, signal: null }, FAILURE), outputTail: FAILURE },
    },
    runtimes: { node: '22.3.0' },
    env: { NODE_ENV: { state: 'set', value: 'development' }, CI: { state: 'absent' } },
    locale: { timeZone: 'Asia/Kolkata', locale: 'en-IN' },
    repo: { ...repo, diff: '+changed\n', dirty: true },
  });
  return { good, bad };
}

interface World {
  tz: string | undefined;
  node22: boolean;
  diff: boolean;
  unsetCi: boolean;
}

const isCommand = (spec: RunSpec) => spec.argv.includes('exec "$@"');

/**
 * A fake machine whose command outcome is a function of the applied differences. Disk state (the
 * diff) persists across runs until the machine is reverted, like a real machine.
 */
function simulatedBackend(
  fails: (world: World) => boolean,
  overrides: (spec: RunSpec) => { exitCode: number; output?: string } | undefined = () => undefined,
) {
  let diffApplied = false;
  const backend = new FakeBackend((spec) => {
    const override = overrides(spec);
    if (override) return override;
    if (spec.argv.join(' ').includes('git apply --whitespace=nowarn /tmp/twin/failing.diff'))
      diffApplied = true;
    if (!isCommand(spec)) return undefined;
    const world: World = {
      tz: spec.env?.TZ,
      node22: spec.env?.PATH?.includes('node-22.3.0') ?? false,
      diff: diffApplied,
      unsetCi: spec.argv[0] === 'env' && spec.argv.includes('CI'),
    };
    return fails(world) ? { exitCode: 1, output: FAILURE } : { exitCode: 0 };
  });
  const create = backend.create.bind(backend);
  backend.create = async (options) => {
    const machine = (await create(options)) as FakeMachine;
    const revert = machine.revert.bind(machine);
    machine.revert = async (id) => {
      diffApplied = false;
      await revert(id);
    };
    return machine;
  };
  return backend;
}

describe('bisect', () => {
  it('isolates a single time zone difference', async () => {
    const { good, bad } = capsules();
    const backend = simulatedBackend((w) => w.tz === 'Asia/Kolkata');
    const events: BisectEvent['type'][] = [];
    const report = await bisect(good, bad, backend, { onEvent: (e) => events.push(e.type) });

    expect(report.verdict).toBe('found');
    expect(report.minimal).toEqual(['TZ=Asia/Kolkata']);
    expect(report.candidates).toEqual([
      'node 22.3.0',
      'unset CI',
      'NODE_ENV=development',
      'TZ=Asia/Kolkata',
      'working tree diff',
    ]);
    expect(report.trials[0]).toMatchObject({ atoms: [], result: 'pass' });
    expect(report.trials[1]).toMatchObject({ result: 'fail' });
    const [machine] = backend.machines;
    expect(machine?.killed).toBe(true);
    expect(machine?.snapshots).toHaveLength(1);
    expect(events).toContain('trial-end');
  });

  it('never reverts when every candidate is a process setting', async () => {
    const { good, bad } = capsules();
    bad.repo = { ...(bad.repo as NonNullable<Capsule['repo']>), diff: '', dirty: false };
    const backend = simulatedBackend((w) => w.tz === 'Asia/Kolkata' && w.node22);
    const report = await bisect(good, bad, backend);
    expect(report.minimal.sort()).toEqual(['TZ=Asia/Kolkata', 'node 22.3.0']);
    expect(backend.machines[0]?.reverts).toEqual([]);
  });

  it('pre-installs the failing node version before the snapshot', async () => {
    const { good, bad } = capsules();
    const backend = simulatedBackend((w) => w.node22);
    const report = await bisect(good, bad, backend);
    expect(report.minimal).toEqual(['node 22.3.0']);
    expect(report.steps.map((s) => s.id)).toContain('stage-node');
  });

  it('finds an interacting pair', async () => {
    const { good, bad } = capsules();
    const report = await bisect(
      good,
      bad,
      simulatedBackend((w) => w.node22 && w.unsetCi),
    );
    expect(report.minimal.sort()).toEqual(['node 22.3.0', 'unset CI']);
  });

  it('reverts the machine after trials that change files', async () => {
    const { good, bad } = capsules();
    const backend = simulatedBackend((w) => w.diff);
    const report = await bisect(good, bad, backend);
    expect(report.minimal).toEqual(['working tree diff']);
    expect(backend.machines[0]?.reverts.length).toBeGreaterThan(0);
    expect(backend.machines[0]?.files.get('/tmp/twin/failing.diff')).toBe('+changed\n');
  });

  it('reports a good world that fails on its own', async () => {
    const { good, bad } = capsules();
    const report = await bisect(
      good,
      bad,
      simulatedBackend(() => true),
    );
    expect(report.verdict).toBe('baseline-fails');
    expect(report.trials).toHaveLength(1);
  });

  it('reports when applying every difference does not reproduce', async () => {
    const { good, bad } = capsules();
    const report = await bisect(
      good,
      bad,
      simulatedBackend(() => false),
    );
    expect(report.verdict).toBe('not-reproduced');
    expect(report.trials).toHaveLength(2);
  });

  it('treats a different failure as unresolved, not as the bug', async () => {
    const { good, bad } = capsules();
    const backend = simulatedBackend(
      () => false,
      (spec) =>
        isCommand(spec) && spec.env?.TZ === 'Asia/Kolkata'
          ? { exitCode: 1, output: 'TypeError: other' }
          : undefined,
    );
    const report = await bisect(good, bad, backend);
    expect(report.verdict).toBe('not-reproduced');
    expect(report.trials[1]?.result).toBe('unresolved');
  });

  it('marks a trial unresolved when its setup fails', async () => {
    const { good, bad } = capsules();
    const backend = simulatedBackend(
      (w) => w.tz === 'Asia/Kolkata',
      (spec) => (spec.argv.join(' ').includes('failing.diff') ? { exitCode: 1 } : undefined),
    );
    const report = await bisect(good, bad, backend);
    expect(report.trials[1]).toMatchObject({ result: 'unresolved', attempts: [] });
    expect(report.verdict).toBe('not-reproduced');
  });

  it('stops when the good world cannot be built', async () => {
    const { good, bad } = capsules();
    const backend = simulatedBackend(
      () => false,
      (spec) =>
        spec.argv[0] === 'npm' && spec.argv[1] === 'ci'
          ? { exitCode: 1, output: 'npm ERR!' }
          : undefined,
    );
    const report = await bisect(good, bad, backend);
    expect(report.verdict).toBe('setup-failed');
    expect(report.trials).toEqual([]);
    expect(backend.machines[0]?.killed).toBe(true);
  });

  it('does not start a machine when there is nothing to vary', async () => {
    const base = makeCapsule();
    const good = makeCapsule({
      command: { ...base.command, exitCode: 0, outcome: 'pass', failure: null },
    });
    const backend = new FakeBackend();
    const report = await bisect(good, makeCapsule(), backend);
    expect(report.verdict).toBe('no-candidates');
    expect(backend.machines).toEqual([]);
  });

  it('requires every attempt of a trial to fail the captured way', async () => {
    const { good, bad } = capsules();
    let runs = 0;
    const backend = simulatedBackend(
      () => false,
      (spec) =>
        isCommand(spec) && spec.env?.TZ === 'Asia/Kolkata'
          ? runs++ % 2 === 0
            ? { exitCode: 1, output: FAILURE }
            : { exitCode: 0 }
          : undefined,
    );
    const report = await bisect(good, bad, backend, { attempts: 2 });
    expect(report.trials[1]).toMatchObject({ result: 'unresolved' });
    expect(report.trials[1]?.attempts).toHaveLength(2);
  });
});
