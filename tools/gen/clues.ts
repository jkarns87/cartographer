import {
  between,
  due,
  isInland,
  onShore,
  shares,
  strictlyInDir,
  touches,
} from '../../src/shared/puzzle/grid';
import { DIRS } from '../../src/shared/puzzle/types';
import type {
  Axis,
  Cell,
  Clue,
  Dir,
  LandMask,
  LandmarkId,
  Placement,
} from '../../src/shared/puzzle/types';

const AXES: readonly Axis[] = ['row', 'column'];

export const OPPOSITE: Record<Dir, Dir> = { N: 'S', E: 'W', S: 'N', W: 'E' };

/** The line a `due` clue in this direction keeps both landmarks on. */
const lineAxis = (dir: Dir): Axis =>
  dir === 'E' || dir === 'W' ? 'row' : 'column';
/** The line a strict direction in `dir` forces the two landmarks apart on. */
const crossAxis = (dir: Dir): Axis =>
  dir === 'E' || dir === 'W' ? 'column' : 'row';

/**
 * Every clue of the eight types that holds on `solution`, in both orientations where a clue has
 * two equivalent phrasings ("A due east of B" and "B due west of A"). The sheet builder dedupes
 * equivalents with `clueKey`, so the orientation a player sees is a random draw.
 */
export const enumerateTrueClues = (
  land: LandMask,
  landmarks: LandmarkId[],
  solution: Placement
): Clue[] => {
  const at = (id: LandmarkId): Cell => {
    const cell = solution[id];
    if (!cell) throw new Error(`solution has no cell for ${id}`);
    return cell;
  };
  const out: Clue[] = [];

  for (const a of landmarks) {
    const pa = at(a);
    for (const dir of DIRS) {
      if (onShore(land, pa, dir)) out.push({ type: 'shore', a, dir });
    }
    if (isInland(land, pa)) out.push({ type: 'inland', a });
  }

  for (const a of landmarks) {
    const pa = at(a);
    for (const b of landmarks) {
      if (b === a) continue;
      const pb = at(b);
      for (const dir of DIRS) {
        if (due(pa, dir, pb)) out.push({ type: 'due', a, dir, b });
      }
      for (const dir of DIRS) {
        if (strictlyInDir(pa, dir, pb))
          out.push({ type: 'somewhere', a, dir, b });
      }
      out.push(
        touches(pa, pb)
          ? { type: 'touches', a, b }
          : { type: 'touches', a, b, not: true }
      );
      for (const axis of AXES) {
        out.push(
          shares(pa, axis, pb)
            ? { type: 'shares', a, axis, b }
            : { type: 'shares', a, axis, b, not: true }
        );
      }
    }
  }

  for (const a of landmarks) {
    for (const b of landmarks) {
      if (b === a) continue;
      for (const c of landmarks) {
        if (c === a || c === b) continue;
        if (between(at(a), at(b), at(c)))
          out.push({ type: 'between', a, b, c });
      }
    }
  }

  for (const a of landmarks) {
    const pa = at(a);
    for (const dir of DIRS) {
      const none = landmarks.every(
        (x) => x === a || !strictlyInDir(at(x), dir, pa)
      );
      if (none) out.push({ type: 'extreme', a, dir });
    }
  }

  return out;
};

const sortedPair = (a: LandmarkId, b: LandmarkId): [LandmarkId, LandmarkId] =>
  a < b ? [a, b] : [b, a];

/** Canonical form: two clues with the same key say exactly the same thing. */
export const clueKey = (clue: Clue): string => {
  switch (clue.type) {
    case 'shore':
      return `shore:${clue.a}:${clue.dir}`;
    case 'inland':
      return `inland:${clue.a}`;
    case 'due':
    case 'somewhere': {
      const flip = clue.b < clue.a;
      const [x, y] = flip ? [clue.b, clue.a] : [clue.a, clue.b];
      return `${clue.type}:${x}:${flip ? OPPOSITE[clue.dir] : clue.dir}:${y}`;
    }
    case 'touches': {
      const [x, y] = sortedPair(clue.a, clue.b);
      return `touches:${x}:${y}:${clue.not ? 'not' : 'yes'}`;
    }
    case 'shares': {
      const [x, y] = sortedPair(clue.a, clue.b);
      return `shares:${clue.axis}:${x}:${y}:${clue.not ? 'not' : 'yes'}`;
    }
    case 'between': {
      const [x, y] = sortedPair(clue.b, clue.c);
      return `between:${clue.a}:${x}:${y}`;
    }
    case 'extreme':
      return `extreme:${clue.a}:${clue.dir}`;
  }
};

const samePair = (
  a1: LandmarkId,
  b1: LandmarkId,
  a2: LandmarkId,
  b2: LandmarkId
): boolean => (a1 === a2 && b1 === b2) || (a1 === b2 && b1 === a2);

/**
 * True when `x` alone implies `y` about the same pair of landmarks (or they are equivalent).
 * A sheet never keeps both; the weaker clue (`y`) is the one dropped. Covered:
 * due => somewhere (same direction), due => shares the line, due/somewhere => does not share the
 * crossing line, shares row => does not share column (and vice versa).
 */
export const implies = (x: Clue, y: Clue): boolean => {
  if (clueKey(x) === clueKey(y)) return true;
  if (x.type === 'due') {
    if (y.type === 'somewhere') {
      if (y.a === x.a && y.b === x.b) return y.dir === x.dir;
      if (y.a === x.b && y.b === x.a) return y.dir === OPPOSITE[x.dir];
      return false;
    }
    if (y.type === 'shares' && samePair(x.a, x.b, y.a, y.b)) {
      return y.not ? y.axis === crossAxis(x.dir) : y.axis === lineAxis(x.dir);
    }
    return false;
  }
  if (x.type === 'somewhere') {
    return (
      y.type === 'shares' &&
      y.not === true &&
      samePair(x.a, x.b, y.a, y.b) &&
      y.axis === crossAxis(x.dir)
    );
  }
  if (x.type === 'shares' && !x.not) {
    return (
      y.type === 'shares' &&
      y.not === true &&
      samePair(x.a, x.b, y.a, y.b) &&
      y.axis !== x.axis
    );
  }
  return false;
};

/** True when some clue in `sheet` already says `clue` (equivalently or more strongly). */
export const isImpliedBySheet = (clue: Clue, sheet: readonly Clue[]): boolean =>
  sheet.some((s) => implies(s, clue));

/** Pairs (i, j), i !== j, where sheet[i] implies sheet[j]. Empty for an acceptable sheet. */
export const impliedPairs = (
  sheet: readonly Clue[]
): Array<[number, number]> => {
  const pairs: Array<[number, number]> = [];
  sheet.forEach((x, i) => {
    sheet.forEach((y, j) => {
      if (i !== j && implies(x, y)) pairs.push([i, j]);
    });
  });
  return pairs;
};
