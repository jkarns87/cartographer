import { useState } from 'react';

import type { Settler } from '../../../shared/api';
import { cellAt, isLand, landmarkAt, sameCell } from '../../../shared/puzzle/grid';
import { LANDMARK_NAMES, SIZE } from '../../../shared/puzzle/types';
import type { Cell, LandMask, LandmarkId, Placement } from '../../../shared/puzzle/types';
import { Icon } from '../../icons/Icon';
import { compassCorner } from './compass';
import { CompassRose } from './CompassRose';

type Props = {
  land: LandMask;
  placements: Placement;
  highlight?: LandmarkId[] | undefined;
  /** Cells a hint points at; drawn with a ring. */
  highlightCells?: Cell[] | undefined;
  settlers?: Settler[] | undefined;
  onCellTap?: ((cell: Cell) => void) | undefined;
  shakeCell?: Cell | null | undefined;
  size?: 'board' | 'cover' | undefined;
};

const CELLS: Cell[] = Array.from({ length: SIZE * SIZE }, (_, i) => cellAt(i));

/**
 * Up to three settlers per cell. The first (yours, when you share the cell) sits
 * in the centre; the other two go to opposite corners so they still peek out
 * from behind your larger 28 px avatar.
 */
const SETTLER_OFFSETS = [
  { left: '50%', top: '50%' },
  { left: '24%', top: '28%' },
  { left: '76%', top: '72%' },
] as const;

/**
 * A settler's snoovatar, falling back to the tent glyph when there is none or
 * the image fails to load (expired CDN URL, blocked host). Loaded eagerly: the
 * reveal is short and lazy images inside the animated board can stay blank.
 */
const SettlerAvatar = ({ settler }: { settler: Settler }) => {
  const [broken, setBroken] = useState(false);
  if (broken || !settler.snoovatar) {
    return <Icon name="tent" className="h-full w-full p-0.5" title={settler.isMe ? 'You' : ''} />;
  }
  return (
    <img
      src={settler.snoovatar}
      alt={settler.isMe ? 'Your avatar' : ''}
      className="h-full w-full object-cover object-top"
      onError={() => setBroken(true)}
    />
  );
};

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
  highlightCells,
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
        'relative w-full select-none rounded-xl bg-water p-1.5',
        isBoard ? 'shadow-inner' : '',
      ].join(' ')}
      role={interactive ? 'group' : 'img'}
      aria-label={interactive ? 'Island' : 'Island map'}
    >
      {/* Painted first so the cells stack over it: sand tiles hide the rose and
          the transparent water cells show it. */}
      <CompassRose corner={compassCorner(land)} className={isBoard ? 'w-[30%]' : 'w-[26%]'} />
      {/* The grid carries the aspect ratio itself. Safari does not resolve a
          percentage height inside an aspect-ratio box until a later layout
          pass, which collapsed the rows to a pixel until the first placement. */}
      <div className="grid aspect-square w-full grid-cols-6 grid-rows-6 gap-px">
        {CELLS.map((cell) => {
          const landHere = isLand(land, cell);
          const occupant = landHere ? landmarkAt(placements, cell) : undefined;
          const shaking = shakeCell ? sameCell(shakeCell, cell) : false;
          const pulsing = occupant !== undefined && (highlight?.includes(occupant) ?? false);
          const hinted = highlightCells?.some((c) => sameCell(c, cell)) ?? false;
          const here = meFirst.filter((s) => sameCell(s.cell, cell)).slice(0, 3);
          const label = cellLabel(cell, landHere, occupant);

          const surface = landHere
            ? 'bg-sand border border-land'
            // Transparent: the frame paints the sea, and the compass shows through.
            : 'border border-transparent';
          const className = [
            'relative flex items-center justify-center rounded-sm',
            surface,
            interactive ? 'touch-manipulation cursor-pointer active:brightness-95' : '',
            interactive
              ? 'focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink'
              : '',
            shaking ? 'motion-safe:animate-shake' : '',
            hinted ? 'ring-2 ring-warn ring-inset' : '',
          ].join(' ');

          const content = (
            <>
              {occupant ? (
                <span
                  aria-hidden="true"
                  className={[
                    'flex items-center justify-center',
                    isBoard ? 'h-[70%] w-[70%]' : 'h-[72%] w-[72%]',
                    'text-ink-on-sand drop-shadow-sm',
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
                      'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-paper text-ink',
                      settler.isMe
                        ? 'z-20 h-7 w-7 border-2 border-ink motion-safe:animate-settle-me'
                        : 'z-10 h-5 w-5 border border-land motion-safe:animate-settle',
                    ].join(' ')}
                    style={style}
                    title={settler.isMe ? 'You' : undefined}
                  >
                    <SettlerAvatar settler={settler} />
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
                data-hint={hinted ? 'true' : undefined}
                onClick={() => onCellTap(cell)}
                className={className}
              >
                {content}
              </button>
            );
          }
          return (
            <div key={`${cell.r}-${cell.c}`} data-hint={hinted ? 'true' : undefined} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
};
