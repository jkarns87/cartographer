import type { LandmarkId } from '../../shared/puzzle/types';
import { LANDMARK_NAMES } from '../../shared/puzzle/types';

export type IconName = LandmarkId | 'tent';

type Props = { name: IconName; className?: string; title?: string };

/**
 * Placeholder icon until the SVG sprite lands (Task 8 replaces this file).
 * Renders the landmark's initial inside a circle so layouts can be built now.
 */
export const Icon = ({ name, className, title }: Props) => {
  const label = name === 'tent' ? 'Settler' : LANDMARK_NAMES[name];
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label={title ?? label}
      fill="currentColor"
    >
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="16" y="21" textAnchor="middle" fontSize="14" fontWeight="700">
        {label.charAt(0)}
      </text>
    </svg>
  );
};
