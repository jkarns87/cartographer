import type { Hint } from '../../../shared/puzzle/hints';
import { LANDMARK_NAMES } from '../../../shared/puzzle/types';

/** "Clue 2", "Clues 2 and 4", "Clues 1, 3 and 5"; empty when no clue applies. */
const clueRefs = (indices: number[]): string => {
  const nums = indices.map((i) => String(i + 1));
  const last = nums[nums.length - 1];
  if (last === undefined) return '';
  if (nums.length === 1) return `Clue ${last}`;
  return `Clues ${nums.slice(0, -1).join(', ')} and ${last}`;
};

/** The hint as one sentence or two. Never names a cell: the map shows those. */
export const hintText = (hint: Hint): string => {
  switch (hint.kind) {
    case 'misplaced': {
      const name = LANDMARK_NAMES[hint.landmark];
      const refs = clueRefs(hint.clues);
      if (refs === '') return `The ${name} is misplaced.`;
      return `The ${name} is misplaced. ${refs} ${hint.clues.length === 1 ? 'says' : 'say'} where it belongs.`;
    }
    case 'next': {
      const name = LANDMARK_NAMES[hint.landmark];
      const n = hint.cells.length;
      const fit = n === 1 ? 'only one cell fits it' : `only ${n} cells fit it`;
      const refs = clueRefs(hint.clues);
      return `Work out the ${name} next: ${fit}.${refs === '' ? '' : ` See ${refs}.`}`;
    }
    case 'none':
      return 'Everything you have placed is right. Keep going.';
  }
};
