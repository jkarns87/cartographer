import type { Settler } from '../../../shared/api';
import { cellAt, isLand, sameCell } from '../../../shared/puzzle/grid';
import { LANDMARK_NAMES, SIZE } from '../../../shared/puzzle/types';
import type { Cell, LandMask, LandmarkId, Placement } from '../../../shared/puzzle/types';
import { Icon } from '../../icons/Icon';
import { landmarkAt } from '../reducer';

type Props = {
  land: LandMask;
  placements: Placement;
  highlight?: LandmarkId[] | undefined;
  settlers?: Settler[] | undefined;
  onCellTap?: ((cell: Cell) => void) | undefined;
  shakeCell?: Cell | null | undefined;
  size?: 'board' | 'cover' | undefined;
};

const CELLS: Cell[] = Array.from({ length: SIZE * SIZE }, (_, i) => cellAt(i));

/** Up to three settlers per cell, offset so they do not fully overlap. */
const SETTLER_OFFSETS = [
  { left: '50%', top: '50%' },
  { left: '28%', top: '34%' },
  { left: '72%', top: '66%' },
] as const;

const cellLabel = (cell: Cell, land: boolean, occupant: LandmarkId | undefined): string => {
  const where = `row ${cell.r + 1} column ${cell.c + 1}`;
  if (!land) return `${where}, water`;
  return `${where}, land, ${occupant ? LANDMARK_NAMES[occupant] : 'empty'}`;
};

/**
 * The 6x6 island: a CSS grid inside a water-colored frame. Water cells reject
 * taps (the parent shakes them), land cells show a placed landmark icon.
 * Settlers (the reveal) are small round avatars dropped into their cells.
 */
export const IslandView = ({
  land,
  placements,
  highlight,
  settlers,
  onCellTap,
  shakeCell,
  size = 'board',
}: Props) => {
  const interactive = onCellTap !== undefined;
  const isBoard = size === 'board';
  const meFirst = settlers ? [...settlers].sort((a, b) => Number(b.isMe) - Number(a.isMe)) : [];

  return (
    <div
      className={[
        'aspect-square w-full select-none rounded-xl bg-water p-1.5',
        isBoard ? 'shadow-inner' : '',
      ].join(' ')}
      role={interactive ? 'group' : 'img'}
      aria-label={interactive ? 'Island' : 'Island map'}
    >
      <div className="grid h-full w-full grid-cols-6 grid-rows-6 gap-px">
        {CELLS.map((cell) => {
          const landHere = isLand(land, cell);
          const occupant = landHere ? landmarkAt(placements, cell) : undefined;
          const shaking = shakeCell ? sameCell(shakeCell, cell) : false;
          const pulsing = occupant !== undefined && (highlight?.includes(occupant) ?? false);
          const here = meFirst.filter((s) => sameCell(s.cell, cell)).slice(0, 3);
          const label = cellLabel(cell, landHere, occupant);

          const surface = landHere
            ? 'bg-sand border border-land'
            : 'bg-water border border-transparent';
          const className = [
            'relative flex items-center justify-center rounded-sm',
            surface,
            interactive ? 'touch-manipulation cursor-pointer active:brightness-95' : '',
            interactive
              ? 'focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink'
              : '',
            shaking ? 'motion-safe:animate-shake' : '',
          ].join(' ');

          const content = (
            <>
              {occupant ? (
                <span
                  aria-hidden="true"
                  className={[
                    'flex items-center justify-center',
                    isBoard ? 'h-[70%] w-[70%]' : 'h-[72%] w-[72%]',
                    'text-ink drop-shadow-sm',
                    pulsing
                      ? 'motion-safe:animate-pulse-mark motion-reduce:[filter:drop-shadow(0_0_3px_var(--color-warn))]'
                      : '',
                  ].join(' ')}
                >
                  <Icon name={occupant} className="h-full w-full" />
                </span>
              ) : null}
              {here.map((settler, i) => {
                const offset = SETTLER_OFFSETS[i] ?? SETTLER_OFFSETS[0];
                const globalIndex = meFirst.indexOf(settler);
                const style = {
                  left: offset.left,
                  top: offset.top,
                  animationDelay: `${globalIndex * 60}ms`,
                };
                return (
                  <span
                    key={settler.userId}
                    data-settler={settler.isMe ? 'me' : 'other'}
                    className={[
                      'pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border bg-paper text-ink',
                      settler.isMe ? 'z-20 border-ink motion-safe:animate-settle-me' : 'z-10 border-land motion-safe:animate-settle',
                    ].join(' ')}
                    style={style}
                    title={settler.isMe ? 'You' : undefined}
                  >
                    {settler.snoovatar ? (
                      <img
                        src={settler.snoovatar}
                        alt={settler.isMe ? 'Your avatar' : ''}
                        className="h-full w-full object-cover object-top"
                        loading="lazy"
                      />
                    ) : (
                      <Icon name="tent" className="h-full w-full p-0.5" title={settler.isMe ? 'You' : ''} />
                    )}
                  </span>
                );
              })}
            </>
          );

          if (interactive) {
            return (
              <button
                key={`${cell.r}-${cell.c}`}
                type="button"
                aria-label={label}
                onClick={() => onCellTap(cell)}
                className={className}
              >
                {content}
              </button>
            );
          }
          return (
            <div key={`${cell.r}-${cell.c}`} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
};
