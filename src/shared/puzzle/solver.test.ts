import { describe, expect, it } from 'vitest';
import { idx, landCells, maskFromRows } from './grid';
import { clueHolds, samePlacement } from './predicates';
import {
  compileConstraints,
  countSolutions,
  DIFFICULTY_THRESHOLDS,
  difficultyFor,
  initialCandidates,
  propagate,
} from './solver';
import type { Candidates } from './solver';
import { DIRS, LANDMARKS } from './types';
import type {
  Axis,
  Cell,
  Clue,
  ClueType,
  LandMask,
  LandmarkId,
  Placement,
} from './types';

// Task 1 fixture (copied, not imported from a test file). 20 land cells.
const ISLAND = maskFromRows([
  '..LL..',
  '.LLLL.',
  'LLLLL.',
  '.LLLLL',
  '..LLL.',
  '...L..',
]);

// 22 land cells, used for the 9-landmark performance case.
const ISLAND_22 = maskFromRows([
  '.LLLL.',
  'LLLLLL',
  'LLLL.L',
  '.LLLLL',
  '..LL..',
  '......',
]);

const AXES: Axis[] = ['row', 'column'];

type TestPuzzle = { land: LandMask; landmarks: LandmarkId[]; clues: Clue[] };

const at = (r: number, c: number): number => idx({ r, c });

const sorted = (values: Iterable<number>): number[] =>
  [...values].sort((x, y) => x - y);

const candsOf = (cands: Candidates, id: LandmarkId): number[] =>
  sorted(cands.get(id) ?? []);

const landIndexes = (land: LandMask): number[] => landCells(land).map(idx);

const expectEveryClueHolds = (
  puzzle: TestPuzzle,
  solutions: Placement[]
): void => {
  for (const solution of solutions) {
    for (const clue of puzzle.clues) {
      expect(
        clueHolds(clue, solution, puzzle.land, puzzle.landmarks),
        JSON.stringify(clue)
      ).toBe(true);
    }
  }
};

/** Pin some landmarks to single cells; the rest keep every land cell. */
const pinned = (
  puzzle: Pick<TestPuzzle, 'land' | 'landmarks'>,
  pins: Partial<Record<LandmarkId, Cell>>
): Candidates => {
  const cands = initialCandidates(puzzle);
  for (const id of puzzle.landmarks) {
    const cell = pins[id];
    if (cell) cands.set(id, new Set([idx(cell)]));
  }
  return cands;
};

// ---------------------------------------------------------------------------
// The hand-built unique puzzle.
//
// Solution first:
//   lighthouse (5,3)  the southern tip, the only cell on both the eastern and western shore
//   well       (4,3)  the only land cell touching (5,3)
//   windmill   (4,2)  the only land cell due west of (4,3) in row 4
// Then one clue chain per landmark: shore + shore pins the lighthouse, touches pins the well,
// due pins the windmill.
// ---------------------------------------------------------------------------
const UNIQUE_SOLUTION: Placement = {
  lighthouse: { r: 5, c: 3 },
  well: { r: 4, c: 3 },
  windmill: { r: 4, c: 2 },
};

const UNIQUE: TestPuzzle = {
  land: ISLAND,
  landmarks: ['lighthouse', 'well', 'windmill'],
  clues: [
    { type: 'shore', a: 'lighthouse', dir: 'E' },
    { type: 'shore', a: 'lighthouse', dir: 'W' },
    { type: 'touches', a: 'well', b: 'lighthouse' },
    { type: 'due', a: 'windmill', dir: 'W', b: 'well' },
  ],
};

/** The same puzzle without the western-shore clue: six lighthouse cells remain possible. */
const AMBIGUOUS: TestPuzzle = {
  ...UNIQUE,
  clues: UNIQUE.clues.filter((c) => !(c.type === 'shore' && c.dir === 'W')),
};

const CONTRADICTORY: TestPuzzle = {
  land: ISLAND,
  landmarks: ['well', 'mine'],
  clues: [
    { type: 'due', a: 'well', dir: 'E', b: 'mine' },
    { type: 'due', a: 'well', dir: 'W', b: 'mine' },
  ],
};

const LOOSE_FIVE: TestPuzzle = {
  land: ISLAND,
  landmarks: ['lighthouse', 'windmill', 'harbor', 'fort', 'temple'],
  clues: [{ type: 'shore', a: 'lighthouse', dir: 'N' }],
};

// A Sunday-sized puzzle within the sheet caps (<= 2 between, <= 2 extreme, <= 2 negatives,
// every landmark named): 9 landmarks, 22 land cells, 10 clues. Unique, and propagation alone
// stalls, so countSolutions has to search and then exhaust the tree to prove uniqueness.
const EXPEDITION_SOLUTION: Placement = {
  well: { r: 0, c: 4 },
  windmill: { r: 3, c: 5 },
  temple: { r: 1, c: 3 },
  shipwreck: { r: 1, c: 2 },
  beacon: { r: 1, c: 1 },
  farm: { r: 1, c: 4 },
  mine: { r: 2, c: 3 },
  watchtower: { r: 3, c: 2 },
  cave: { r: 2, c: 5 },
};

const EXPEDITION: TestPuzzle = {
  land: ISLAND_22,
  landmarks: [
    'well',
    'windmill',
    'temple',
    'shipwreck',
    'beacon',
    'farm',
    'mine',
    'watchtower',
    'cave',
  ],
  clues: [
    { type: 'inland', a: 'beacon' },
    { type: 'due', a: 'farm', dir: 'S', b: 'well' },
    { type: 'between', a: 'shipwreck', b: 'beacon', c: 'farm' },
    { type: 'due', a: 'windmill', dir: 'E', b: 'watchtower' },
    { type: 'due', a: 'cave', dir: 'N', b: 'windmill' },
    { type: 'due', a: 'cave', dir: 'E', b: 'mine' },
    { type: 'inland', a: 'temple' },
    { type: 'somewhere', a: 'shipwreck', dir: 'W', b: 'mine' },
    { type: 'due', a: 'farm', dir: 'E', b: 'temple' },
    { type: 'due', a: 'watchtower', dir: 'S', b: 'shipwreck' },
  ],
};

// ---------------------------------------------------------------------------
// Random puzzle helpers (tiny inline LCG, no dependency).
// ---------------------------------------------------------------------------
const lcg = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const shuffle = <T>(items: readonly T[], rand: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
};

const randomPlacement = (
  land: LandMask,
  count: number,
  rand: () => number
): { landmarks: LandmarkId[]; placement: Placement } => {
  const landmarks = shuffle(LANDMARKS, rand).slice(0, count);
  const cells = shuffle(landCells(land), rand);
  const placement: Placement = {};
  landmarks.forEach((id, k) => {
    const cell = cells[k];
    if (cell) placement[id] = cell;
  });
  return { landmarks, placement };
};

/** Every clue of the eight types (negations included) that holds for the placement. */
const trueClues = (
  placement: Placement,
  land: LandMask,
  landmarks: LandmarkId[]
): Clue[] => {
  const out: Clue[] = [];
  const add = (clue: Clue): void => {
    if (clueHolds(clue, placement, land, landmarks)) out.push(clue);
  };
  for (const a of landmarks) {
    add({ type: 'inland', a });
    for (const dir of DIRS) {
      add({ type: 'shore', a, dir });
      add({ type: 'extreme', a, dir });
    }
    for (const b of landmarks) {
      if (b === a) continue;
      for (const dir of DIRS) {
        add({ type: 'due', a, dir, b });
        add({ type: 'somewhere', a, dir, b });
      }
      add({ type: 'touches', a, b });
      add({ type: 'touches', a, b, not: true });
      for (const axis of AXES) {
        add({ type: 'shares', a, axis, b });
        add({ type: 'shares', a, axis, b, not: true });
      }
      for (const c of landmarks) {
        if (c === a || c === b || landmarks.indexOf(c) < landmarks.indexOf(b))
          continue;
        add({ type: 'between', a, b, c });
      }
    }
  }
  return out;
};

/** Up to k clues, choosing a random clue type each time so the sheet mixes types. */
const pickMixed = (clues: Clue[], k: number, rand: () => number): Clue[] => {
  const byType = new Map<ClueType, Clue[]>();
  for (const clue of clues) {
    const list = byType.get(clue.type) ?? [];
    list.push(clue);
    byType.set(clue.type, list);
  }
  const out: Clue[] = [];
  while (out.length < k) {
    const types = [...byType.keys()].filter(
      (t) => (byType.get(t) ?? []).length > 0
    );
    const type = types[Math.floor(rand() * types.length)];
    if (type === undefined) break;
    const list = byType.get(type) ?? [];
    const [clue] = list.splice(Math.floor(rand() * list.length), 1);
    if (clue) out.push(clue);
  }
  return out;
};

/** Exhaustive reference: every assignment of distinct land cells that satisfies every clue. */
const bruteForce = (puzzle: TestPuzzle): Placement[] => {
  const cells = landCells(puzzle.land);
  const used = new Set<number>();
  const placement: Placement = {};
  const out: Placement[] = [];
  const rec = (k: number): void => {
    const id = puzzle.landmarks[k];
    if (id === undefined) {
      if (
        puzzle.clues.every((c) =>
          clueHolds(c, placement, puzzle.land, puzzle.landmarks)
        )
      ) {
        out.push({ ...placement });
      }
      return;
    }
    for (const cell of cells) {
      const key = idx(cell);
      if (used.has(key)) continue;
      used.add(key);
      placement[id] = cell;
      rec(k + 1);
      used.delete(key);
    }
    delete placement[id];
  };
  rec(0);
  return out;
};

// ---------------------------------------------------------------------------

describe('initialCandidates', () => {
  it('gives every landmark every land cell, in separate sets', () => {
    const cands = initialCandidates(UNIQUE);
    expect([...cands.keys()]).toEqual(UNIQUE.landmarks);
    for (const id of UNIQUE.landmarks) {
      expect(candsOf(cands, id)).toEqual(landIndexes(ISLAND));
    }
    expect(cands.get('well')).not.toBe(cands.get('windmill'));
    expect(landIndexes(ISLAND)).toHaveLength(20);
  });
});

describe('compileConstraints', () => {
  it('splits clues into unary, binary, and ternary constraints', () => {
    const compiled = compileConstraints({
      land: ISLAND,
      landmarks: ['well', 'mine', 'farm'],
      clues: [
        { type: 'shore', a: 'well', dir: 'N' },
        { type: 'inland', a: 'mine' },
        { type: 'due', a: 'well', dir: 'E', b: 'mine' },
        { type: 'somewhere', a: 'farm', dir: 'S', b: 'mine' },
        { type: 'touches', a: 'farm', b: 'well', not: true },
        { type: 'shares', a: 'farm', axis: 'row', b: 'well' },
        { type: 'between', a: 'well', b: 'mine', c: 'farm' },
        { type: 'extreme', a: 'well', dir: 'W' },
      ],
    });
    expect(compiled.unary).toHaveLength(2);
    // due, somewhere, touches, shares, plus extreme over the two other landmarks.
    expect(compiled.binary).toHaveLength(6);
    expect(compiled.ternary).toEqual([{ a: 'well', b: 'mine', c: 'farm' }]);
  });

  it('decomposes extreme into "x is not strictly in dir of a" for every other landmark', () => {
    const { binary } = compileConstraints({
      land: ISLAND,
      landmarks: ['well', 'mine', 'farm'],
      clues: [{ type: 'extreme', a: 'well', dir: 'W' }],
    });
    expect(binary.map((b) => [b.a, b.b])).toEqual([
      ['mine', 'well'],
      ['farm', 'well'],
    ]);
    const [first] = binary;
    if (!first) throw new Error('expected a binary constraint');
    // mine at column 1 is west of a well at column 2: violates.
    expect(first.rel({ r: 2, c: 1 }, { r: 2, c: 2 })).toBe(false);
    // Same column, other row: fine.
    expect(first.rel({ r: 0, c: 2 }, { r: 3, c: 2 })).toBe(true);
  });

  it('rejects clues that name a landmark outside the puzzle', () => {
    expect(() =>
      compileConstraints({
        land: ISLAND,
        landmarks: ['well'],
        clues: [{ type: 'touches', a: 'well', b: 'mine' }],
      })
    ).toThrow(/mine/);
  });
});

describe('propagate', () => {
  it('solves the hand-built unique puzzle without guessing', () => {
    for (const clue of UNIQUE.clues) {
      expect(
        clueHolds(clue, UNIQUE_SOLUTION, UNIQUE.land, UNIQUE.landmarks)
      ).toBe(true);
    }
    const result = propagate(UNIQUE);
    expect(result.status).toBe('solved');
    expect(result.passes).toBeGreaterThanOrEqual(1);
    expect(result.passes).toBe(1);
    expect(result.placement).toEqual(UNIQUE_SOLUTION);
    for (const id of UNIQUE.landmarks) {
      expect(result.cands.get(id)?.size).toBe(1);
    }
  });

  it('counts only passes that removed a candidate', () => {
    // Same clues, reversed: the windmill can only be pinned in the pass after the well is.
    const result = propagate({ ...UNIQUE, clues: [...UNIQUE.clues].reverse() });
    expect(result.status).toBe('solved');
    expect(result.passes).toBe(2);
    expect(result.placement).toEqual(UNIQUE_SOLUTION);
  });

  it('is stuck when a clue is missing, keeping the singletons it found', () => {
    const result = propagate(AMBIGUOUS);
    expect(result.status).toBe('stuck');
    expect(candsOf(result.cands, 'lighthouse')).toEqual(
      sorted([at(0, 3), at(1, 4), at(2, 4), at(3, 5), at(4, 4), at(5, 3)])
    );
    expect(result.placement).toEqual({});
  });

  it('reports a contradiction for "due east" and "due west" on the same pair', () => {
    const result = propagate(CONTRADICTORY);
    expect(result.status).toBe('contradiction');
    expect(result.passes).toBeGreaterThanOrEqual(1);
  });

  it('extreme removes from the other landmark every cell west of all of the well candidates', () => {
    // Inland cells: (1,2) (1,3) (2,1) (2,2) (2,3) (3,2) (3,3) (3,4) (4,3); westernmost column is 1.
    const result = propagate({
      land: ISLAND,
      landmarks: ['well', 'fort'],
      clues: [
        { type: 'inland', a: 'well' },
        { type: 'extreme', a: 'well', dir: 'W' },
      ],
    });
    expect(result.status).toBe('stuck');
    const well = candsOf(result.cands, 'well');
    expect(well).toEqual(
      sorted([
        at(1, 2),
        at(1, 3),
        at(2, 1),
        at(2, 2),
        at(2, 3),
        at(3, 2),
        at(3, 3),
        at(3, 4),
        at(4, 3),
      ])
    );
    const minWellCol = Math.min(...well.map((p) => p % 6));
    const fort = candsOf(result.cands, 'fort');
    expect(fort.some((p) => p % 6 < minWellCol)).toBe(false);
    expect(fort).not.toContain(at(2, 0));
    // (2,1) is the only inland cell in column 1, so a fort there would leave the well nowhere.
    expect(fort).not.toContain(at(2, 1));
    expect(fort).toContain(at(1, 1));
    expect(fort).toContain(at(3, 1));
  });

  it('extreme prunes the anchor landmark too (the decomposition is symmetric)', () => {
    // Western-shore fort cells: (0,2) (1,1) (2,0) (3,1) (4,2) (5,3); easternmost column is 3.
    const result = propagate({
      land: ISLAND,
      landmarks: ['well', 'fort'],
      clues: [
        { type: 'shore', a: 'fort', dir: 'W' },
        { type: 'extreme', a: 'well', dir: 'W' },
      ],
    });
    expect(result.status).toBe('stuck');
    const well = candsOf(result.cands, 'well');
    expect(well.some((p) => p % 6 > 3)).toBe(false);
    // A well on (5,3) would need a fort in column 3 or east other than (5,3) itself.
    expect(well).not.toContain(at(5, 3));
    expect(well).toContain(at(0, 3));
    // A fort on (2,0) would need the well in column 0, and (2,0) is the only such cell.
    expect(candsOf(result.cands, 'fort')).toEqual(
      sorted([at(0, 2), at(1, 1), at(3, 1), at(4, 2), at(5, 3)])
    );
  });

  it('between on a column narrows the middle landmark', () => {
    const puzzle: TestPuzzle = {
      land: ISLAND,
      landmarks: ['well', 'mine', 'farm'],
      clues: [{ type: 'between', a: 'well', b: 'mine', c: 'farm' }],
    };
    const start = pinned(puzzle, {
      mine: { r: 0, c: 3 },
      farm: { r: 5, c: 3 },
    });
    const result = propagate(puzzle, start);
    expect(result.status).toBe('stuck');
    expect(candsOf(result.cands, 'well')).toEqual([
      at(1, 3),
      at(2, 3),
      at(3, 3),
      at(4, 3),
    ]);

    const solvedPuzzle: TestPuzzle = {
      ...puzzle,
      clues: [...puzzle.clues, { type: 'touches', a: 'well', b: 'farm' }],
    };
    const solved = propagate(solvedPuzzle, start);
    expect(solved.status).toBe('solved');
    expect(solved.placement.well).toEqual({ r: 4, c: 3 });
  });

  it('between prunes both end landmarks', () => {
    const puzzle: TestPuzzle = {
      land: ISLAND,
      landmarks: ['well', 'mine', 'farm'],
      clues: [{ type: 'between', a: 'well', b: 'mine', c: 'farm' }],
    };
    const result = propagate(puzzle, pinned(puzzle, { well: { r: 2, c: 2 } }));
    expect(result.status).toBe('stuck');
    const ends = sorted([
      at(2, 0),
      at(2, 1),
      at(2, 3),
      at(2, 4),
      at(0, 2),
      at(1, 2),
      at(3, 2),
      at(4, 2),
    ]);
    expect(candsOf(result.cands, 'mine')).toEqual(ends);
    expect(candsOf(result.cands, 'farm')).toEqual(ends);
  });

  it('between with the middle on the northern tip is a contradiction', () => {
    const puzzle: TestPuzzle = {
      land: ISLAND,
      landmarks: ['well', 'mine', 'farm'],
      clues: [{ type: 'between', a: 'well', b: 'mine', c: 'farm' }],
    };
    // Row 0 has land only at columns 2 and 3; nothing lies north of row 0.
    expect(
      propagate(puzzle, pinned(puzzle, { well: { r: 0, c: 3 } })).status
    ).toBe('contradiction');
  });

  it('handles negated touches and shares', () => {
    const puzzle: TestPuzzle = {
      land: ISLAND,
      landmarks: ['fort', 'well'],
      clues: [
        { type: 'touches', a: 'well', b: 'fort', not: true },
        { type: 'shares', a: 'well', axis: 'column', b: 'fort', not: true },
      ],
    };
    const result = propagate(puzzle, pinned(puzzle, { fort: { r: 3, c: 3 } }));
    const well = candsOf(result.cands, 'well');
    // Column 3 is all land (six cells), plus the two row neighbors (3,2) and (3,4).
    const banned = [
      at(0, 3),
      at(1, 3),
      at(2, 3),
      at(3, 3),
      at(4, 3),
      at(5, 3),
      at(3, 2),
      at(3, 4),
    ];
    for (const cell of banned) {
      expect(well).not.toContain(cell);
    }
    expect(well).toContain(at(3, 1));
    expect(well).toContain(at(2, 2));
    expect(well).toHaveLength(20 - banned.length);
  });

  it('handles somewhere and positive shares', () => {
    const puzzle: TestPuzzle = {
      land: ISLAND,
      landmarks: ['well', 'farm', 'camp'],
      clues: [
        { type: 'somewhere', a: 'farm', dir: 'S', b: 'well' },
        { type: 'shares', a: 'camp', axis: 'row', b: 'well' },
      ],
    };
    const result = propagate(puzzle, pinned(puzzle, { well: { r: 2, c: 2 } }));
    expect(
      candsOf(result.cands, 'farm').every((p) => Math.floor(p / 6) > 2)
    ).toBe(true);
    expect(candsOf(result.cands, 'farm')).toHaveLength(5 + 3 + 1);
    expect(candsOf(result.cands, 'camp')).toEqual([
      at(2, 0),
      at(2, 1),
      at(2, 3),
      at(2, 4),
    ]);
  });

  it('applies naked singles across all landmarks', () => {
    const puzzle: TestPuzzle = {
      land: ISLAND,
      landmarks: ['well', 'mine', 'farm'],
      clues: [],
    };
    const result = propagate(puzzle, pinned(puzzle, { well: { r: 2, c: 2 } }));
    expect(result.status).toBe('stuck');
    expect(result.passes).toBe(1);
    expect(result.placement).toEqual({ well: { r: 2, c: 2 } });
    expect(candsOf(result.cands, 'mine')).not.toContain(at(2, 2));
    expect(candsOf(result.cands, 'farm')).toHaveLength(19);

    const clash = pinned(puzzle, {
      well: { r: 2, c: 2 },
      mine: { r: 2, c: 2 },
    });
    expect(propagate(puzzle, clash).status).toBe('contradiction');
  });

  it('returns solved with zero passes for a consistent fully pinned start', () => {
    const start = pinned(UNIQUE, UNIQUE_SOLUTION);
    const result = propagate(UNIQUE, start);
    expect(result.status).toBe('solved');
    expect(result.passes).toBe(0);
    expect(result.placement).toEqual(UNIQUE_SOLUTION);
  });

  it('rejects a fully pinned start that breaks a clue', () => {
    const start = pinned(UNIQUE, {
      ...UNIQUE_SOLUTION,
      windmill: { r: 3, c: 2 },
    });
    expect(propagate(UNIQUE, start).status).toBe('contradiction');
  });

  it('does not mutate the start candidates', () => {
    const start = initialCandidates(UNIQUE);
    propagate(UNIQUE, start);
    for (const id of UNIQUE.landmarks) {
      expect(candsOf(start, id)).toEqual(landIndexes(ISLAND));
    }
  });
});

describe('countSolutions', () => {
  it('finds exactly the hand-placed solution of the unique puzzle', () => {
    const result = countSolutions(UNIQUE);
    expect(result.count).toBe(1);
    expect(result.capped).toBe(false);
    expect(result.solutions).toEqual([UNIQUE_SOLUTION]);
    expect(propagate(UNIQUE).placement).toEqual(result.solutions[0]);
  });

  it('stops at the default limit of two when a clue is missing', () => {
    const result = countSolutions(AMBIGUOUS);
    expect(result.count).toBe(2);
    expect(result.solutions).toHaveLength(2);
    expect(result.capped).toBe(false);
    expectEveryClueHolds(AMBIGUOUS, result.solutions);
  });

  it('returns zero for contradictory clues', () => {
    const result = countSolutions(CONTRADICTORY);
    expect(result.count).toBe(0);
    expect(result.solutions).toEqual([]);
    expect(result.capped).toBe(false);
  });

  it('honors a larger limit and returns distinct solutions', () => {
    const result = countSolutions(AMBIGUOUS, { limit: 100 });
    // Every eastern-shore lighthouse cell, each well touching it, each windmill due west of the well.
    expect(result.count).toBe(bruteForce(AMBIGUOUS).length);
    expect(result.count).toBeLessThan(100);
    const keys = new Set(result.solutions.map((s) => JSON.stringify(s)));
    expect(keys.size).toBe(result.count);
    expectEveryClueHolds(AMBIGUOUS, result.solutions);
  });

  it('sets capped when the node cap is exceeded', () => {
    const result = countSolutions(LOOSE_FIVE, { nodeCap: 1 });
    expect(result.capped).toBe(true);
    expect(result.nodes).toBe(2);
  });

  it('does not cap a small search under the default cap', () => {
    const result = countSolutions(LOOSE_FIVE, { limit: 5 });
    expect(result.capped).toBe(false);
    expect(result.count).toBe(5);
    expectEveryClueHolds(LOOSE_FIVE, result.solutions);
  });

  it('every returned solution satisfies every clue', () => {
    for (const puzzle of [UNIQUE, AMBIGUOUS, LOOSE_FIVE, EXPEDITION]) {
      expectEveryClueHolds(
        puzzle,
        countSolutions(puzzle, { limit: 10 }).solutions
      );
    }
  });

  it('proves a 9-landmark, 22-cell, 10-clue puzzle unique well under a second', () => {
    expect(landIndexes(ISLAND_22)).toHaveLength(22);
    expectEveryClueHolds(EXPEDITION, [EXPEDITION_SOLUTION]);
    const human = propagate(EXPEDITION);
    expect(human.status).toBe('stuck');

    const t0 = performance.now();
    const result = countSolutions(EXPEDITION);
    const ms = performance.now() - t0;

    expect(result.count).toBe(1);
    expect(result.capped).toBe(false);
    expect(result.nodes).toBeGreaterThan(1);
    expect(result.solutions).toEqual([EXPEDITION_SOLUTION]);
    expect(ms).toBeLessThan(250);
  });
});

describe('difficultyFor', () => {
  it('grades by propagation passes', () => {
    expect(DIFFICULTY_THRESHOLDS).toEqual({ easyMax: 3, mediumMax: 6 });
    expect(difficultyFor(1)).toBe('easy');
    expect(difficultyFor(3)).toBe('easy');
    expect(difficultyFor(4)).toBe('medium');
    expect(difficultyFor(6)).toBe('medium');
    expect(difficultyFor(7)).toBe('hard');
  });
});

describe('randomized cross-check', () => {
  it('agrees with clueHolds on 30 random 5-landmark puzzles', () => {
    const limit = 20;
    for (let seed = 1; seed <= 30; seed++) {
      const rand = lcg(seed * 7919);
      const { landmarks, placement } = randomPlacement(ISLAND, 5, rand);
      const clues = pickMixed(
        trueClues(placement, ISLAND, landmarks),
        3 + Math.floor(rand() * 5),
        rand
      );
      const puzzle: TestPuzzle = { land: ISLAND, landmarks, clues };

      const result = countSolutions(puzzle, { limit });
      expect(result.capped).toBe(false);
      expect(result.count).toBeGreaterThanOrEqual(1);
      expectEveryClueHolds(puzzle, result.solutions);
      if (result.count < limit) {
        expect(
          result.solutions.some((s) => samePlacement(s, placement, landmarks))
        ).toBe(true);
      }

      // Propagation is sound: the real placement survives in every candidate set.
      const human = propagate(puzzle);
      expect(human.status).not.toBe('contradiction');
      for (const id of landmarks) {
        const cell = placement[id];
        if (!cell) throw new Error(`placement missing ${id}`);
        expect(human.cands.get(id)?.has(idx(cell))).toBe(true);
      }
      if (human.status === 'solved') {
        expect(result.count).toBe(1);
        expect(samePlacement(human.placement, placement, landmarks)).toBe(true);
      }
    }
  });

  it('matches exhaustive enumeration on 30 random 3-landmark puzzles', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rand = lcg(seed * 104729 + 17);
      const { landmarks, placement } = randomPlacement(ISLAND, 3, rand);
      const clues = pickMixed(
        trueClues(placement, ISLAND, landmarks),
        1 + Math.floor(rand() * 4),
        rand
      );
      const puzzle: TestPuzzle = { land: ISLAND, landmarks, clues };

      const expected = bruteForce(puzzle);
      const result = countSolutions(puzzle, { limit: 100000 });
      expect(result.capped).toBe(false);
      expect(result.count).toBe(expected.length);
      const key = (s: Placement): string =>
        landmarks.map((id) => (s[id] ? idx(s[id]) : -1)).join(',');
      expect(result.solutions.map(key).sort()).toEqual(
        expected.map(key).sort()
      );

      // Propagation never removes a cell that some solution uses.
      const human = propagate(puzzle);
      const dropped = expected.filter((solution) =>
        landmarks.some((id) => {
          const cell = solution[id];
          return !cell || !human.cands.get(id)?.has(idx(cell));
        })
      );
      expect(dropped).toEqual([]);
      expect(expected.length).toBeGreaterThanOrEqual(1);
      expect(human.status).not.toBe('contradiction');
      if (human.status === 'solved') expect(expected.length).toBe(1);
    }
  });

  it('stays fast and consistent on 10 random 9-landmark, 10-clue puzzles', () => {
    const t0 = performance.now();
    for (let seed = 1; seed <= 10; seed++) {
      const rand = lcg(seed * 31337 + 5);
      const { landmarks, placement } = randomPlacement(ISLAND_22, 9, rand);
      const clues = pickMixed(
        trueClues(placement, ISLAND_22, landmarks),
        10,
        rand
      );
      const puzzle: TestPuzzle = { land: ISLAND_22, landmarks, clues };
      const result = countSolutions(puzzle, { limit: 5 });
      expect(result.capped).toBe(false);
      expect(result.count).toBeGreaterThanOrEqual(1);
      expectEveryClueHolds(puzzle, result.solutions);
      if (result.count < 5) {
        expect(
          result.solutions.some((s) => samePlacement(s, placement, landmarks))
        ).toBe(true);
      }
    }
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
