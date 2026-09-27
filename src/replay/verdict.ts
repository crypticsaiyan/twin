import type { Capsule } from '../capsule/schema.ts';
import { Redactor } from '../redact/redactor.ts';
import { failureIdentity } from '../signature/signature.ts';

export type Verdict =
  /** Every attempt ended exactly as on the reporter's machine. */
  | 'reproduced'
  /** Every attempt failed the same way, but not the captured way. */
  | 'different-failure'
  /** The capsule recorded a failure; every attempt passed. */
  | 'not-reproduced'
  /** Attempts disagreed with each other. */
  | 'flaky'
  /** Setup failed or an attempt timed out, so nothing can be concluded. */
  | 'inconclusive';

export interface AttemptResult {
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  outcome: 'pass' | 'fail';
  /** Null for passing attempts. */
  signature: string | null;
  keyLines: string[];
}

/**
 * Fingerprints a replay attempt exactly like capture fingerprints the reporter's run: same
 * scrubbing, same normalization, so equal failures produce equal signatures.
 */
export function describeAttempt(run: {
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  output: string;
}): AttemptResult {
  const failed = run.timedOut || run.exitCode !== 0;
  if (!failed) {
    return {
      exitCode: run.exitCode,
      timedOut: false,
      durationMs: run.durationMs,
      outcome: 'pass',
      signature: null,
      keyLines: [],
    };
  }
  const identity = failureIdentity(
    { exitCode: run.exitCode, signal: null },
    new Redactor().scrub(run.output),
  );
  return {
    exitCode: run.exitCode,
    timedOut: run.timedOut,
    durationMs: run.durationMs,
    outcome: 'fail',
    ...identity,
  };
}

export function classify(capsule: Capsule, attempts: readonly AttemptResult[]): Verdict {
  if (attempts.length === 0 || attempts.some((attempt) => attempt.timedOut)) return 'inconclusive';
  const keys = new Set(attempts.map((attempt) => attempt.signature ?? 'pass'));
  if (keys.size > 1) return 'flaky';
  const [only] = keys;
  const expected = capsule.command.failure?.signature ?? 'pass';
  if (only === expected) return 'reproduced';
  if (only === 'pass') return 'not-reproduced';
  return 'different-failure';
}
