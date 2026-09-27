import { randomUUID } from 'node:crypto';
import { type Backend, type Machine, TWIN_LABELS } from '../backend/types.ts';
import type { Capsule } from '../capsule/schema.ts';
import { planReplay, type Step } from '../replay/plan.ts';
import { type ReplayEvent, runStep, type StepResult } from '../replay/replay.ts';
import { installNodeScript, REPO_DIR } from '../replay/runtimes.ts';
import { script } from '../replay/shell.ts';
import { type AttemptResult, describeAttempt } from '../replay/verdict.ts';
import { type Atom, deriveAtoms, type Skipped } from './atoms.ts';
import { ddmin, type TrialResult } from './ddmin.ts';
import { planTrial, type TrialBase } from './trial.ts';

export type BisectVerdict =
  /** A minimal set of differences turns the good world into the failing one. */
  | 'found'
  /** The captured differences do not include anything bisect can vary. */
  | 'no-candidates'
  /** Building the good world failed. */
  | 'setup-failed'
  /** The good world fails on its own here, so differences cannot be blamed. */
  | 'baseline-fails'
  /** Applying every difference still does not fail the captured way. */
  | 'not-reproduced';

export interface TrialRecord {
  atoms: string[];
  result: TrialResult;
  attempts: AttemptResult[];
  durationMs: number;
}

export interface BisectReport {
  verdict: BisectVerdict;
  runId: string;
  backend: string;
  machineId: string | null;
  /** Labels of the minimal failure-inducing differences (empty unless found). */
  minimal: string[];
  candidates: string[];
  skipped: Skipped[];
  steps: StepResult[];
  trials: TrialRecord[];
  expectedSignature: string | null;
  /** Provider operation timings, reported as measured. */
  timings: { snapshotMs: number | null; revertsMs: number[] };
  notes: string[];
}

export type BisectEvent =
  | ReplayEvent
  | { type: 'trial-start'; index: number; atoms: string[] }
  | { type: 'trial-end'; index: number; trial: TrialRecord };

export interface BisectOptions {
  /** Runs per trial; a trial fails only if every run fails the captured way. */
  attempts?: number;
  commandTimeoutMs?: number;
  /** Values for variables the good capsule recorded by name only. */
  env?: Record<string, string>;
  onEvent?: (event: BisectEvent) => void;
}

const IDLE_TIMEOUT_MS = 20 * 60_000;
const MINUTE = 60_000;

function trialResult(attempts: readonly AttemptResult[], expected: string | null): TrialResult {
  if (attempts.every((a) => a.outcome === 'pass')) return 'pass';
  if (attempts.every((a) => a.signature !== null && a.signature === expected)) return 'fail';
  return 'unresolved';
}

/** Extra setup for the base snapshot: runtimes a trial may switch to are installed up front. */
function stagingSteps(atoms: readonly Atom[]): Step[] {
  return atoms.flatMap((atom): Step[] =>
    atom.kind === 'node'
      ? [
          {
            kind: 'run',
            id: 'stage-node',
            title: `pre-install node ${atom.version}`,
            argv: script(installNodeScript(atom.version)),
            timeoutMs: 5 * MINUTE,
          },
        ]
      : [],
  );
}

/**
 * Builds the good world once, snapshots it, then searches the differences with ddmin. Trials run
 * on the same machine: those that only change env, time zone or runtime need no reset, and those
 * that change files are followed by an in-place revert to the snapshot. One machine means it
 * works within a single concurrent slot.
 */
export async function bisect(
  good: Capsule,
  bad: Capsule,
  backend: Backend,
  options: BisectOptions = {},
): Promise<BisectReport> {
  const { atoms, skipped, notes } = deriveAtoms(good, bad);
  const emit = options.onEvent ?? (() => {});
  const expected = bad.command.failure?.signature ?? null;
  const report: BisectReport = {
    verdict: 'no-candidates',
    runId: randomUUID().slice(0, 8),
    backend: backend.name,
    machineId: null,
    minimal: [],
    candidates: atoms.map((atom) => atom.label),
    skipped,
    steps: [],
    trials: [],
    expectedSignature: expected,
    timings: { snapshotMs: null, revertsMs: [] },
    notes,
  };
  if (atoms.length === 0) return report;

  const plan = planReplay(good, {
    ...(options.env ? { env: options.env } : {}),
    ...(options.commandTimeoutMs ? { commandTimeoutMs: options.commandTimeoutMs } : {}),
  });
  report.notes.push(...plan.notes);
  const dependencyStep = plan.setup.find(
    (step): step is Extract<Step, { kind: 'run' }> =>
      step.kind === 'run' && step.id === 'dependencies',
  );
  const base: TrialBase = {
    env: plan.env,
    argv: good.command.argv,
    dependencyDir: dependencyStep?.cwd ?? REPO_DIR,
    repoDir: REPO_DIR,
  };

  const machine: Machine = await backend.create({
    labels: { ...TWIN_LABELS, run: report.runId },
    idleTimeoutMs: IDLE_TIMEOUT_MS,
  });
  report.machineId = machine.id;
  emit({ type: 'machine', id: machine.id });

  try {
    for (const step of [...plan.setup, ...stagingSteps(atoms)]) {
      const result = await runStep(machine, step, plan.env, emit);
      report.steps.push(result);
      if (!result.ok && !result.optional) {
        report.verdict = 'setup-failed';
        return report;
      }
    }
    const snapshotStarted = Date.now();
    const snapshot = await machine.snapshot(`twin-${report.runId}-base`);
    report.timings.snapshotMs = Date.now() - snapshotStarted;
    let dirty = false;

    const trial = async (subset: readonly Atom[]): Promise<TrialResult> => {
      const index = report.trials.length;
      const labels = subset.map((atom) => atom.label);
      emit({ type: 'trial-start', index, atoms: labels });
      const started = Date.now();
      if (dirty) {
        const revertStarted = Date.now();
        await machine.revert(snapshot);
        report.timings.revertsMs.push(Date.now() - revertStarted);
        dirty = false;
      }
      const planned = planTrial(subset, base);
      let result: TrialResult = 'unresolved';
      const attempts: AttemptResult[] = [];
      let setupOk = true;
      for (const step of planned.steps) {
        const stepResult = await runStep(machine, step, planned.env, emit);
        if (!stepResult.ok) {
          setupOk = false;
          break;
        }
      }
      dirty = planned.mutatesDisk;
      if (setupOk) {
        for (let i = 0; i < Math.max(1, options.attempts ?? 1); i++) {
          const outcome = await machine.run({
            argv: planned.argv,
            env: planned.env,
            cwd: plan.command.cwd ?? REPO_DIR,
            timeoutMs: plan.command.timeoutMs,
            onOutput: (chunk) => emit({ type: 'output', chunk }),
          });
          attempts.push(describeAttempt(outcome));
        }
        result = trialResult(attempts, expected);
      }
      const record: TrialRecord = {
        atoms: labels,
        result,
        attempts,
        durationMs: Date.now() - started,
      };
      report.trials.push(record);
      emit({ type: 'trial-end', index, trial: record });
      return result;
    };

    // Sanity checks bracket the search: the good world must pass and the full set must fail.
    if ((await trial([])) !== 'pass') {
      report.verdict = 'baseline-fails';
      return report;
    }
    if ((await trial(atoms)) !== 'fail') {
      report.verdict = 'not-reproduced';
      return report;
    }
    const { minimal } = await ddmin(atoms, trial, (atom) => atom.id);
    report.minimal = minimal.map((atom) => atom.label);
    report.verdict = 'found';
    return report;
  } finally {
    await machine.kill().catch((error: unknown) => {
      report.notes.push(`Could not release ${machine.id} (${String(error)}); run \`twin gc\`.`);
    });
  }
}
