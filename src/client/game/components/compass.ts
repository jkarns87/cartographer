import { isLand } from '../../../shared/puzzle/grid';
import { SIZE } from '../../../shared/puzzle/types';
import type { LandMask } from '../../../shared/puzzle/types';

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Preference order on ties: the conventional bottom-right first. */
const CORNERS: ReadonlyArray<{ corner: Corner; r0: number; c0: number }> = [
  { corner: 'se', r0: SIZE - 2, c0: SIZE - 2 },
  { corner: 'sw', r0: SIZE - 2, c0: 0 },
  { corner: 'ne', r0: 0, c0: SIZE - 2 },
  { corner: 'nw', r0: 0, c0: 0 },
];

/** The corner whose 2x2 block holds the most water, so the rose sits in the sea, not on sand. */
export const compassCorner = (land: LandMask): Corner => {
  let best: Corner = 'se';
  let bestWater = -1;
  for (const { corner, r0, c0 } of CORNERS) {
    let water = 0;
    for (let r = r0; r < r0 + 2; r++) {
      for (let c = c0; c < c0 + 2; c++) if (!isLand(land, { r, c })) water++;
    }
    if (water > bestWater) {
      best = corner;
      bestWater = water;
    }
  }
  return best;
};
