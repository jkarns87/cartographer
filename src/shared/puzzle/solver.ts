import {
  between,
  cellAt,
  due,
  idx,
  isInland,
  landCells,
  onShore,
  shares,
  strictlyInDir,
  touches,
} from './grid';
import { SIZE } from './types';
import type { Cell, Difficulty, LandmarkId, Placement, Puzzle } from './types';

/** Candidate cell indexes (row * 6 + col) per landmark. */
export type Candidates = Map<LandmarkId, Set<number>>;

export type PropagateStatus = 'solved' | 'stuck' | 'contradiction';

export type PropagateResult = {
  status: PropagateStatus;
  /** Loop iterations in which at least one candidate was removed. */
  passes: number;
  cands: Candidates;
  /** Every landmark whose candidate set is a singleton. */
  placement: Placement;
};

export type CountResult = {
  /** Solutions found, at most `limit`. */
  count: number;
  solutions: Placement[];
  /** Search branches explored (the root propagation is not a branch). */
  nodes: number;
  /** True when the search stopped because `nodes` exceeded `nodeCap`. */
  capped: boolean;
};

export type CountOptions = { limit?: number; nodeCap?: number };

/** Shore and inland: a test on the landmark's own cell index. */
export type UnaryConstraint = {
  a: LandmarkId;
  test: (cellIdx: number) => boolean;
};

/** `rel(cell of a, cell of b)` must hold. Distinctness (a and b on different cells) is implied. */
export type BinaryConstraint = {
  a: LandmarkId;
  b: LandmarkId;
  rel: (pa: Cell, pb: Cell) => boolean;
};

/** `between(cell of a, cell of b, cell of c)`: a strictly between b and c on one row or column. */
export type TernaryConstraint = { a: LandmarkId; b: LandmarkId; c: LandmarkId };

export type Constraints = {
  unary: UnaryConstraint[];
  binary: BinaryConstraint[];
  ternary: TernaryConstraint[];
};

export const DIFFICULTY_THRESHOLDS: {
  readonly easyMax: 3;
  readonly mediumMax: 6;
} = {
  easyMax: 3,
  mediumMax: 6,
};

export const difficultyFor = (passes: number): Difficulty => {
  if (passes <= DIFFICULTY_THRESHOLDS.easyMax) return 'easy';
  if (passes <= DIFFICULTY_THRESHOLDS.mediumMax) return 'medium';
  return 'hard';
};

const DEFAULT_LIMIT = 2;
const DEFAULT_NODE_CAP = 200_000;

// Shared Cell objects so the support loops never allocate a Cell.
const CELLS: Cell[] = Array.from({ length: SIZE * SIZE }, (_, i) => cellAt(i));
const cellOf = (i: number): Cell => CELLS[i] ?? cellAt(i);

const isLandIndex = (land: string, i: number): boolean =>
  Number.isInteger(i) && i >= 0 && i < SIZE * SIZE && land[i] === '1';

export const initialCandidates = (
  puzzle: Pick<Puzzle, 'land' | 'landmarks'>
): Candidates => {
  const cells = landCells(puzzle.land).map(idx);
  const cands: Candidates = new Map();
  for (const id of puzzle.landmarks) cands.set(id, new Set(cells));
  return cands;
};

export const cloneCandidates = (cands: Candidates): Candidates => {
  const out: Candidates = new Map();
  for (const [id, set] of cands) out.set(id, new Set(set));
  return out;
};

/**
 * Compile clues into propagation constraints. Unary: shore, inland. Binary: due, somewhere,
 * touches, shares (negations included), and extreme decomposed into one "x is not strictly in
 * dir of a" constraint per other landmark x. Ternary: between.
 */
export const compileConstraints = (
  puzzle: Pick<Puzzle, 'land' | 'landmarks' | 'clues'>
): Constraints => {
  const { land, landmarks } = puzzle;
  const known = new Set<LandmarkId>(landmarks);
  const check = (id: LandmarkId): LandmarkId => {
    if (!known.has(id))
      throw new Error(`clue names landmark "${id}" which is not in the puzzle`);
    return id;
  };

  const unary: UnaryConstraint[] = [];
  const binary: BinaryConstraint[] = [];
  const ternary: TernaryConstraint[] = [];

  const addBinary = (
    a: LandmarkId,
    b: LandmarkId,
    rel: BinaryConstraint['rel']
  ): void => {
    // A clue relating a landmark to itself is a test on its own cell (clueHolds semantics).
    if (a === b) unary.push({ a, test: (i) => rel(cellOf(i), cellOf(i)) });
    else binary.push({ a, b, rel });
  };

  for (const clue of puzzle.clues) {
    switch (clue.type) {
      case 'shore': {
        const { dir } = clue;
        unary.push({
          a: check(clue.a),
          test: (i) => onShore(land, cellOf(i), dir),
        });
        break;
      }
      case 'inland':
        unary.push({
          a: check(clue.a),
          test: (i) => isInland(land, cellOf(i)),
        });
        break;
      case 'due': {
        const { dir } = clue;
        addBinary(check(clue.a), check(clue.b), (pa, pb) => due(pa, dir, pb));
        break;
      }
      case 'somewhere': {
        const { dir } = clue;
        addBinary(check(clue.a), check(clue.b), (pa, pb) =>
          strictlyInDir(pa, dir, pb)
        );
        break;
      }
      case 'touches': {
        const want = !clue.not;
        addBinary(
          check(clue.a),
          check(clue.b),
          (pa, pb) => touches(pa, pb) === want
        );
        break;
      }
      case 'shares': {
        const { axis } = clue;
        const want = !clue.not;
        addBinary(
          check(clue.a),
          check(clue.b),
          (pa, pb) => shares(pa, axis, pb) === want
        );
        break;
      }
      case 'between': {
        const a = check(clue.a);
        const b = check(clue.b);
        const c = check(clue.c);
        // A repeated landmark can never be strictly between itself and another.
        if (a === b || a === c || b === c) unary.push({ a, test: () => false });
        else ternary.push({ a, b, c });
        break;
      }
      case 'extreme': {
        const a = check(clue.a);
        const { dir } = clue;
        for (const x of landmarks) {
          if (x !== a)
            binary.push({
              a: x,
              b: a,
              rel: (px, pa) => !strictlyInDir(px, dir, pa),
            });
        }
        break;
      }
    }
  }
  return { unary, binary, ternary };
};

const setFor = (cands: Candidates, id: LandmarkId): Set<number> => {
  const set = cands.get(id);
  if (!set) throw new Error(`no candidate set for landmark "${id}"`);
  return set;
};

const onlyValue = (set: Set<number>): number | undefined => {
  if (set.size !== 1) return undefined;
  for (const v of set) return v;
  return undefined;
};

const placementOf = (
  landmarks: readonly LandmarkId[],
  cands: Candidates
): Placement => {
  const placement: Placement = {};
  for (const id of landmarks) {
    const set = cands.get(id);
    const only = set ? onlyValue(set) : undefined;
    if (only !== undefined) placement[id] = cellAt(only);
  }
  return placement;
};

/** Remove from `target` every p with no q in `other` (q !== p) such that `supports(p, q)`. */
const reviseBinary = (
  target: Set<number>,
  other: Set<number>,
  supports: (p: Cell, q: Cell) => boolean
): boolean => {
  const others = Array.from(other);
  let changed = false;
  for (const p of target) {
    const pc = cellOf(p);
    let ok = false;
    for (const q of others) {
      if (q !== p && supports(pc, cellOf(q))) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      target.delete(p);
      changed = true;
    }
  }
  return changed;
};

type Role = 0 | 1 | 2;
const ROLES: Role[] = [0, 1, 2];

/** Keep a candidate of the member in `role` only if two other distinct cells complete `between`. */
const reviseTernary = (
  sets: [Set<number>, Set<number>, Set<number>],
  role: Role
): boolean => {
  const target = sets[role];
  const [x, y] =
    role === 0
      ? [sets[1], sets[2]]
      : role === 1
        ? [sets[0], sets[2]]
        : [sets[0], sets[1]];
  const xs = Array.from(x);
  const ys = Array.from(y);
  let changed = false;
  for (const p of target) {
    const pc = cellOf(p);
    let ok = false;
    for (const q of xs) {
      if (q === p) continue;
      const qc = cellOf(q);
      for (const s of ys) {
        if (s === p || s === q) continue;
        const sc = cellOf(s);
        // Arguments in (a, b, c) order whichever member is being revised.
        const holds =
          role === 0
            ? between(pc, qc, sc)
            : role === 1
              ? between(qc, pc, sc)
              : between(qc, sc, pc);
        if (holds) {
          ok = true;
          break;
        }
      }
      if (ok) break;
    }
    if (!ok) {
      target.delete(p);
      changed = true;
    }
  }
  return changed;
};

/** Fixpoint propagation, in place on `cands`. Never guesses. */
const runPropagation = (
  landmarks: readonly LandmarkId[],
  constraints: Constraints,
  cands: Candidates
): PropagateResult => {
  const unary = constraints.unary.map((u) => ({
    set: setFor(cands, u.a),
    test: u.test,
  }));
  const binary = constraints.binary.map((b) => ({
    a: setFor(cands, b.a),
    b: setFor(cands, b.b),
    rel: b.rel,
    flipped: (q: Cell, p: Cell): boolean => b.rel(p, q),
  }));
  const ternary = constraints.ternary.map(
    (t): [Set<number>, Set<number>, Set<number>] => [
      setFor(cands, t.a),
      setFor(cands, t.b),
      setFor(cands, t.c),
    ]
  );
  const sets = landmarks.map((id) => setFor(cands, id));

  let passes = 0;
  const finish = (status: PropagateStatus): PropagateResult => ({
    status,
    passes,
    cands,
    placement: placementOf(landmarks, cands),
  });
  // Sets are non-empty at the start of every pass, so emptying one means this pass removed a
  // candidate: it counts.
  const wipedOut = (): PropagateResult => {
    passes++;
    return finish('contradiction');
  };

  // An empty start set is already a contradiction (no pass ran).
  if (sets.some((s) => s.size === 0)) return finish('contradiction');

  for (;;) {
    let changed = false;

    for (const u of unary) {
      for (const p of u.set) {
        if (!u.test(p)) {
          u.set.delete(p);
          changed = true;
        }
      }
      if (u.set.size === 0) return wipedOut();
    }

    for (const bc of binary) {
      if (reviseBinary(bc.a, bc.b, bc.rel)) changed = true;
      if (reviseBinary(bc.b, bc.a, bc.flipped)) changed = true;
      if (bc.a.size === 0 || bc.b.size === 0) return wipedOut();
    }

    for (const tc of ternary) {
      for (const role of ROLES) {
        if (reviseTernary(tc, role)) changed = true;
      }
      if (tc[0].size === 0 || tc[1].size === 0 || tc[2].size === 0)
        return wipedOut();
    }

    // Naked singles: a fixed cell is unavailable to every other landmark.
    for (let k = 0; k < sets.length; k++) {
      const set = sets[k];
      if (!set) continue;
      const only = onlyValue(set);
      if (only === undefined) continue;
      for (let m = 0; m < sets.length; m++) {
        const other = sets[m];
        if (m === k || !other) continue;
        if (other.delete(only)) {
          changed = true;
          if (other.size === 0) return wipedOut();
        }
      }
    }

    if (!changed) {
      // At a fixpoint every remaining value is supported, so all-singletons is a full solution.
      return finish(sets.every((s) => s.size === 1) ? 'solved' : 'stuck');
    }
    passes++;
  }
};

const startCandidates = (
  puzzle: Pick<Puzzle, 'land' | 'landmarks'>,
  start: Candidates | undefined
): Candidates => {
  if (!start) return initialCandidates(puzzle);
  const all = initialCandidates(puzzle);
  const out: Candidates = new Map();
  for (const id of puzzle.landmarks) {
    const given = start.get(id);
    const set = new Set<number>();
    for (const p of given ?? setFor(all, id)) {
      if (isLandIndex(puzzle.land, p)) set.add(p);
    }
    out.set(id, set);
  }
  return out;
};

/**
 * Human solver: propagation only, until fixpoint. `start` is copied, never mutated; landmarks it
 * omits start with every land cell, and non-land indexes are dropped.
 */
export const propagate = (
  puzzle: Pick<Puzzle, 'land' | 'landmarks' | 'clues'>,
  start?: Candidates
): PropagateResult =>
  runPropagation(
    puzzle.landmarks,
    compileConstraints(puzzle),
    startCandidates(puzzle, start)
  );

/**
 * Uniqueness solver: backtracking with `propagate` as the forward check. Branches on the
 * unassigned landmark with the fewest candidates, trying its cells in ascending order. Stops at
 * `limit` solutions (default 2) or when more than `nodeCap` branches (default 200,000) are needed.
 */
export const countSolutions = (
  puzzle: Pick<Puzzle, 'land' | 'landmarks' | 'clues'>,
  opts: CountOptions = {}
): CountResult => {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const nodeCap = opts.nodeCap ?? DEFAULT_NODE_CAP;
  const { landmarks } = puzzle;
  const constraints = compileConstraints(puzzle);
  const solutions: Placement[] = [];
  let nodes = 0;
  let capped = false;

  const search = (cands: Candidates): void => {
    const result = runPropagation(landmarks, constraints, cands);
    if (result.status === 'contradiction') return;
    if (result.status === 'solved') {
      solutions.push(result.placement);
      return;
    }

    let choice: LandmarkId | undefined;
    let best = Infinity;
    for (const id of landmarks) {
      const size = setFor(cands, id).size;
      if (size > 1 && size < best) {
        best = size;
        choice = id;
      }
    }
    if (choice === undefined) return;

    const options = Array.from(setFor(cands, choice)).sort((x, y) => x - y);
    for (const cell of options) {
      if (capped || solutions.length >= limit) return;
      nodes++;
      if (nodes > nodeCap) {
        capped = true;
        return;
      }
      const next = cloneCandidates(cands);
      next.set(choice, new Set([cell]));
      search(next);
    }
  };

  if (limit > 0) search(initialCandidates(puzzle));
  return { count: solutions.length, solutions, nodes, capped };
};
