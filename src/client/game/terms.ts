import { HINT_PENALTY_MS } from '../../shared/puzzle/hints';

type Term = { term: string; meaning: string };

/** Every phrase the clue sheet uses, defined the way `shared/puzzle/grid` checks it. */
export const TERMS: readonly Term[] = [
  {
    term: 'North-facing shore',
    meaning:
      'The cell directly north of the landmark is water, or the edge of the map. One cell can face water on several sides at once.',
  },
  {
    term: 'Stands on no shore',
    meaning: 'Water on none of its four sides. A water corner does not count.',
  },
  {
    term: 'Due east of',
    meaning: 'In the same row and further east. Due north or south means the same column.',
  },
  { term: 'Somewhere east of', meaning: 'In any column further east, whatever the row.' },
  { term: 'Touches', meaning: 'The two cells share an edge. Corner to corner does not count.' },
  {
    term: 'Shares a row with',
    meaning: 'The same row, anywhere along it. Shares a column: the same column.',
  },
  {
    term: 'Lies between',
    meaning:
      'On the same row or column as both of the others, with one on each side. Diagonals do not count.',
  },
  {
    term: 'No landmark stands north of',
    meaning: 'Every other landmark is in the same row or further south.',
  },
  { term: 'Correction', meaning: 'Lifting a placed landmark. It counts even if you put it straight back.' },
  {
    term: 'Hint',
    meaning: `Points out a misplaced landmark, or the next one to work out. Each hint adds ${HINT_PENALTY_MS / 1000} seconds to your time.`,
  },
  {
    term: 'Chart it',
    meaning: 'Sends your placement to be checked once every clue is lit. The clock stops then.',
  },
];
