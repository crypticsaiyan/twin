/**
 * Playback for the landing page demos. The server renders every demo in its final state,
 * read from the recorded runs in examples/echarts-21538; this script only replays them.
 *
 * - Nothing is hidden until a demo is about to be seen, and then only while it plays.
 * - With prefers-reduced-motion, nothing moves: demos stay in their final state, and the
 *   step controls (capsule sections, bisect stages, MCP calls) switch instantly.
 * - Durations are the recorded ones, compressed: a 46 s npm ci plays in about 1.5 s.
 */
import { animate, inView } from 'motion';

type Controls = { stop(): void; finished: Promise<unknown> };

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = [0.22, 1, 0.36, 1] as const;

/** Recorded seconds to playback milliseconds. */
const compress = (seconds: number) => Math.min(1500, 160 + seconds * 28);

class Cancelled extends Error {}

/** One run at a time per demo: starting again, or any click on its controls, cancels it. */
class Player {
  private token = 0;
  private running = new Set<Controls>();

  stop() {
    this.token++;
    for (const controls of this.running) controls.stop();
    this.running.clear();
  }

  begin() {
    this.stop();
    const token = this.token;
    const live = () => {
      if (token !== this.token) throw new Cancelled();
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) =>
        setTimeout(() => (token === this.token ? resolve() : reject(new Cancelled())), ms),
      );
    const track = (controls: Controls) => {
      live();
      this.running.add(controls);
      const done = () => this.running.delete(controls);
      controls.finished.then(done, done);
      return controls;
    };
    return { live, wait, track };
  }
}

type Run = ReturnType<Player['begin']>;

type Demo = {
  /** The state a demo starts playing from. */
  reset(figure: HTMLElement): void;
  play(figure: HTMLElement, run: Run): Promise<void>;
  /** The final state, as the server rendered it. */
  finish(figure: HTMLElement): void;
  /** Step controls; `interrupt` stops playback before the control acts. */
  wire?(figure: HTMLElement, interrupt: () => void): void;
};

const finalHtml = new WeakMap<HTMLElement, string>();
const all = <T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string) =>
  Array.from(root.querySelectorAll<T>(selector));
const outputLines = (figure: HTMLElement) => all(figure, ':scope > pre .ln');

function restore(element: HTMLElement) {
  element.classList.remove('pending', 'typing');
  const html = finalHtml.get(element);
  if (html !== undefined && element.innerHTML !== html) element.innerHTML = html;
  element.style.removeProperty('opacity');
  element.style.removeProperty('transform');
  element.style.removeProperty('clip-path');
}

function conceal(element: HTMLElement) {
  restore(element);
  element.style.opacity = '0';
}

function reveal(run: Run, element: HTMLElement) {
  restore(element);
  return run.track(animate(element, { opacity: [0, 1], y: [3, 0] }, { duration: 0.22, ease: EASE }));
}

/** A verdict is stamped in with a quick left-to-right wipe. */
async function stamp(run: Run, element: HTMLElement) {
  restore(element);
  await run.track(
    animate(
      element,
      { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'] },
      { duration: 0.45, ease: EASE },
    ),
  ).finished;
  run.live();
  element.style.removeProperty('clip-path');
}

/** Types a command line, then puts back its highlighted markup. */
async function type(run: Run, element: HTMLElement, perSecond = 60) {
  const text = element.dataset.type ?? '';
  restore(element);
  element.classList.add('typing');
  element.textContent = '';
  await run.wait(220);
  await run.track(
    animate(0, text.length, {
      duration: text.length / perSecond,
      ease: 'linear',
      onUpdate: (count: number) => {
        element.textContent = text.slice(0, Math.round(count));
      },
    }),
  ).finished;
  run.live();
  await run.wait(260);
  restore(element);
}

/** A step or attempt: shown running for its (compressed) recorded time, then done. */
async function step(run: Run, element: HTMLElement, onStart?: () => void) {
  restore(element);
  element.classList.add('pending');
  element.innerHTML = element.dataset.pending ?? '';
  onStart?.();
  await run.wait(compress(Number(element.dataset.seconds) || 0));
  restore(element);
}

/** Plays one output line according to what it is. */
async function playLine(run: Run, element: HTMLElement, onStep?: (phase: 'start' | 'end') => void) {
  if (element.dataset.type !== undefined) return type(run, element);
  if (element.dataset.pending !== undefined) {
    await step(run, element, () => onStep?.('start'));
    onStep?.('end');
    return;
  }
  if (element.classList.contains('verdict')) return stamp(run, element);
  reveal(run, element);
  await run.wait(element.classList.contains('blank') ? 40 : 75);
}

/* Hero: three commands and their verdicts. */
const hero: Demo = {
  reset(figure) {
    outputLines(figure).forEach(conceal);
  },
  async play(figure, run) {
    for (const line of outputLines(figure)) await playLine(run, line);
  },
  finish(figure) {
    outputLines(figure).forEach(restore);
  },
};

/* Replay and verify: a report streamed step by step; verify also applies the patch. */
const patchStates: Record<string, string> = {
  waiting: 'not applied',
  upload: 'uploading',
  apply: 'applying',
  applied: 'applied',
};

function setPatch(figure: HTMLElement, state: string) {
  const patch = figure.querySelector<HTMLElement>('.patch');
  if (!patch) return;
  patch.dataset.state = state;
  const label = patch.querySelector('.patch-state');
  if (label) label.textContent = patchStates[state] ?? state;
}

const stream: Demo = {
  reset(figure) {
    outputLines(figure).forEach(conceal);
    setPatch(figure, 'waiting');
  },
  async play(figure, run) {
    for (const line of outputLines(figure)) {
      const ref = line.dataset.ref;
      await playLine(run, line, (phase) => {
        if (!ref) return;
        if (phase === 'start') setPatch(figure, ref);
        else if (ref === 'apply') setPatch(figure, 'applied');
      });
    }
  },
  finish(figure) {
    outputLines(figure).forEach(restore);
    setPatch(figure, 'applied');
  },
};

/* Capture: the capsule written section by section; sections can be picked to focus them. */
const captureTabs = (figure: HTMLElement) => all<HTMLButtonElement>(figure, '.tabs button');
const captureRows = (figure: HTMLElement) => all(figure, '.cap-row');

function focusGroup(figure: HTMLElement, group: string | null) {
  for (const tab of captureTabs(figure)) {
    tab.setAttribute('aria-pressed', String(tab.dataset.group === group));
  }
  for (const row of captureRows(figure)) {
    row.classList.toggle('faded', group !== null && row.dataset.group !== group);
  }
}

const capture: Demo = {
  reset(figure) {
    focusGroup(figure, null);
    captureRows(figure).forEach(conceal);
    all(figure, '.cap-note').forEach(conceal);
  },
  async play(figure, run) {
    const groups = captureTabs(figure).map((tab) => tab.dataset.group ?? '');
    for (const group of groups) {
      for (const tab of captureTabs(figure)) {
        tab.setAttribute('aria-pressed', String(tab.dataset.group === group));
      }
      for (const row of captureRows(figure).filter((row) => row.dataset.group === group)) {
        reveal(run, row);
        const note = row.querySelector<HTMLElement>('.cap-note');
        if (note) {
          await run.wait(160);
          reveal(run, note);
        }
        await run.wait(110);
      }
      await run.wait(group === 'environment' ? 900 : 420);
    }
    focusGroup(figure, null);
  },
  finish(figure) {
    captureRows(figure).forEach(restore);
    all(figure, '.cap-note').forEach(restore);
    focusGroup(figure, null);
  },
  wire(figure, interrupt) {
    for (const tab of captureTabs(figure)) {
      tab.addEventListener('click', () => {
        interrupt();
        capture.finish(figure);
        const pressed = tab.getAttribute('aria-pressed') === 'true';
        focusGroup(figure, pressed ? null : (tab.dataset.group ?? null));
      });
    }
  },
};

/* Bisect: compare, trial 1, trial 2, result. Each stage can be picked. */
const bisectTabs = (figure: HTMLElement) => all<HTMLButtonElement>(figure, '.tabs button');

function setStage(figure: HTMLElement, stage: number) {
  figure.dataset.stage = String(stage);
  for (const tab of bisectTabs(figure)) {
    tab.setAttribute('aria-pressed', String(Number(tab.dataset.stage) === stage));
  }
}

function showStage(figure: HTMLElement, stage: number) {
  setStage(figure, stage);
  all(figure, '.compare tbody tr').forEach(restore);
  for (const line of outputLines(figure)) {
    if (Number(line.dataset.stage) <= stage) restore(line);
    else conceal(line);
  }
}

const bisect: Demo = {
  reset(figure) {
    setStage(figure, 0);
    all(figure, '.compare tbody tr').forEach(conceal);
    outputLines(figure).forEach(conceal);
  },
  async play(figure, run) {
    const lines = outputLines(figure);
    for (const line of lines.filter((line) => line.dataset.stage === '0')) await playLine(run, line);
    for (const row of all(figure, '.compare tbody tr')) {
      reveal(run, row);
      await run.wait(90);
    }
    await run.wait(450);
    for (const stage of [1, 2, 3, 4]) {
      setStage(figure, stage);
      await run.wait(250);
      for (const line of lines.filter((line) => Number(line.dataset.stage) === stage)) {
        await playLine(run, line);
      }
      if (stage < 4) await run.wait(750);
    }
  },
  finish(figure) {
    showStage(figure, 4);
  },
  wire(figure, interrupt) {
    for (const tab of bisectTabs(figure)) {
      tab.addEventListener('click', () => {
        interrupt();
        showStage(figure, Number(tab.dataset.stage));
      });
    }
  },
};

/* Agents: the MCP session on its recorded time axis; any call can be selected. */
const callButtons = (figure: HTMLElement) => all<HTMLButtonElement>(figure, '.call button');

function selectCall(figure: HTMLElement, index: number) {
  callButtons(figure).forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  all(figure, '.seg').forEach((seg, i) => seg.classList.toggle('current', i === index));
  all(figure, '.call-out pre').forEach((pre, i) => (pre.hidden = i !== index));
}

const initialCall = new WeakMap<HTMLElement, number>();

const agents: Demo = {
  reset(figure) {
    selectCall(figure, -1);
    all(figure, '.call').forEach(conceal);
    all(figure, '.seg .fill').forEach((fill) => (fill.style.transform = 'scaleX(0)'));
  },
  async play(figure, run) {
    const calls = all(figure, '.call');
    const fills = all(figure, '.seg .fill');
    const durations = all(figure, '.call-time').map((time) => Number.parseFloat(time.textContent ?? '0'));
    for (const [index, call] of calls.entries()) {
      reveal(run, call);
      selectCall(figure, index);
      fills[index].style.removeProperty('transform');
      await run.track(
        animate(
          fills[index],
          { scaleX: [0, 1] },
          { duration: Math.max(0.45, durations[index] * 0.025), ease: 'linear' },
        ),
      ).finished;
      run.live();
      await run.wait(160);
    }
  },
  finish(figure) {
    all(figure, '.call').forEach(restore);
    all(figure, '.seg .fill').forEach(restore);
    selectCall(figure, initialCall.get(figure) ?? 0);
  },
  wire(figure, interrupt) {
    initialCall.set(figure, Number(figure.dataset.selected ?? 0));
    const pick = (index: number) => {
      interrupt();
      agents.finish(figure);
      selectCall(figure, index);
    };
    callButtons(figure).forEach((button, index) => button.addEventListener('click', () => pick(index)));
    all(figure, '.seg').forEach((seg, index) => seg.addEventListener('click', () => pick(index)));
  },
};

const demos: Record<string, Demo> = { hero, stream, capture, bisect, agents };

for (const figure of all(document, '[data-demo]')) {
  const demo = demos[figure.dataset.demo ?? ''];
  if (!demo) continue;
  for (const line of all(figure, '.ln')) finalHtml.set(line, line.innerHTML);

  const player = new Player();
  let touched = false;
  const interrupt = () => {
    touched = true;
    player.stop();
  };
  demo.wire?.(figure, interrupt);
  if (reduced) continue;

  const play = () => {
    const run = player.begin();
    demo.reset(figure);
    demo.play(figure, run).catch((error) => {
      if (!(error instanceof Cancelled)) {
        demo.finish(figure);
        throw error;
      }
    });
  };

  const again = figure.querySelector<HTMLButtonElement>('.again');
  if (again) {
    again.hidden = false;
    again.addEventListener('click', () => {
      touched = true;
      play();
    });
  }

  if (figure.dataset.demo === 'hero') {
    play();
    document.documentElement.classList.remove('hero-armed');
    continue;
  }

  // Blank the demo just before it scrolls into view, then play it once it is well in view.
  // Both callbacks come from the same observer type, so a primed demo always gets played.
  const unprime = inView(
    figure,
    () => {
      if (!touched) demo.reset(figure);
      unprime();
    },
    { margin: '0px 0px 40% 0px' },
  );
  const unplay = inView(
    figure,
    () => {
      if (!touched) play();
      unplay();
    },
    { amount: 0.3 },
  );
}
