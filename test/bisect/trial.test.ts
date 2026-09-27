import { describe, expect, it } from 'vitest';
import type { Atom } from '../../src/bisect/atoms.ts';
import { BAD_DIFF_PATH, planTrial, type TrialBase } from '../../src/bisect/trial.ts';

const base: TrialBase = {
  env: { PATH: '/tmp/twin/tools/node-20.17.0/bin:/usr/bin', NODE_ENV: 'test', CI: 'true' },
  argv: ['npm', 'test'],
  dependencyDir: '/tmp/twin/repo',
  repoDir: '/tmp/twin/repo',
};
const COMMAND = ['sh', '-c', 'exec "$@"', 'twin', 'npm', 'test'];

const env = (name: string, value: string | null): Atom => ({
  kind: 'env',
  id: `env:${name}`,
  label: name,
  name,
  value,
});

describe('planTrial', () => {
  it('runs the good world unchanged for an empty subset', () => {
    expect(planTrial([], base)).toEqual({
      steps: [],
      env: base.env,
      argv: COMMAND,
      mutatesDisk: false,
    });
  });

  it('sets and unsets variables without touching disk', () => {
    const trial = planTrial([env('TZ', 'Asia/Kolkata'), env('CI', null)], base);
    expect(trial.env).toEqual({ PATH: base.env.PATH, NODE_ENV: 'test', TZ: 'Asia/Kolkata' });
    expect(trial.argv).toEqual(['env', '-u', 'CI', ...COMMAND]);
    expect(trial.mutatesDisk).toBe(false);
  });

  it('switches node by PATH to the pre-installed failing version', () => {
    const node: Atom = {
      kind: 'node',
      id: 'node',
      label: 'node 22.3.0',
      version: '22.3.0',
      goodVersion: '20.17.0',
    };
    expect(planTrial([node], base).env.PATH).toBe('/tmp/twin/tools/node-22.3.0/bin:/usr/bin');
    const noGoodNode: Atom = { ...node, goodVersion: null };
    expect(planTrial([noGoodNode], { ...base, env: { PATH: '/usr/bin' } }).env.PATH).toBe(
      '/tmp/twin/tools/node-22.3.0/bin:/usr/bin',
    );
  });

  it('swaps in the failing diff from a clean checkout', () => {
    const trial = planTrial([{ kind: 'diff', id: 'diff', label: 'diff', diff: '+bug\n' }], base);
    expect(trial.mutatesDisk).toBe(true);
    expect(trial.steps).toEqual([
      {
        kind: 'write',
        id: 'trial-diff-file',
        title: 'upload failing working tree diff',
        path: BAD_DIFF_PATH,
        content: '+bug\n',
      },
      expect.objectContaining({
        id: 'trial-diff',
        argv: ['sh', '-euc', `git reset -q --hard\ngit apply --whitespace=nowarn ${BAD_DIFF_PATH}`],
        cwd: '/tmp/twin/repo',
      }),
    ]);
  });

  it('resets to a clean tree when the failing side had no diff', () => {
    const trial = planTrial([{ kind: 'diff', id: 'diff', label: 'diff', diff: '' }], base);
    expect(trial.steps[1]).toMatchObject({ argv: ['sh', '-euc', 'git reset -q --hard'] });
  });

  it('installs varied dependencies in one npm call', () => {
    const trial = planTrial(
      [
        { kind: 'dependency', id: 'dep:a', label: 'a@2.0.0', name: 'a', version: '2.0.0' },
        { kind: 'dependency', id: 'dep:@s/b', label: '@s/b@1.1.0', name: '@s/b', version: '1.1.0' },
      ],
      { ...base, dependencyDir: '/tmp/twin/repo/app' },
    );
    expect(trial.steps).toEqual([
      expect.objectContaining({
        id: 'trial-dependencies',
        title: 'install a@2.0.0, @s/b@1.1.0',
        argv: ['npm', 'install', '--no-save', '--no-audit', '--no-fund', 'a@2.0.0', '@s/b@1.1.0'],
        cwd: '/tmp/twin/repo/app',
      }),
    ]);
    expect(trial.mutatesDisk).toBe(true);
  });
});
