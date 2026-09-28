import { TrackedBackend } from './backend/tracked.ts';
import type { Backend } from './backend/types.ts';
import type { Output } from './io.ts';

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
type Signal = (typeof SIGNALS)[number];

/** The slice of `process` that interrupt handling touches, injected for tests. */
export interface SignalSource {
  on(signal: Signal, listener: () => void): unknown;
  off(signal: Signal, listener: () => void): unknown;
  exit(code: number): void;
}

const short = (id: string) => id.slice(0, 12);

/**
 * Wraps the backend so that Ctrl-C (or a stop signal) while machines are live releases them,
 * confirmed, before exiting 130. The handler is installed only while a machine is live, so
 * commands that manage interrupts themselves (capture forwards Ctrl-C to the child) are untouched.
 * A second signal exits at once and names the machines for `twin gc`.
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
      stderr.write(
        `twin: not waiting; release ${live.map(short).join(', ') || 'leftovers'} with: twin gc\n`,
      );
      signals.exit(130);
      return;
    }
    interrupted = true;
    stderr.write(
      `\ntwin: interrupted, releasing ${live.map(short).join(', ')} (Ctrl-C again to skip)\n`,
    );
    void tracked.releaseAll().then(({ released, failed }) => {
      if (failed.length > 0) {
        stderr.write(
          `twin: could not confirm ${failed.map(short).join(', ')} is gone; run: twin gc\n`,
        );
      } else {
        stderr.write(`twin: released ${released.map(short).join(', ')}\n`);
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
