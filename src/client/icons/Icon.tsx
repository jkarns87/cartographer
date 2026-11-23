import type { LandmarkId } from '../../shared/puzzle/types';
import { LANDMARK_NAMES } from '../../shared/puzzle/types';

export type IconName = LandmarkId | 'tent';

type Props = { name: IconName; className?: string; title?: string };

/**
 * Draws one glyph from the inline sprite, so `Sprite` must be mounted once in the same
 * document. Size it with `className`; it takes its color from `currentColor`.
 */
export const Icon = ({ name, className, title }: Props) => {
  const label = name === 'tent' ? 'Settler' : LANDMARK_NAMES[name];
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label={title ?? label}
      fill="currentColor"
    >
      <use href={`#ic-${name}`} />
    </svg>
  );
};
