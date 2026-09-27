import type { ReplayReport } from '../replay/replay.ts';
import type { Verdict } from '../replay/verdict.ts';
import type { Style } from './style.ts';

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** Solari sandbox ids run to ~200 characters; the header only needs to be recognizable. */
export function shortId(id: string | null): string {
  if (id === null) return '-';
  return id.length > 20 ? `${id.slice(0, 16)}…` : id;
}

const VERDICT_TEXT: Record<Verdict, string> = {
  reproduced: 'REPRODUCED: every attempt failed exactly as the capsule recorded.',
  'different-failure': 'DIFFERENT FAILURE: it fails here, but not the way the capsule recorded.',
  'not-reproduced':
    'NOT REPRODUCED: the same versions pass on this Linux machine. The difference is likely in what replay cannot copy (OS, unset env values, local files).',
  flaky: 'FLAKY: attempts disagreed with each other.',
  inconclusive: 'INCONCLUSIVE: setup failed or an attempt timed out.',
};

/** The same outcomes read from the other side: a verify run hopes the failure is gone. */
const VERIFY_TEXT: Record<Verdict, string> = {
  reproduced: 'STILL FAILING: the fix does not change the captured failure.',
  'different-failure': 'DIFFERENT FAILURE: with the fix it still fails, but differently.',
  'not-reproduced': "FIXED: the command passes in the reporter's environment with the fix applied.",
  flaky: 'FLAKY: attempts disagreed with each other.',
  inconclusive: 'INCONCLUSIVE: setup failed (does the fix apply?) or an attempt timed out.',
};

function verdictLine(verdict: Verdict, style: Style, verify: boolean): string {
  if (verify) {
    const text = VERIFY_TEXT[verdict];
    if (verdict === 'not-reproduced') return style.green(text);
    return verdict === 'flaky' ? style.yellow(text) : style.red(text);
  }
  const text = VERDICT_TEXT[verdict];
  if (verdict === 'reproduced') return style.green(text);
  if (verdict === 'not-reproduced' || verdict === 'flaky') return style.yellow(text);
  return style.red(text);
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

export function renderReplay(
  report: ReplayReport,
  style: Style,
  options: { verify?: boolean } = {},
): string {
  const lines = [
    style.bold(`Replay on ${report.backend}`) +
      style.dim(` (machine ${shortId(report.machineId)}, run ${report.runId})`),
  ];

  for (const step of report.steps) {
    const mark = step.ok ? style.green('✓') : step.optional ? style.yellow('!') : style.red('✗');
    const status = step.ok ? '' : ` (exit ${step.exitCode ?? 'timeout'})`;
    lines.push(`  ${mark} ${step.title}${status}  ${style.dim(seconds(step.durationMs))}`);
    if (step.outputTail) lines.push(style.dim(indent(step.outputTail, '      ')));
  }

  if (report.attempts.length > 0) {
    lines.push('', style.bold('Attempts'));
    report.attempts.forEach((attempt, index) => {
      const result =
        attempt.outcome === 'pass'
          ? style.green('PASS')
          : style.red(attempt.timedOut ? 'TIMEOUT' : `FAIL exit ${attempt.exitCode}`);
      const parts = [
        String(index + 1),
        result,
        attempt.signature,
        style.dim(seconds(attempt.durationMs)),
      ];
      lines.push(`  ${parts.filter(Boolean).join('  ')}`);
    });
    const expected =
      report.expected.outcome === 'pass' ? 'PASS' : `FAIL ${report.expected.signature}`;
    lines.push(`  ${style.dim('expected')}  ${expected}`);
    const first = report.attempts.find(
      (attempt) => attempt.signature !== report.expected.signature,
    );
    if (first?.keyLines.length) {
      lines.push(
        '',
        style.bold('Key lines here'),
        style.dim(indent(first.keyLines.join('\n'), '  ')),
      );
      if (report.expected.keyLines.length) {
        lines.push(
          style.bold('Key lines in capsule'),
          style.dim(indent(report.expected.keyLines.join('\n'), '  ')),
        );
      }
    }
  }

  lines.push('', verdictLine(report.verdict, style, options.verify === true));

  if (report.kept) {
    lines.push(
      `Machine ${report.machineId} kept at the failure (snapshot ${report.failureSnapshot}).`,
      style.dim('It is released after 15 minutes idle, or now with: twin gc'),
    );
  }
  if (report.notes.length > 0) {
    lines.push('', style.bold('Notes'), ...report.notes.map((note) => `  - ${note}`));
  }
  return lines.join('\n');
}
