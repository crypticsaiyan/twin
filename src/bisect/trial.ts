import type { Step } from '../replay/plan.ts';
import { CAPSULE_DIFF_PATH, nodeDir, WORK_DIR } from '../replay/runtimes.ts';
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
  /** Whether the good world applied a working-tree diff (at CAPSULE_DIFF_PATH). */
  goodDiff: boolean;
}

/**
 * How to get back to the base world after a trial: nothing, a cheap git undo of working-tree
 * changes, or a full in-place revert (measured at 14 to 22 s on Solari) after dependency changes.
 */
export type Cleanup = { kind: 'none' } | { kind: 'undo'; steps: Step[] } | { kind: 'revert' };

export interface TrialPlan {
  /** Disk changes to make before running the command. */
  steps: Step[];
  env: Record<string, string>;
  argv: string[];
  cleanup: Cleanup;
}

function swapNode(path: string, atom: Extract<Atom, { kind: 'node' }>): string {
  const target = `${nodeDir(atom.version)}/bin`;
  if (atom.goodVersion === null) return `${target}:${path}`;
  return path.replace(`${nodeDir(atom.goodVersion)}/bin`, target);
}

/**
 * Swaps the good diff for the failing one with `git apply`, which is exactly reversible (it also
 * removes files a diff created), so undoing needs no revert.
 */
function diffSteps(
  diff: Extract<Atom, { kind: 'diff' }>,
  base: TrialBase,
): { apply: Step[]; undo: Step[] } {
  const good = `git apply --whitespace=nowarn ${CAPSULE_DIFF_PATH}`;
  const bad = `git apply --whitespace=nowarn ${BAD_DIFF_PATH}`;
  const reverse = (command: string) => command.replace('git apply', 'git apply -R');
  const hasBad = diff.diff.length > 0;
  const apply: Step[] = [];
  if (hasBad) {
    apply.push({
      kind: 'write',
      id: 'trial-diff-file',
      title: 'upload failing working tree diff',
      path: BAD_DIFF_PATH,
      content: diff.diff,
    });
  }
  apply.push({
    kind: 'run',
    id: 'trial-diff',
    title: 'switch to failing working tree diff',
    argv: script([...(base.goodDiff ? [reverse(good)] : []), ...(hasBad ? [bad] : [])]),
    cwd: base.repoDir,
    timeoutMs: MINUTE,
  });
  const undo: Step[] = [
    {
      kind: 'run',
      id: 'trial-diff-undo',
      title: 'restore good working tree',
      argv: script([...(hasBad ? [reverse(bad)] : []), ...(base.goodDiff ? [good] : [])]),
      cwd: base.repoDir,
      timeoutMs: MINUTE,
    },
  ];
  return { apply, undo };
}

/**
 * Applies a subset of atoms on top of the good world. Env, time zone and runtime changes are pure
 * process settings (both node versions are pre-installed in the base snapshot), so most trials run
 * without touching disk and need no cleanup at all.
 */
export function planTrial(atoms: readonly Atom[], base: TrialBase): TrialPlan {
  const env = { ...base.env };
  const unset: string[] = [];
  const steps: Step[] = [];
  let cleanup: Cleanup = { kind: 'none' };

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
    const { apply, undo } = diffSteps(diff, base);
    steps.push(...apply);
    cleanup = { kind: 'undo', steps: undo };
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
    // node_modules changes cannot be undone precisely; restore the snapshot instead.
    cleanup = { kind: 'revert' };
  }

  const command = execArgv(base.argv);
  return {
    steps,
    env,
    // Replay can only add variables to the guest's session env; `env -u` removes them per command.
    argv:
      unset.length > 0 ? ['env', ...unset.flatMap((name) => ['-u', name]), ...command] : command,
    cleanup,
  };
}
