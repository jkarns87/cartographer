import type { Corner } from './compass';

const POSITION: Record<Corner, string> = {
  nw: 'top-[3%] left-[3%]',
  ne: 'top-[3%] right-[3%]',
  sw: 'bottom-[3%] left-[3%]',
  se: 'right-[3%] bottom-[3%]',
};

type Props = { corner: Corner; className?: string | undefined };

/**
 * A gold eight-point compass rose painted beneath the tiles, in the water of
 * the island frame. `IslandView` renders it before the grid, so the opaque sand
 * cells cover it and only the sea shows it. Decorative (hidden from assistive
 * tech) and never catches taps, but the N marker is what every shore and
 * direction clue reads against.
 */
export const CompassRose = ({ corner, className = 'w-[30%]' }: Props) => (
  <svg
    aria-hidden="true"
    data-compass={corner}
    viewBox="0 0 100 100"
    className={[
      'pointer-events-none absolute text-gold opacity-90',
      POSITION[corner],
      className,
    ].join(' ')}
  >
    <g fill="currentColor">
      <text x="50" y="11" textAnchor="middle" fontSize="12" fontWeight="700">
        N
      </text>
      {/* Diagonal points, thin */}
      <polygon points="71,29 47.9,47.9 52.1,52.1" opacity="0.55" />
      <polygon points="29,29 52.1,47.9 47.9,52.1" opacity="0.55" />
      <polygon points="71,71 47.9,52.1 52.1,47.9" opacity="0.55" />
      <polygon points="29,71 52.1,52.1 47.9,47.9" opacity="0.55" />
      {/* Cardinal points: a light and a dark half each */}
      <polygon points="50,17 56,50 50,50" opacity="0.5" />
      <polygon points="50,17 44,50 50,50" />
      <polygon points="86,50 50,56 50,50" opacity="0.5" />
      <polygon points="86,50 50,44 50,50" />
      <polygon points="50,86 44,50 50,50" opacity="0.5" />
      <polygon points="50,86 56,50 50,50" />
      <polygon points="14,50 50,44 50,50" opacity="0.5" />
      <polygon points="14,50 50,56 50,50" />
      <circle cx="50" cy="50" r="2.5" />
    </g>
    <circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.7" />
  </svg>
);
