import { TrackedBackend } from './backend/tracked.ts';
import type { Backend } from './backend/types.ts';
import type { Output } from './io.ts';
import { shortMachineId } from './shell/machines.ts';

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
type Signal = (typeof SIGNALS)[number];

/** The slice of `process` that interrupt handling touches, injected for tests. */
export interface SignalSource {
  on(signal: Signal, listener: () => void): unknown;
  off(signal: Signal, listener: () => void): unknown;
  exit(code: number): void;
}

/** Short ids, or `fallback` when there are none yet (a machine still being created). */
const names = (ids: readonly string[], fallback: string) =>
  ids.map(shortMachineId).join(', ') || fallback;

/**
 * Wraps the backend so that Ctrl-C (or a stop signal) while machines are live releases them,
 * confirmed, before exiting 130. The handler is installed only while a machine is live or being
 * created, so commands that manage interrupts themselves (capture forwards Ctrl-C to the child)
 * are untouched.
 * A second signal exits at once and names the machines for `twin stop`.
 */
export function interruptible(
  getInner: () => Promise<Backend>,
  deps: { signals: SignalSource; stderr: Output },
): () => Promise<Backend> {
  let backend: TrackedBackend | undefined;
  let interrupted = false;
  const { signals, stderr } = deps;

  const onSignal = () => {
    const tracked = backend as TrackedBackend;
    const live = tracked.live;
    if (interrupted) {
      stderr.write(`twin: not waiting; stop ${names(live, 'leftovers')} with: twin stop\n`);
      signals.exit(130);
      return;
    }
    interrupted = true;
    stderr.write(
      `\ntwin: interrupted, releasing ${names(live, 'the machine being created')} (Ctrl-C again to skip)\n`,
    );
    void tracked.releaseAll().then(({ released, failed }) => {
      if (failed.length > 0) {
        stderr.write(`twin: could not confirm ${names(failed, '')} is gone; run: twin stop\n`);
      } else {
        stderr.write(`twin: released ${names(released, 'nothing')}\n`);
      }
      signals.exit(130);
    });
  };

  return async () => {
    backend ??= new TrackedBackend(await getInner(), {
      onLive: () => {
        for (const signal of SIGNALS) signals.on(signal, onSignal);
      },
      onIdle: () => {
        // During an interrupt the handler stays, so a second Ctrl-C can still skip the wait.
        if (interrupted) return;
        for (const signal of SIGNALS) signals.off(signal, onSignal);
      },
    });
    return backend;
  };
}
