import { useEffect, useId, useRef, useState } from 'react';

import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/Icon';
import { postTutorialSeen } from './api';

type Step = { title: string; body: string; icon: IconName };

const STEPS: readonly Step[] = [
  {
    title: 'Pick an icon',
    body: 'Tap a landmark in the legend of icons to select it.',
    icon: 'lighthouse',
  },
  {
    title: 'Tap the island',
    body: 'Tap a land cell to place it. Tap a placed landmark to lift it again; each lift counts as a correction.',
    icon: 'windmill',
  },
  {
    title: 'Light every clue',
    body: 'Clues turn green when your chart satisfies them. When every clue is lit, tap Chart it.',
    icon: 'beacon',
  },
];

/**
 * First-run overlay: three short steps with Next and Skip. Dismissing it (Skip,
 * the last Next, or Escape) hides it for this session and tells the server, so
 * it never shows again for this user. The server call is fire-and-forget.
 */
export const Tutorial = () => {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const titleId = useId();
  const bodyId = useId();
  const nextRef = useRef<HTMLButtonElement>(null);

  const current = STEPS[step] ?? STEPS[0];
  const last = step >= STEPS.length - 1;

  useEffect(() => {
    if (open) nextRef.current?.focus();
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        void postTutorialSeen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !current) return null;

  const dismiss = () => {
    setOpen(false);
    void postTutorialSeen();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-land bg-paper p-5 text-ink shadow-xl"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-land bg-paper"
          >
            <Icon name={current.icon} className="h-8 w-8" title="" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 id={titleId} className="text-lg font-semibold">
              {current.title}
            </h2>
          </div>
        </div>
        <p id={bodyId} className="text-sm leading-relaxed text-ink/80">
          {current.body}
        </p>
        <div aria-hidden="true" className="flex justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={['h-1.5 w-6 rounded-full', i === step ? 'bg-lit' : 'bg-land'].join(' ')}
            />
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="h-12 flex-1 rounded-xl border border-land bg-paper px-4 text-base font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Skip
          </button>
          <button
            ref={nextRef}
            type="button"
            onClick={() => (last ? dismiss() : setStep(step + 1))}
            className="h-12 flex-1 rounded-xl bg-lit px-4 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lit"
          >
            {last ? 'Start charting' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};
