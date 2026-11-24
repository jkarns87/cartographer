import { describe, expect, it } from 'vitest';

import { maskFromRows } from '../../shared/puzzle/grid';
import type { LandmarkId, Placement } from '../../shared/puzzle/types';
import { initialState, landmarkAt, nextUnplaced, reduce } from './reducer';

/** Task 1 fixture. Row 0 is north, column 0 is west. */
const ISLAND = maskFromRows([
  '..LL..',
  '.LLLL.',
  'LLLLL.',
  '.LLLLL',
  '..LLL.',
  '...L..',
]);

const LANDMARKS: LandmarkId[] = ['lighthouse', 'windmill', 'well'];
const PUZZLE = { land: ISLAND, landmarks: LANDMARKS };

const WATER = { r: 0, c: 0 };
const LAND_A = { r: 2, c: 2 };
const LAND_B = { r: 3, c: 4 };
const LAND_C = { r: 5, c: 3 };

describe('initialState', () => {
  it('selects the first landmark when nothing is placed', () => {
    const s = initialState(LANDMARKS);
    expect(s).toEqual({ selected: 'lighthouse', placements: {}, history: '', corrections: 0, hints: 0 });
  });

  it('selects the first unplaced landmark when some are placed', () => {
    const s = initialState(LANDMARKS, { lighthouse: LAND_A }, 'P', 0);
    expect(s.selected).toBe('windmill');
    expect(s.placements).toEqual({ lighthouse: LAND_A });
    expect(s.history).toBe('P');
  });

  it('selects nothing when every landmark is placed', () => {
    const s = initialState(LANDMARKS, { lighthouse: LAND_A, windmill: LAND_B, well: LAND_C }, 'PPP', 2);
    expect(s.selected).toBeNull();
    expect(s.corrections).toBe(2);
  });
});

describe('hints', () => {
  it('appends H, counts the hint, and refuses a fourth', () => {
    let s = initialState(LANDMARKS);
    for (let i = 1; i <= 3; i++) {
      s = reduce(s, { type: 'hint' }, PUZZLE);
      expect(s.hints).toBe(i);
    }
    expect(s.history).toBe('HHH');
    const same = reduce(s, { type: 'hint' }, PUZZLE);
    expect(same).toBe(s);
  });

  it('keeps the hint count through place and lift, and derives it on hydrate', () => {
    let s = reduce(initialState(LANDMARKS), { type: 'hint' }, PUZZLE);
    s = reduce(s, { type: 'tapCell', cell: LAND_A }, PUZZLE);
    s = reduce(s, { type: 'lift', id: 'lighthouse' }, PUZZLE);
    expect(s.history).toBe('HPL');
    expect(s.hints).toBe(1);
    const h = reduce(s, { type: 'hydrate', placements: {}, history: 'PHHL', corrections: 1 }, PUZZLE);
    expect(h.hints).toBe(2);
    expect(initialState(LANDMARKS, {}, 'HPH', 0).hints).toBe(2);
  });
});

describe('nextUnplaced', () => {
  it('returns the first unplaced landmark in order with no anchor', () => {
    expect(nextUnplaced(LANDMARKS, { lighthouse: LAND_A })).toBe('windmill');
  });

  it('wraps around past the end of the list', () => {
    const placements: Placement = { windmill: LAND_B, well: LAND_C };
    expect(nextUnplaced(LANDMARKS, placements, 'well')).toBe('lighthouse');
  });

  it('skips the anchor itself when it is the only unplaced landmark', () => {
    const placements: Placement = { lighthouse: LAND_A, windmill: LAND_B };
    expect(nextUnplaced(LANDMARKS, placements, 'windmill')).toBe('well');
  });

  it('returns null when everything is placed', () => {
    const placements: Placement = { lighthouse: LAND_A, windmill: LAND_B, well: LAND_C };
    expect(nextUnplaced(LANDMARKS, placements, 'well')).toBeNull();
  });
});

describe('landmarkAt', () => {
  it('finds the landmark on a cell and undefined elsewhere', () => {
    const placements: Placement = { windmill: LAND_B };
    expect(landmarkAt(placements, { r: 3, c: 4 })).toBe('windmill');
    expect(landmarkAt(placements, LAND_A)).toBeUndefined();
  });
});

describe('reduce: tapCell', () => {
  it('places the selection on land, appends P and auto-advances', () => {
    const s0 = initialState(LANDMARKS);
    const s1 = reduce(s0, { type: 'tapCell', cell: LAND_A }, PUZZLE);
    expect(s1.placements).toEqual({ lighthouse: LAND_A });
    expect(s1.history).toBe('P');
    expect(s1.selected).toBe('windmill');
    expect(s1.corrections).toBe(0);
  });

  it('honours an explicit selection before placing', () => {
    const s0 = reduce(initialState(LANDMARKS), { type: 'select', id: 'well' }, PUZZLE);
    expect(s0.selected).toBe('well');
    const s1 = reduce(s0, { type: 'tapCell', cell: LAND_C }, PUZZLE);
    expect(s1.placements).toEqual({ well: LAND_C });
    expect(s1.selected).toBe('lighthouse');
  });

  it('leaves state unchanged on water', () => {
    const s0 = initialState(LANDMARKS);
    const s1 = reduce(s0, { type: 'tapCell', cell: WATER }, PUZZLE);
    expect(s1).toBe(s0);
  });

  it('leaves state unchanged off-grid', () => {
    const s0 = initialState(LANDMARKS);
    expect(reduce(s0, { type: 'tapCell', cell: { r: -1, c: 3 } }, PUZZLE)).toBe(s0);
    expect(reduce(s0, { type: 'tapCell', cell: { r: 2, c: 6 } }, PUZZLE)).toBe(s0);
  });

  it('leaves state unchanged on empty land with no selection', () => {
    const s0 = initialState(LANDMARKS, { lighthouse: LAND_A, windmill: LAND_B, well: LAND_C }, 'PPP', 0);
    expect(s0.selected).toBeNull();
    const s1 = reduce(s0, { type: 'tapCell', cell: { r: 1, c: 1 } }, PUZZLE);
    expect(s1).toBe(s0);
  });

  it('lifts the landmark on an occupied cell with L and a correction', () => {
    const s0 = initialState(LANDMARKS, { lighthouse: LAND_A }, 'P', 0);
    expect(s0.selected).toBe('windmill');
    const s1 = reduce(s0, { type: 'tapCell', cell: LAND_A }, PUZZLE);
    expect(s1.placements).toEqual({});
    expect(s1.selected).toBe('lighthouse');
    expect(s1.history).toBe('PL');
    expect(s1.corrections).toBe(1);
  });

  it('never stacks or swaps: tapping an occupied cell with a selection lifts, it does not place', () => {
    const s0 = initialState(LANDMARKS, { lighthouse: LAND_A }, 'P', 0);
    const s1 = reduce(s0, { type: 'tapCell', cell: LAND_A }, PUZZLE);
    expect(landmarkAt(s1.placements, LAND_A)).toBeUndefined();
    expect(s1.placements.windmill).toBeUndefined();
  });

  it('sets the lifted landmark down again on the next land tap', () => {
    const s0 = initialState(LANDMARKS, { lighthouse: LAND_A, windmill: LAND_B }, 'PP', 0);
    const s1 = reduce(s0, { type: 'tapCell', cell: LAND_A }, PUZZLE);
    const s2 = reduce(s1, { type: 'tapCell', cell: { r: 1, c: 1 } }, PUZZLE);
    expect(s2.placements).toEqual({ lighthouse: { r: 1, c: 1 }, windmill: LAND_B });
    expect(s2.history).toBe('PPLP');
    expect(s2.corrections).toBe(1);
    expect(s2.selected).toBe('well');
  });

  it('wraps the auto-advance around the list', () => {
    const s0 = initialState(LANDMARKS, { lighthouse: LAND_A }, 'P', 0);
    const s1 = reduce(s0, { type: 'select', id: 'well' }, PUZZLE);
    const s2 = reduce(s1, { type: 'tapCell', cell: LAND_C }, PUZZLE);
    expect(s2.selected).toBe('windmill');
  });

  it('sets selected to null after the last landmark is placed', () => {
    const s0 = initialState(LANDMARKS, { lighthouse: LAND_A, windmill: LAND_B }, 'PP', 0);
    expect(s0.selected).toBe('well');
    const s1 = reduce(s0, { type: 'tapCell', cell: LAND_C }, PUZZLE);
    expect(s1.selected).toBeNull();
    expect(Object.keys(s1.placements)).toHaveLength(3);
  });

  it('does not mutate the previous state', () => {
    const s0 = initialState(LANDMARKS);
    const frozen = structuredClone(s0);
    reduce(s0, { type: 'tapCell', cell: LAND_A }, PUZZLE);
    expect(s0).toEqual(frozen);
  });
});

describe('reduce: lift', () => {
  it('behaves like tapping the landmark cell', () => {
    const s0 = initialState(LANDMARKS, { lighthouse: LAND_A, windmill: LAND_B }, 'PP', 0);
    const viaLift = reduce(s0, { type: 'lift', id: 'windmill' }, PUZZLE);
    const viaTap = reduce(s0, { type: 'tapCell', cell: LAND_B }, PUZZLE);
    expect(viaLift).toEqual(viaTap);
    expect(viaLift.selected).toBe('windmill');
    expect(viaLift.history).toBe('PPL');
    expect(viaLift.corrections).toBe(1);
  });

  it('is ignored for an unplaced landmark', () => {
    const s0 = initialState(LANDMARKS, { lighthouse: LAND_A }, 'P', 0);
    expect(reduce(s0, { type: 'lift', id: 'well' }, PUZZLE)).toBe(s0);
  });
});

describe('reduce: select', () => {
  it('selects an unplaced landmark', () => {
    const s0 = initialState(LANDMARKS);
    const s1 = reduce(s0, { type: 'select', id: 'well' }, PUZZLE);
    expect(s1.selected).toBe('well');
    expect(s1.history).toBe('');
  });

  it('ignores a placed landmark', () => {
    const s0 = initialState(LANDMARKS, { lighthouse: LAND_A }, 'P', 0);
    expect(reduce(s0, { type: 'select', id: 'lighthouse' }, PUZZLE)).toBe(s0);
  });

  it('ignores a landmark that is not in the puzzle', () => {
    const s0 = initialState(LANDMARKS);
    expect(reduce(s0, { type: 'select', id: 'beacon' }, PUZZLE)).toBe(s0);
  });
});

describe('reduce: hydrate', () => {
  it('restores placements, history and corrections and reselects the first unplaced', () => {
    const s0 = reduce(initialState(LANDMARKS), { type: 'tapCell', cell: LAND_A }, PUZZLE);
    const s1 = reduce(
      s0,
      { type: 'hydrate', placements: { windmill: LAND_B }, history: 'PLP', corrections: 1 },
      PUZZLE
    );
    expect(s1).toEqual({
      selected: 'lighthouse',
      placements: { windmill: LAND_B },
      history: 'PLP',
      corrections: 1,
      hints: 0,
    });
  });
});
