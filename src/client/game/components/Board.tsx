import { useEffect, useState } from 'react';

import type { Settler } from '../../../shared/api';
import { isLand } from '../../../shared/puzzle/grid';
import type { Cell, LandMask, LandmarkId, Placement } from '../../../shared/puzzle/types';
import { IslandView } from './IslandView';

type Props = {
  land: LandMask;
  placements: Placement;
  onTapCell: (cell: Cell) => void;
  highlight?: LandmarkId[] | undefined;
  settlers?: Settler[] | undefined;
  disabled?: boolean | undefined;
};

const SHAKE_MS = 300;

/**
 * IslandView plus tap wiring. A tap on water shakes that cell for 300 ms and
 * is not forwarded; everything else goes to the reducer. The shake keyframe
 * is suppressed under `prefers-reduced-motion` by the `motion-safe:` variant.
 */
export const Board = ({ land, placements, onTapCell, highlight, settlers, disabled }: Props) => {
  const [shakeCell, setShakeCell] = useState<Cell | null>(null);

  useEffect(() => {
    if (!shakeCell) return;
    const id = setTimeout(() => setShakeCell(null), SHAKE_MS);
    return () => clearTimeout(id);
  }, [shakeCell]);

  const handleTap = (cell: Cell) => {
    if (disabled) return;
    if (!isLand(land, cell)) {
      setShakeCell({ r: cell.r, c: cell.c });
      return;
    }
    onTapCell(cell);
  };

  return (
    <IslandView
      land={land}
      placements={placements}
      highlight={highlight}
      settlers={settlers}
      onCellTap={disabled ? undefined : handleTap}
      shakeCell={shakeCell}
      size="board"
    />
  );
};
