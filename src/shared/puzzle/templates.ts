import { LANDMARK_NAMES } from './types';
import type { Clue, Dir, LandmarkId } from './types';

export const DIR_WORD: Record<Dir, string> = {
  N: 'north',
  E: 'east',
  S: 'south',
  W: 'west',
};

/** "north-facing": the cell faces water on that side. A cell can face water on several sides. */
export const SHORE_WORD: Record<Dir, string> = {
  N: 'north-facing',
  E: 'east-facing',
  S: 'south-facing',
  W: 'west-facing',
};

/** A sentence fragment: literal text, or a landmark the UI renders as icon + display name. */
export type CluePart = { text: string } | { landmark: LandmarkId };

const text = (value: string): CluePart => ({ text: value });
const landmark = (id: LandmarkId): CluePart => ({ landmark: id });

/** The clue sentence split so the UI can put an icon before each landmark name. */
export const clueParts = (clue: Clue): CluePart[] => {
  switch (clue.type) {
    case 'shore':
      return [
        text('The '),
        landmark(clue.a),
        text(` stands on a ${SHORE_WORD[clue.dir]} shore.`),
      ];
    case 'inland':
      return [text('The '), landmark(clue.a), text(' stands on no shore.')];
    case 'due':
      return [
        text('The '),
        landmark(clue.a),
        text(` is due ${DIR_WORD[clue.dir]} of the `),
        landmark(clue.b),
        text('.'),
      ];
    case 'somewhere':
      return [
        text('The '),
        landmark(clue.a),
        text(` lies somewhere ${DIR_WORD[clue.dir]} of the `),
        landmark(clue.b),
        text('.'),
      ];
    case 'touches':
      return [
        text('The '),
        landmark(clue.a),
        text(clue.not ? ' does not touch the ' : ' touches the '),
        landmark(clue.b),
        text('.'),
      ];
    case 'shares':
      return [
        text('The '),
        landmark(clue.a),
        text(
          clue.not
            ? ` does not share a ${clue.axis} with the `
            : ` shares a ${clue.axis} with the `
        ),
        landmark(clue.b),
        text('.'),
      ];
    case 'between':
      return [
        text('The '),
        landmark(clue.a),
        text(' lies between the '),
        landmark(clue.b),
        text(' and the '),
        landmark(clue.c),
        text(', in one row or column.'),
      ];
    case 'extreme':
      return [
        text(`No landmark stands ${DIR_WORD[clue.dir]} of the `),
        landmark(clue.a),
        text('.'),
      ];
  }
};

/** The full sentence, with each landmark rendered as its display name. */
export const clueText = (clue: Clue): string =>
  clueParts(clue)
    .map((part) =>
      'landmark' in part ? LANDMARK_NAMES[part.landmark] : part.text
    )
    .join('');
