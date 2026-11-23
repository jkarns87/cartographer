import { between, due, inBounds, isInland, isLand, onShore, sameCell, shares, strictlyInDir, touches } from './grid';
import type { Cell, Clue, ClueState, LandMask, LandmarkId, Placement, Puzzle } from './types';

/** The landmarks a clue names explicitly (a, b, c). Extreme quantifies over all others implicitly. */
export const clueLandmarks = (clue: Clue): LandmarkId[] => {
  switch (clue.type) {
    case 'shore':
    case 'inland':
    case 'extreme':
      return [clue.a];
    case 'due':
    case 'somewhere':
    case 'touches':
    case 'shares':
      return [clue.a, clue.b];
    case 'between':
      return [clue.a, clue.b, clue.c];
  }
};

const must = (placement: Placement, id: LandmarkId): Cell => {
  const cell = placement[id];
  if (!cell) throw new Error(`landmark ${id} is not placed`);
  return cell;
};

/**
 * Whether the clue holds. Every landmark the clue names must be placed.
 * For extreme, unplaced other landmarks are treated as not violating.
 */
export const clueHolds = (
  clue: Clue,
  placement: Placement,
  land: LandMask,
  landmarks: readonly LandmarkId[]
): boolean => {
  switch (clue.type) {
    case 'shore':
      return onShore(land, must(placement, clue.a), clue.dir);
    case 'inland':
      return isInland(land, must(placement, clue.a));
    case 'due':
      return due(must(placement, clue.a), clue.dir, must(placement, clue.b));
    case 'somewhere':
      return strictlyInDir(must(placement, clue.a), clue.dir, must(placement, clue.b));
    case 'touches':
      return touches(must(placement, clue.a), must(placement, clue.b)) !== Boolean(clue.not);
    case 'shares':
      return (
        shares(must(placement, clue.a), clue.axis, must(placement, clue.b)) !== Boolean(clue.not)
      );
    case 'between':
      return between(must(placement, clue.a), must(placement, clue.b), must(placement, clue.c));
    case 'extreme': {
      const a = must(placement, clue.a);
      return landmarks.every((x) => {
        if (x === clue.a) return true;
        const cell = placement[x];
        return cell === undefined || !strictlyInDir(cell, clue.dir, a);
      });
    }
  }
};

/** Live tick state for a partial placement. See spec section 2.4. */
export const evaluateClue = (
  clue: Clue,
  placement: Placement,
  land: LandMask,
  landmarks: readonly LandmarkId[]
): ClueState => {
  if (clue.type === 'extreme') {
    const a = placement[clue.a];
    if (!a) return 'pending';
    const violated = landmarks.some((x) => {
      if (x === clue.a) return false;
      const cell = placement[x];
      return cell !== undefined && strictlyInDir(cell, clue.dir, a);
    });
    if (violated) return 'contradicted';
    return landmarks.every((x) => placement[x] !== undefined) ? 'lit' : 'pending';
  }
  const named = clueLandmarks(clue);
  if (!named.every((id) => placement[id] !== undefined)) return 'pending';
  return clueHolds(clue, placement, land, landmarks) ? 'lit' : 'contradicted';
};

export type PlacementProblem = 'missing' | 'unknown' | 'offgrid' | 'water' | 'duplicate';

export type PlacementValidation = { ok: true } | { ok: false; reason: PlacementProblem };

/** Every puzzle landmark placed on a distinct in-grid land cell, and nothing else placed. */
export const validatePlacement = (
  puzzle: Pick<Puzzle, 'land' | 'landmarks'>,
  placement: Placement
): PlacementValidation => {
  const allowed = new Set<string>(puzzle.landmarks);
  for (const key of Object.keys(placement)) {
    if (!allowed.has(key)) return { ok: false, reason: 'unknown' };
  }
  const used: Cell[] = [];
  for (const id of puzzle.landmarks) {
    const cell = placement[id];
    if (!cell) return { ok: false, reason: 'missing' };
    if (!inBounds(cell)) return { ok: false, reason: 'offgrid' };
    if (!isLand(puzzle.land, cell)) return { ok: false, reason: 'water' };
    if (used.some((u) => sameCell(u, cell))) return { ok: false, reason: 'duplicate' };
    used.push(cell);
  }
  return { ok: true };
};

export const allCluesLit = (puzzle: Puzzle, placement: Placement): boolean =>
  puzzle.clues.every((c) => evaluateClue(c, placement, puzzle.land, puzzle.landmarks) === 'lit');

/** Complete, valid, and every clue lit. Equivalent to the unique solution. */
export const isSolved = (puzzle: Puzzle, placement: Placement): boolean =>
  validatePlacement(puzzle, placement).ok && allCluesLit(puzzle, placement);

export const samePlacement = (
  a: Placement,
  b: Placement,
  landmarks: readonly LandmarkId[]
): boolean =>
  landmarks.every((id) => {
    const x = a[id];
    const y = b[id];
    if (!x || !y) return x === y;
    return sameCell(x, y);
  });
