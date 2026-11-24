import { cellAt, idx } from './grid';
import { clueLandmarks } from './predicates';
import { propagate } from './solver';
import type { Candidates } from './solver';
import type { Cell, Clue, LandmarkId, Placement, Puzzle } from './types';

/** Hints per island. The reducer refuses a fourth. */
export const MAX_HINTS = 3;
/** Added to the server-measured solve time for every hint taken. */
export const HINT_PENALTY_MS = 30_000;

/** Hints taken so far: one `H` in the history per hint. */
export const countHints = (history: string): number => {
  let n = 0;
  for (const ch of history) if (ch === 'H') n++;
  return n;
};

export type Hint =
  /** A placed landmark sits where the clues say it cannot. `clues` are the indices naming it. */
  | { kind: 'misplaced'; landmark: LandmarkId; clues: number[] }
  /** The unplaced landmark with the fewest cells left, and those cells. */
  | { kind: 'next'; landmark: LandmarkId; cells: Cell[]; clues: number[] }
  /** Everything placed is right and nothing is left to place. */
  | { kind: 'none' };

const cluesNaming = (clues: Clue[], id: LandmarkId): number[] =>
  clues.flatMap((clue, i) => (clueLandmarks(clue).includes(id) ? [i] : []));

/**
 * Works a hint out from the clues and the land alone, with the propagation
 * solver the generator already requires every island to yield to. Nothing here
 * needs the stored solution, so the client computes it without a request.
 *
 * Order: a misplaced landmark first (its cell is outside what the clues allow
 * for it), otherwise the unplaced landmark that is most pinned down once the
 * player's placements are taken as fixed. Ties keep landmark order.
 */
export const computeHint = (
  puzzle: Pick<Puzzle, 'land' | 'landmarks' | 'clues'>,
  placements: Placement
): Hint => {
  const fromClues = propagate(puzzle);
  for (const id of puzzle.landmarks) {
    const cell = placements[id];
    if (!cell) continue;
    const allowed = fromClues.cands.get(id);
    if (allowed !== undefined && !allowed.has(idx(cell))) {
      return { kind: 'misplaced', landmark: id, clues: cluesNaming(puzzle.clues, id) };
    }
  }

  const start: Candidates = new Map();
  for (const id of puzzle.landmarks) {
    const cell = placements[id];
    if (cell) start.set(id, new Set([idx(cell)]));
  }
  const withPlaced = propagate(puzzle, start);
  // Only reachable when the clues alone did not solve the island; fall back to them.
  const base = withPlaced.status === 'contradiction' ? fromClues : withPlaced;

  let best: { id: LandmarkId; cells: number[] } | null = null;
  for (const id of puzzle.landmarks) {
    if (placements[id] !== undefined) continue;
    const set = base.cands.get(id);
    if (set === undefined || set.size === 0) continue;
    if (best === null || set.size < best.cells.length) {
      best = { id, cells: [...set].sort((a, b) => a - b) };
    }
  }
  if (best === null) return { kind: 'none' };
  return {
    kind: 'next',
    landmark: best.id,
    cells: best.cells.map(cellAt),
    clues: cluesNaming(puzzle.clues, best.id),
  };
};
