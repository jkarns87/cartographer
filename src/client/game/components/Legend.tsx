import { LANDMARK_NAMES } from '../../../shared/puzzle/types';
import type { LandmarkId, Placement } from '../../../shared/puzzle/types';
import { Icon } from '../../icons/Icon';

type Props = {
  landmarks: LandmarkId[];
  placements: Placement;
  selected: LandmarkId | null;
  onSelect: (id: LandmarkId) => void;
  onLift: (id: LandmarkId) => void;
  highlight?: LandmarkId[] | undefined;
};

/**
 * One chip per landmark. A placed chip goes grayscale with a check and lifts
 * its landmark when tapped; an unplaced chip selects it. Spec 4.3.
 */
export const Legend = ({ landmarks, placements, selected, onSelect, onLift, highlight }: Props) => {
  const remaining = landmarks.filter((id) => placements[id] === undefined).length;
  return (
    <section aria-label="Landmarks" className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2" role="list">
        {landmarks.map((id) => {
          const placed = placements[id] !== undefined;
          const isSelected = selected === id;
          const pulsing = highlight?.includes(id) ?? false;
          const label = `${LANDMARK_NAMES[id]}${placed ? ', placed' : isSelected ? ', selected' : ''}`;
          return (
            <li key={id}>
              <button
                type="button"
                aria-label={label}
                aria-pressed={placed}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => (placed ? onLift(id) : onSelect(id))}
                className={[
                  'relative flex h-11 w-11 items-center justify-center rounded-lg border bg-sand text-ink',
                  'transition-[box-shadow,filter,opacity] motion-reduce:transition-none',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-water-deep',
                  placed ? 'border-land opacity-60 grayscale' : 'border-land',
                  isSelected ? 'ring-2 ring-water-deep ring-offset-2 ring-offset-paper' : '',
                  pulsing ? 'motion-safe:animate-pulse-mark motion-reduce:ring-2 motion-reduce:ring-warn' : '',
                ].join(' ')}
              >
                <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center">
                  <Icon name={id} className="h-full w-full" />
                </span>
                {placed ? (
                  <span
                    data-check=""
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-lit text-[10px] font-bold leading-none text-white"
                  >
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="min-h-5 text-sm text-ink/80" aria-live="polite">
        {selected ? (
          <>
            Placing <span className="font-semibold">{LANDMARK_NAMES[selected]}</span>
            <span className="text-ink/60">
              {' '}
              · {remaining} left
            </span>
          </>
        ) : (
          <span>All landmarks placed. Tap one on the island to move it.</span>
        )}
      </p>
    </section>
  );
};
