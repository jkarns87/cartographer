import { useEffect, useState } from 'react';

import { formatElapsed } from '../format';

type Props = {
  name: string;
  /** Server clock when the timer started. */
  startedAt: number;
  /** Server clock when the page loaded; anchors the client tick to the server offset. */
  serverNow: number;
  corrections: number;
  solved: boolean;
};

const TICK_MS = 250;

/**
 * Island name, running timer and corrections. The timer is server-anchored:
 * elapsed = (serverNow - startedAt) + time since this component mounted, so a
 * skewed device clock cannot shift it. It freezes once `solved` is true.
 */
export const Header = ({ name, startedAt, serverNow, corrections, solved }: Props) => {
  const base = Math.max(0, serverNow - startedAt);
  const [elapsed, setElapsed] = useState(base);

  useEffect(() => {
    if (solved) return;
    const mountedAt = Date.now();
    const id = setInterval(() => setElapsed(base + (Date.now() - mountedAt)), TICK_MS);
    return () => clearInterval(id);
  }, [base, solved]);

  // Once solved the page passes the server-measured time through `serverNow`.
  const shown = solved ? base : elapsed;

  return (
    <header className="flex items-baseline justify-between gap-3">
      <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{name}</h1>
      <dl className="flex shrink-0 items-baseline gap-4 text-sm tabular-nums text-ink/80">
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">Time</dt>
          <dd aria-label={`Time ${formatElapsed(shown)}`} className="font-mono text-base text-ink">
            {formatElapsed(shown)}
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="text-muted">Corrections</dt>
          <dd className="font-semibold text-ink">{corrections}</dd>
        </div>
      </dl>
    </header>
  );
};
