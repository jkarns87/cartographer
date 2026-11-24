import { HINT_PENALTY_MS } from '../../../shared/puzzle/hints';
import type { Hint } from '../../../shared/puzzle/hints';
import { hintText } from './hintText';

type Props = {
  hintsLeft: number;
  /** The hint to show, or null when none is current. */
  hint: Hint | null;
  onHint: () => void;
};

/**
 * "Ask for a hint" with the hints left, the cost, and the current hint. The
 * page decides when the hint is current (it clears on the next place or lift).
 */
export const HintPanel = ({ hintsLeft, hint, onHint }: Props) => (
  <section aria-label="Hints" className="flex flex-col gap-2">
    <button
      type="button"
      disabled={hintsLeft <= 0}
      onClick={onHint}
      className="flex h-12 items-center justify-center rounded-xl border border-land bg-paper px-4 text-base font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
    >
      {hintsLeft > 0 ? `Ask for a hint (${hintsLeft} left)` : 'No hints left'}
    </button>
    <p className="text-center text-xs text-muted">
      Each hint adds {HINT_PENALTY_MS / 1000} seconds to your time.
    </p>
    {hint ? (
      <p
        role="status"
        className="rounded-lg border border-water-deep/50 bg-water/20 px-3 py-2 text-center text-sm text-ink"
      >
        {hintText(hint)}
      </p>
    ) : null}
  </section>
);
