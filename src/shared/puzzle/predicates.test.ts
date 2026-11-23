import { describe, expect, it } from 'vitest';
import { maskFromRows } from './grid';
import {
  allCluesLit,
  clueHolds,
  clueLandmarks,
  evaluateClue,
  isSolved,
  samePlacement,
  validatePlacement,
} from './predicates';
import type { PlacementProblem } from './predicates';
import type {
  Cell,
  Clue,
  ClueState,
  Dir,
  LandmarkId,
  Placement,
  Puzzle,
} from './types';

// Same fixture as grid.test.ts, copied rather than imported so this file stays standalone.
const ISLAND = maskFromRows([
  '..LL..',
  '.LLLL.',
  'LLLLL.',
  '.LLLLL',
  '..LLL.',
  '...L..',
]);

const LMS: readonly LandmarkId[] = [
  'lighthouse',
  'windmill',
  'well',
  'temple',
  'fort',
  'mine',
  'farm',
  'shipwreck',
];

const cell = (r: number, c: number): Cell => ({ r, c });

const state = (
  clue: Clue,
  placement: Placement,
  landmarks: readonly LandmarkId[] = LMS
): ClueState => evaluateClue(clue, placement, ISLAND, landmarks);

type Case = { why: string; placement: Placement; expected: ClueState };

describe('shore', () => {
  const clue: Clue = { type: 'shore', a: 'lighthouse', dir: 'N' };

  it.each<Case>([
    {
      why: 'lit: northern neighbor is off-grid',
      placement: { lighthouse: cell(0, 2) },
      expected: 'lit',
    },
    {
      why: 'lit: northern neighbor is in-grid water',
      placement: { lighthouse: cell(1, 1) },
      expected: 'lit',
    },
    {
      why: 'contradicted: northern neighbor is land',
      placement: { lighthouse: cell(2, 2) },
      expected: 'contradicted',
    },
    {
      why: 'contradicted: coast cell on a different shore',
      placement: { lighthouse: cell(2, 4) },
      expected: 'contradicted',
    },
    { why: 'pending: unplaced', placement: {}, expected: 'pending' },
    {
      why: 'pending: other landmarks placed but not a',
      placement: { windmill: cell(0, 2) },
      expected: 'pending',
    },
  ])('$why', ({ placement, expected }) => {
    expect(state(clue, placement)).toBe(expected);
  });

  it.each<{ dir: Dir; lit: Cell; water: Cell; contradicted: Cell }>([
    { dir: 'N', lit: cell(0, 2), water: cell(1, 1), contradicted: cell(5, 3) },
    { dir: 'E', lit: cell(3, 5), water: cell(2, 4), contradicted: cell(2, 0) },
    { dir: 'S', lit: cell(5, 3), water: cell(3, 1), contradicted: cell(0, 2) },
    { dir: 'W', lit: cell(2, 0), water: cell(4, 2), contradicted: cell(3, 5) },
  ])(
    'direction $dir: off-grid and water light it, land contradicts it',
    ({ dir, lit, water, contradicted }) => {
      const c: Clue = { type: 'shore', a: 'lighthouse', dir };
      expect(state(c, { lighthouse: lit })).toBe('lit');
      expect(state(c, { lighthouse: water })).toBe('lit');
      expect(state(c, { lighthouse: contradicted })).toBe('contradicted');
    }
  );
});

describe('inland', () => {
  const clue: Clue = { type: 'inland', a: 'temple' };

  it.each<Case>([
    {
      why: 'lit: all four neighbors are land',
      placement: { temple: cell(2, 2) },
      expected: 'lit',
    },
    {
      why: 'lit: deepest cell',
      placement: { temple: cell(3, 3) },
      expected: 'lit',
    },
    {
      why: 'contradicted: edge cell',
      placement: { temple: cell(0, 2) },
      expected: 'contradicted',
    },
    {
      why: 'contradicted: one water neighbor',
      placement: { temple: cell(2, 4) },
      expected: 'contradicted',
    },
    { why: 'pending: unplaced', placement: {}, expected: 'pending' },
  ])('$why', ({ placement, expected }) => {
    expect(state(clue, placement)).toBe(expected);
  });
});

describe('due', () => {
  const clue: Clue = { type: 'due', a: 'windmill', dir: 'E', b: 'well' };

  it.each<Case>([
    {
      why: 'lit: same row, a east of b',
      placement: { windmill: cell(2, 4), well: cell(2, 0) },
      expected: 'lit',
    },
    {
      why: 'lit: adjacent',
      placement: { windmill: cell(2, 3), well: cell(2, 2) },
      expected: 'lit',
    },
    {
      why: 'contradicted: same row, wrong way',
      placement: { windmill: cell(2, 0), well: cell(2, 4) },
      expected: 'contradicted',
    },
    {
      why: 'contradicted: east but not the same row',
      placement: { windmill: cell(1, 4), well: cell(3, 1) },
      expected: 'contradicted',
    },
    {
      why: 'contradicted: same column instead of same row',
      placement: { windmill: cell(1, 3), well: cell(3, 3) },
      expected: 'contradicted',
    },
    {
      why: 'pending: only a placed',
      placement: { windmill: cell(2, 4) },
      expected: 'pending',
    },
    {
      why: 'pending: only b placed',
      placement: { well: cell(2, 0) },
      expected: 'pending',
    },
    { why: 'pending: neither placed', placement: {}, expected: 'pending' },
  ])('$why', ({ placement, expected }) => {
    expect(state(clue, placement)).toBe(expected);
  });

  it.each<{ dir: Dir; a: Cell; b: Cell }>([
    { dir: 'N', a: cell(1, 3), b: cell(3, 3) },
    { dir: 'E', a: cell(2, 4), b: cell(2, 0) },
    { dir: 'S', a: cell(3, 3), b: cell(1, 3) },
    { dir: 'W', a: cell(2, 0), b: cell(2, 4) },
  ])(
    'direction $dir is lit one way and contradicted the other',
    ({ dir, a, b }) => {
      const c: Clue = { type: 'due', a: 'windmill', dir, b: 'well' };
      expect(state(c, { windmill: a, well: b })).toBe('lit');
      expect(state(c, { windmill: b, well: a })).toBe('contradicted');
    }
  );
});

describe('somewhere', () => {
  const clue: Clue = { type: 'somewhere', a: 'farm', dir: 'S', b: 'temple' };

  it.each<Case>([
    {
      why: 'lit: south in a different column',
      placement: { farm: cell(4, 2), temple: cell(1, 3) },
      expected: 'lit',
    },
    {
      why: 'lit: south in the same column',
      placement: { farm: cell(3, 3), temple: cell(1, 3) },
      expected: 'lit',
    },
    {
      why: 'lit: one row south, far to the east',
      placement: { farm: cell(3, 5), temple: cell(2, 0) },
      expected: 'lit',
    },
    {
      why: 'contradicted: north',
      placement: { farm: cell(1, 3), temple: cell(4, 2) },
      expected: 'contradicted',
    },
    {
      why: 'contradicted: same row is not strictly south',
      placement: { farm: cell(2, 0), temple: cell(2, 4) },
      expected: 'contradicted',
    },
    {
      why: 'pending: b unplaced',
      placement: { farm: cell(4, 2) },
      expected: 'pending',
    },
    {
      why: 'pending: a unplaced',
      placement: { temple: cell(1, 3) },
      expected: 'pending',
    },
  ])('$why', ({ placement, expected }) => {
    expect(state(clue, placement)).toBe(expected);
  });

  it.each<{ dir: Dir; a: Cell; b: Cell }>([
    { dir: 'N', a: cell(0, 2), b: cell(4, 4) },
    { dir: 'E', a: cell(3, 5), b: cell(1, 1) },
    { dir: 'S', a: cell(5, 3), b: cell(1, 1) },
    { dir: 'W', a: cell(2, 0), b: cell(4, 4) },
  ])('direction $dir ignores the other axis', ({ dir, a, b }) => {
    const c: Clue = { type: 'somewhere', a: 'farm', dir, b: 'temple' };
    expect(state(c, { farm: a, temple: b })).toBe('lit');
    expect(state(c, { farm: b, temple: a })).toBe('contradicted');
  });
});

describe('touches', () => {
  const clue: Clue = { type: 'touches', a: 'fort', b: 'windmill' };
  const negated: Clue = {
    type: 'touches',
    a: 'fort',
    b: 'windmill',
    not: true,
  };
  const explicitFalse: Clue = {
    type: 'touches',
    a: 'fort',
    b: 'windmill',
    not: false,
  };
  const adjacent: Placement = { fort: cell(2, 2), windmill: cell(2, 3) };
  const diagonal: Placement = { fort: cell(2, 2), windmill: cell(3, 3) };
  const partial: Placement = { fort: cell(2, 2) };

  it.each<Case>([
    { why: 'lit: horizontal neighbors', placement: adjacent, expected: 'lit' },
    {
      why: 'lit: vertical neighbors',
      placement: { fort: cell(2, 2), windmill: cell(3, 2) },
      expected: 'lit',
    },
    {
      why: 'contradicted: diagonal',
      placement: diagonal,
      expected: 'contradicted',
    },
    {
      why: 'contradicted: two apart',
      placement: { fort: cell(2, 2), windmill: cell(2, 4) },
      expected: 'contradicted',
    },
    { why: 'pending: b unplaced', placement: partial, expected: 'pending' },
    {
      why: 'pending: a unplaced',
      placement: { windmill: cell(2, 3) },
      expected: 'pending',
    },
  ])('$why', ({ placement, expected }) => {
    expect(state(clue, placement)).toBe(expected);
  });

  it('negation flips lit and contradicted but keeps pending', () => {
    expect(state(negated, adjacent)).toBe('contradicted');
    expect(state(negated, diagonal)).toBe('lit');
    expect(state(negated, partial)).toBe('pending');
  });

  it('not: false behaves like the positive clue', () => {
    expect(state(explicitFalse, adjacent)).toBe('lit');
    expect(state(explicitFalse, diagonal)).toBe('contradicted');
  });
});

describe('shares', () => {
  const column: Clue = {
    type: 'shares',
    a: 'shipwreck',
    axis: 'column',
    b: 'lighthouse',
  };
  const notColumn: Clue = {
    type: 'shares',
    a: 'shipwreck',
    axis: 'column',
    b: 'lighthouse',
    not: true,
  };
  const row: Clue = {
    type: 'shares',
    a: 'shipwreck',
    axis: 'row',
    b: 'lighthouse',
  };
  const notRow: Clue = {
    type: 'shares',
    a: 'shipwreck',
    axis: 'row',
    b: 'lighthouse',
    not: true,
  };
  const sameColumn: Placement = {
    shipwreck: cell(5, 3),
    lighthouse: cell(0, 3),
  };
  const otherColumn: Placement = {
    shipwreck: cell(5, 3),
    lighthouse: cell(0, 2),
  };
  const sameRow: Placement = { shipwreck: cell(2, 0), lighthouse: cell(2, 4) };
  const otherRow: Placement = { shipwreck: cell(2, 0), lighthouse: cell(3, 1) };
  const partial: Placement = { shipwreck: cell(5, 3) };

  it.each<{
    why: string;
    clue: Clue;
    placement: Placement;
    expected: ClueState;
  }>([
    { why: 'column lit', clue: column, placement: sameColumn, expected: 'lit' },
    {
      why: 'column contradicted',
      clue: column,
      placement: otherColumn,
      expected: 'contradicted',
    },
    {
      why: 'column pending',
      clue: column,
      placement: partial,
      expected: 'pending',
    },
    { why: 'row lit', clue: row, placement: sameRow, expected: 'lit' },
    {
      why: 'row contradicted',
      clue: row,
      placement: otherRow,
      expected: 'contradicted',
    },
    { why: 'row pending', clue: row, placement: partial, expected: 'pending' },
    {
      why: 'negated column lit',
      clue: notColumn,
      placement: otherColumn,
      expected: 'lit',
    },
    {
      why: 'negated column contradicted',
      clue: notColumn,
      placement: sameColumn,
      expected: 'contradicted',
    },
    {
      why: 'negated column pending',
      clue: notColumn,
      placement: partial,
      expected: 'pending',
    },
    {
      why: 'negated row lit',
      clue: notRow,
      placement: otherRow,
      expected: 'lit',
    },
    {
      why: 'negated row contradicted',
      clue: notRow,
      placement: sameRow,
      expected: 'contradicted',
    },
    {
      why: 'negated row pending',
      clue: notRow,
      placement: partial,
      expected: 'pending',
    },
  ])('$why', ({ clue, placement, expected }) => {
    expect(state(clue, placement)).toBe(expected);
  });

  it('a row match does not satisfy a column clue', () => {
    expect(state(column, sameRow)).toBe('contradicted');
    expect(state(row, sameColumn)).toBe('contradicted');
  });
});

describe('between', () => {
  const clue: Clue = { type: 'between', a: 'well', b: 'mine', c: 'farm' };

  it.each<Case>([
    {
      why: 'lit: on a row',
      placement: { well: cell(2, 2), mine: cell(2, 0), farm: cell(2, 4) },
      expected: 'lit',
    },
    {
      why: 'lit: on a row with endpoints swapped',
      placement: { well: cell(2, 2), mine: cell(2, 4), farm: cell(2, 0) },
      expected: 'lit',
    },
    {
      why: 'lit: on a column',
      placement: { well: cell(3, 3), mine: cell(1, 3), farm: cell(5, 3) },
      expected: 'lit',
    },
    {
      why: 'lit: on a column with endpoints swapped',
      placement: { well: cell(3, 3), mine: cell(5, 3), farm: cell(1, 3) },
      expected: 'lit',
    },
    {
      why: 'contradicted: a is an endpoint',
      placement: { well: cell(2, 0), mine: cell(2, 2), farm: cell(2, 4) },
      expected: 'contradicted',
    },
    {
      why: 'contradicted: not collinear',
      placement: { well: cell(2, 2), mine: cell(2, 0), farm: cell(3, 4) },
      expected: 'contradicted',
    },
    {
      why: 'contradicted: a off the shared line',
      placement: { well: cell(3, 2), mine: cell(2, 0), farm: cell(2, 4) },
      expected: 'contradicted',
    },
    {
      why: 'pending: a unplaced',
      placement: { mine: cell(2, 0), farm: cell(2, 4) },
      expected: 'pending',
    },
    {
      why: 'pending: b unplaced',
      placement: { well: cell(2, 2), farm: cell(2, 4) },
      expected: 'pending',
    },
    {
      why: 'pending: c unplaced',
      placement: { well: cell(2, 2), mine: cell(2, 0) },
      expected: 'pending',
    },
  ])('$why', ({ placement, expected }) => {
    expect(state(clue, placement)).toBe(expected);
  });
});

describe('extreme', () => {
  const three: readonly LandmarkId[] = ['well', 'mine', 'farm'];
  const clue: Clue = { type: 'extreme', a: 'well', dir: 'W' };

  it.each<Case>([
    {
      why: 'pending: a unplaced even when every other landmark is placed',
      placement: { mine: cell(2, 0), farm: cell(3, 5) },
      expected: 'pending',
    },
    {
      why: 'pending: a placed, nothing else placed',
      placement: { well: cell(2, 0) },
      expected: 'pending',
    },
    {
      why: 'pending: a placed, one other placed and not violating',
      placement: { well: cell(2, 0), mine: cell(2, 2) },
      expected: 'pending',
    },
    {
      why: 'contradicted: a placed, a placed other is strictly west',
      placement: { well: cell(2, 2), mine: cell(2, 0) },
      expected: 'contradicted',
    },
    {
      why: 'contradicted: a violation on another row still counts',
      placement: { well: cell(2, 2), farm: cell(3, 1) },
      expected: 'contradicted',
    },
    {
      why: 'contradicted: all placed, one violating',
      placement: { well: cell(2, 2), mine: cell(2, 3), farm: cell(3, 1) },
      expected: 'contradicted',
    },
    {
      why: 'lit: all placed, none strictly west',
      placement: { well: cell(2, 0), mine: cell(2, 2), farm: cell(3, 5) },
      expected: 'lit',
    },
    {
      why: 'lit: a landmark in the same column is not strictly west',
      placement: { well: cell(3, 1), mine: cell(2, 1), farm: cell(4, 2) },
      expected: 'lit',
    },
  ])('$why', ({ placement, expected }) => {
    expect(state(clue, placement, three)).toBe(expected);
  });

  it.each<{ dir: Dir; a: Cell; ok: Cell; bad: Cell }>([
    { dir: 'N', a: cell(1, 1), ok: cell(1, 4), bad: cell(0, 3) },
    { dir: 'E', a: cell(2, 4), ok: cell(1, 4), bad: cell(3, 5) },
    { dir: 'S', a: cell(4, 2), ok: cell(4, 4), bad: cell(5, 3) },
    { dir: 'W', a: cell(1, 1), ok: cell(2, 1), bad: cell(2, 0) },
  ])('direction $dir with two landmarks', ({ dir, a, ok, bad }) => {
    const c: Clue = { type: 'extreme', a: 'well', dir };
    const two: readonly LandmarkId[] = ['well', 'mine'];
    expect(state(c, { well: a }, two)).toBe('pending');
    expect(state(c, { well: a, mine: ok }, two)).toBe('lit');
    expect(state(c, { well: a, mine: bad }, two)).toBe('contradicted');
  });

  it('only quantifies over the landmarks of the puzzle', () => {
    const two: readonly LandmarkId[] = ['well', 'mine'];
    expect(
      state(clue, { well: cell(2, 2), mine: cell(2, 3), farm: cell(2, 0) }, two)
    ).toBe('lit');
  });
});

describe('clueLandmarks', () => {
  it.each<{ clue: Clue; expected: LandmarkId[] }>([
    {
      clue: { type: 'shore', a: 'lighthouse', dir: 'N' },
      expected: ['lighthouse'],
    },
    { clue: { type: 'inland', a: 'temple' }, expected: ['temple'] },
    {
      clue: { type: 'due', a: 'windmill', dir: 'E', b: 'well' },
      expected: ['windmill', 'well'],
    },
    {
      clue: { type: 'somewhere', a: 'farm', dir: 'S', b: 'temple' },
      expected: ['farm', 'temple'],
    },
    {
      clue: { type: 'touches', a: 'fort', b: 'windmill', not: true },
      expected: ['fort', 'windmill'],
    },
    {
      clue: { type: 'shares', a: 'shipwreck', axis: 'column', b: 'lighthouse' },
      expected: ['shipwreck', 'lighthouse'],
    },
    {
      clue: { type: 'between', a: 'well', b: 'mine', c: 'farm' },
      expected: ['well', 'mine', 'farm'],
    },
    { clue: { type: 'extreme', a: 'well', dir: 'W' }, expected: ['well'] },
  ])('$clue.type names $expected in order', ({ clue, expected }) => {
    expect(clueLandmarks(clue)).toEqual(expected);
  });
});

describe('clueHolds', () => {
  it('throws when a named landmark is unplaced', () => {
    const clue: Clue = { type: 'due', a: 'windmill', dir: 'E', b: 'well' };
    expect(() =>
      clueHolds(clue, { windmill: cell(2, 4) }, ISLAND, LMS)
    ).toThrow(/well is not placed/);
  });

  it('treats unplaced others as not violating an extreme clue', () => {
    const clue: Clue = { type: 'extreme', a: 'well', dir: 'W' };
    expect(clueHolds(clue, { well: cell(2, 2) }, ISLAND, LMS)).toBe(true);
    expect(
      clueHolds(clue, { well: cell(2, 2), mine: cell(2, 0) }, ISLAND, LMS)
    ).toBe(false);
  });

  it('agrees with evaluateClue on a complete placement', () => {
    const complete: Placement = {
      lighthouse: cell(0, 2),
      windmill: cell(1, 4),
      well: cell(2, 2),
      temple: cell(3, 3),
      fort: cell(2, 0),
      mine: cell(5, 3),
      farm: cell(4, 4),
      shipwreck: cell(3, 5),
    };
    const clues: Clue[] = [
      { type: 'shore', a: 'lighthouse', dir: 'N' },
      { type: 'shore', a: 'lighthouse', dir: 'S' },
      { type: 'inland', a: 'well' },
      { type: 'inland', a: 'fort' },
      { type: 'due', a: 'well', dir: 'E', b: 'fort' },
      { type: 'due', a: 'well', dir: 'W', b: 'fort' },
      { type: 'somewhere', a: 'farm', dir: 'S', b: 'temple' },
      { type: 'somewhere', a: 'farm', dir: 'N', b: 'temple' },
      { type: 'touches', a: 'temple', b: 'well' },
      { type: 'touches', a: 'temple', b: 'well', not: true },
      { type: 'shares', a: 'lighthouse', axis: 'column', b: 'well' },
      { type: 'shares', a: 'lighthouse', axis: 'row', b: 'well', not: true },
      { type: 'between', a: 'well', b: 'fort', c: 'windmill' },
      { type: 'between', a: 'temple', b: 'lighthouse', c: 'mine' },
      { type: 'extreme', a: 'shipwreck', dir: 'E' },
      { type: 'extreme', a: 'shipwreck', dir: 'W' },
    ];
    const lit = clues.filter((c) => clueHolds(c, complete, ISLAND, LMS)).length;
    expect(lit).toBe(8);
    for (const c of clues) {
      const expected: ClueState = clueHolds(c, complete, ISLAND, LMS)
        ? 'lit'
        : 'contradicted';
      expect(evaluateClue(c, complete, ISLAND, LMS)).toBe(expected);
    }
  });
});

describe('validatePlacement', () => {
  const puzzle: Pick<Puzzle, 'land' | 'landmarks'> = {
    land: ISLAND,
    landmarks: ['well', 'mine', 'farm'],
  };
  const good: Placement = {
    well: cell(2, 2),
    mine: cell(2, 0),
    farm: cell(3, 5),
  };

  it('accepts a complete, distinct, on-land placement', () => {
    expect(validatePlacement(puzzle, good)).toEqual({ ok: true });
  });

  it.each<{ why: string; reason: PlacementProblem; placement: Placement }>([
    {
      why: 'a landmark is absent',
      reason: 'missing',
      placement: { well: cell(2, 2), mine: cell(2, 0) },
    },
    { why: 'the placement is empty', reason: 'missing', placement: {} },
    {
      why: 'a landmark outside the puzzle is placed',
      reason: 'unknown',
      placement: { ...good, lighthouse: cell(0, 2) },
    },
    {
      why: 'a negative coordinate',
      reason: 'offgrid',
      placement: { ...good, well: cell(-1, 2) },
    },
    {
      why: 'a coordinate past the edge',
      reason: 'offgrid',
      placement: { ...good, well: cell(6, 0) },
    },
    {
      why: 'a water cell',
      reason: 'water',
      placement: { ...good, well: cell(0, 0) },
    },
    {
      why: 'two landmarks share a cell',
      reason: 'duplicate',
      placement: { ...good, mine: cell(2, 2) },
    },
  ])('reports $reason when $why', ({ reason, placement }) => {
    expect(validatePlacement(puzzle, placement)).toEqual({ ok: false, reason });
  });
});

describe('isSolved', () => {
  const shoreMineW: Clue = { type: 'shore', a: 'mine', dir: 'W' };
  const puzzle: Puzzle = {
    id: 'fixture-1',
    number: 0,
    name: 'Test Reach',
    difficulty: 'easy',
    land: ISLAND,
    landmarks: ['well', 'mine', 'farm'],
    clues: [
      { type: 'due', a: 'well', dir: 'E', b: 'mine' },
      { type: 'inland', a: 'well' },
      shoreMineW,
      { type: 'shore', a: 'farm', dir: 'E' },
      { type: 'somewhere', a: 'farm', dir: 'S', b: 'well' },
      { type: 'extreme', a: 'farm', dir: 'E' },
      { type: 'touches', a: 'well', b: 'farm', not: true },
      { type: 'shares', a: 'mine', axis: 'row', b: 'well' },
    ],
  };
  const solution: Placement = {
    well: cell(2, 2),
    mine: cell(2, 0),
    farm: cell(3, 5),
  };

  it('is true for the hand-built solution', () => {
    expect(allCluesLit(puzzle, solution)).toBe(true);
    expect(isSolved(puzzle, solution)).toBe(true);
  });

  it('is false after moving one landmark', () => {
    const moved: Placement = { ...solution, mine: cell(2, 1) };
    expect(validatePlacement(puzzle, moved)).toEqual({ ok: true });
    expect(evaluateClue(shoreMineW, moved, ISLAND, puzzle.landmarks)).toBe(
      'contradicted'
    );
    expect(allCluesLit(puzzle, moved)).toBe(false);
    expect(isSolved(puzzle, moved)).toBe(false);
  });

  it('is false when the placement is incomplete, even if every clue is pending or lit', () => {
    const partial: Placement = { well: cell(2, 2), mine: cell(2, 0) };
    expect(isSolved(puzzle, partial)).toBe(false);
  });

  it('is false when a landmark is on water', () => {
    expect(isSolved(puzzle, { ...solution, farm: cell(3, 0) })).toBe(false);
  });
});

describe('samePlacement', () => {
  const two: readonly LandmarkId[] = ['well', 'mine'];

  it('is true when every listed landmark is on the same cell by value', () => {
    expect(
      samePlacement(
        { well: cell(2, 2), mine: cell(2, 0) },
        { well: cell(2, 2), mine: cell(2, 0) },
        two
      )
    ).toBe(true);
  });

  it('is false when a cell differs', () => {
    expect(
      samePlacement(
        { well: cell(2, 2), mine: cell(2, 0) },
        { well: cell(2, 2), mine: cell(2, 1) },
        two
      )
    ).toBe(false);
  });

  it('is true when a landmark is unplaced on both sides', () => {
    expect(samePlacement({ well: cell(2, 2) }, { well: cell(2, 2) }, two)).toBe(
      true
    );
  });

  it('is false when a landmark is placed on one side only', () => {
    expect(
      samePlacement(
        { well: cell(2, 2), mine: cell(2, 0) },
        { well: cell(2, 2) },
        two
      )
    ).toBe(false);
    expect(
      samePlacement(
        { well: cell(2, 2) },
        { well: cell(2, 2), mine: cell(2, 0) },
        two
      )
    ).toBe(false);
  });

  it('ignores landmarks outside the list', () => {
    expect(
      samePlacement(
        { well: cell(2, 2), farm: cell(3, 5) },
        { well: cell(2, 2), farm: cell(0, 2) },
        ['well']
      )
    ).toBe(true);
  });
});
