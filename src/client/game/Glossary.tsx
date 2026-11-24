import { useEffect, useId, useRef } from 'react';

import { TERMS } from './terms';

type Props = { onClose: () => void };

/** The terminology sheet, opened from the Terms button. Escape or Close dismisses it. */
export const Glossary = ({ onClose }: Props) => {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85dvh] w-full max-w-sm flex-col gap-4 rounded-2xl border border-land bg-paper p-5 text-ink shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Terms
        </h2>
        <dl className="flex flex-col gap-3 overflow-y-auto text-sm leading-relaxed">
          {TERMS.map((t) => (
            <div key={t.term}>
              <dt className="font-semibold">{t.term}</dt>
              <dd className="text-ink/80">{t.meaning}</dd>
            </div>
          ))}
        </dl>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="h-12 rounded-xl bg-lit px-4 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lit"
        >
          Close
        </button>
      </div>
    </div>
  );
};
