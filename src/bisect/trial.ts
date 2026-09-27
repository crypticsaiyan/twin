import type { Step } from '../replay/plan.ts';
import { nodeDir, WORK_DIR } from '../replay/runtimes.ts';
import { execArgv, script } from '../replay/shell.ts';
import type { Atom } from './atoms.ts';

const MINUTE = 60_000;
export const BAD_DIFF_PATH = `${WORK_DIR}/failing.diff`;

export interface TrialBase {
  /** Environment of the good world (from its replay plan). */
  env: Record<string, string>;
  /** The captured command, unwrapped. */
  argv: readonly string[];
  /** Where dependencies were installed in the good world. */
  dependencyDir: string;
  repoDir: string;
}

export interface TrialPlan {
  /** Disk changes to make before running the command. */
  steps: Step[];
  env: Record<string, string>;
  argv: string[];
  /** True when the trial changes files, so the next trial must start from a reverted machine. */
  mutatesDisk: boolean;
}

function swapNode(path: string, atom: Extract<Atom, { kind: 'node' }>): string {
  const target = `${nodeDir(atom.version)}/bin`;
  if (atom.goodVersion === null) return `${target}:${path}`;
  return path.replace(`${nodeDir(atom.goodVersion)}/bin`, target);
}

/**
 * Applies a subset of atoms on top of the good world. Env, time zone and runtime changes are pure
 * process settings (both node versions are pre-installed in the base snapshot), so most trials run
 * without touching disk and need no revert.
 */
export function planTrial(atoms: readonly Atom[], base: TrialBase): TrialPlan {
  const env = { ...base.env };
  const unset: string[] = [];
  const steps: Step[] = [];

  for (const atom of atoms) {
    if (atom.kind === 'env') {
      if (atom.value === null) {
        delete env[atom.name];
        unset.push(atom.name);
      } else {
        env[atom.name] = atom.value;
      }
    } else if (atom.kind === 'node') {
      env.PATH = swapNode(env.PATH ?? '', atom);
    }
  }

  const diff = atoms.find((atom) => atom.kind === 'diff');
  if (diff) {
    steps.push(
      {
        kind: 'write',
        id: 'trial-diff-file',
        title: 'upload failing working tree diff',
        path: BAD_DIFF_PATH,
        content: diff.diff,
      },
      {
        kind: 'run',
        id: 'trial-diff',
        title: 'switch to failing working tree diff',
        argv: script([
          'git reset -q --hard',
          ...(diff.diff ? [`git apply --whitespace=nowarn ${BAD_DIFF_PATH}`] : []),
        ]),
        cwd: base.repoDir,
        timeoutMs: MINUTE,
      },
    );
  }

  const dependencies = atoms.filter((atom) => atom.kind === 'dependency');
  if (dependencies.length > 0) {
    steps.push({
      kind: 'run',
      id: 'trial-dependencies',
      title: `install ${dependencies.map((d) => d.label).join(', ')}`,
      argv: [
        'npm',
        'install',
        '--no-save',
        '--no-audit',
        '--no-fund',
        ...dependencies.map((d) => `${d.name}@${d.version}`),
      ],
      cwd: base.dependencyDir,
      timeoutMs: 10 * MINUTE,
    });
  }

  const command = execArgv(base.argv);
  return {
    steps,
    env,
    // Replay can only add variables to the guest's session env; `env -u` removes them per command.
    argv:
      unset.length > 0 ? ['env', ...unset.flatMap((name) => ['-u', name]), ...command] : command,
    mutatesDisk: steps.length > 0,
  };
}
