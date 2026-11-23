import { clueLandmarks } from '../../../shared/puzzle/predicates';
import { clueParts } from '../../../shared/puzzle/templates';
import { LANDMARK_NAMES } from '../../../shared/puzzle/types';
import type { Clue, ClueState, LandmarkId } from '../../../shared/puzzle/types';
import { Icon } from '../../icons/Icon';

type Props = {
  clues: Clue[];
  states: ClueState[];
  highlighted: LandmarkId[];
  onTapClue: (index: number) => void;
};

/** Shape and color together: pending hollow circle, lit green check, contradicted amber mark. */
const GLYPH: Record<ClueState, { char: string; className: string }> = {
  pending: { char: '○', className: 'text-ink/50' },
  lit: { char: '✓', className: 'text-lit' },
  contradicted: { char: '!', className: 'text-warn' },
};

/**
 * The surveyor's clue sheet. Each row is a button: tapping it asks the page to
 * pulse the landmarks the clue names. A row is highlighted while any of its
 * landmarks is in `highlighted`.
 */
export const ClueSheet = ({ clues, states, highlighted, onTapClue }: Props) => (
  <section aria-label="Clue sheet" className="flex flex-col gap-1">
    <h2 className="text-xs font-semibold tracking-wide text-ink/60 uppercase">Survey notes</h2>
    <ol className="flex flex-col divide-y divide-land/60 rounded-xl border border-land bg-sand/60">
      {clues.map((clue, i) => {
        const state = states[i] ?? 'pending';
        const glyph = GLYPH[state];
        const named = clueLandmarks(clue);
        const isHighlighted = named.some((id) => highlighted.includes(id));
        return (
          <li
            key={i}
            data-state={state}
            data-highlighted={isHighlighted ? 'true' : 'false'}
            className={[
              'transition-colors motion-reduce:transition-none',
              isHighlighted ? 'bg-warn/15' : '',
            ].join(' ')}
          >
            <button
              type="button"
              onClick={() => onTapClue(i)}
              className="flex min-h-11 w-full items-start gap-3 px-3 py-2 text-left text-[15px] leading-snug text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-water-deep"
            >
              <span
                role="img"
                aria-label={state}
                className={['mt-px w-5 shrink-0 text-center font-bold', glyph.className].join(' ')}
              >
                {glyph.char}
              </span>
              <span className="flex-1">
                {clueParts(clue).map((part, j) =>
                  'text' in part ? (
                    <span key={j}>{part.text}</span>
                  ) : (
                    <span key={j} className="inline-flex items-baseline gap-1 whitespace-nowrap">
                      <span
                        aria-hidden="true"
                        className="inline-block h-[1.1em] w-[1.1em] translate-y-[0.15em]"
                      >
                        <Icon name={part.landmark} className="h-full w-full" />
                      </span>
                      <span className="font-semibold">
                        {LANDMARK_NAMES[part.landmark]}
                      </span>
                    </span>
                  )
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  </section>
);
