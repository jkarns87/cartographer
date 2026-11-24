import { describe, expect, it } from 'vitest';

import { maskFromRows } from './grid';
import { computeHint, countHints, HINT_PENALTY_MS, MAX_HINTS } from './hints';
import { propagate } from './solver';
import type { Clue, LandmarkId, Placement } from './types';

// Thistle Reach from the server fixture (copied, not imported): solvable by propagation alone.
const PUZZLE: { land: string; landmarks: LandmarkId[]; clues: Clue[] } = {
  land: maskFromRows(['..LLL.', '.LLLLL', 'LLLLL.', '.LLL..', '.LLL..', '..L...']),
  landmarks: ['lighthouse', 'windmill', 'harbor', 'fort', 'temple', 'well', 'farm'],
  clues: [
    { type: 'shore', a: 'lighthouse', dir: 'N' },
    { type: 'shore', a: 'lighthouse', dir: 'S' },
    { type: 'touches', a: 'well', b: 'lighthouse' },
    { type: 'due', a: 'harbor', dir: 'S', b: 'well' },
    { type: 'due', a: 'farm', dir: 'S', b: 'harbor' },
    { type: 'touches', a: 'temple', b: 'harbor' },
    { type: 'due', a: 'windmill', dir: 'N', b: 'temple' },
    { type: 'shore', a: 'windmill', dir: 'N' },
    { type: 'shore', a: 'fort', dir: 'E' },
    { type: 'shares', a: 'fort', axis: 'row', b: 'windmill' },
  ],
};

const solved = propagate(PUZZLE);
if (solved.status !== 'solved') throw new Error('fixture must solve by propagation');
const SOLUTION: Placement = solved.placement;
const cellOf = (id: LandmarkId) => {
  const cell = SOLUTION[id];
  if (!cell) throw new Error(`no solution cell for ${id}`);
  return cell;
};

describe('countHints', () => {
  it('counts the H characters and nothing else', () => {
    expect(countHints('')).toBe(0);
    expect(countHints('PPLP')).toBe(0);
    expect(countHints('PHPLHH')).toBe(3);
  });

  it('exports the limits the client and server share', () => {
    expect(MAX_HINTS).toBe(3);
    expect(HINT_PENALTY_MS).toBe(30_000);
  });
});

describe('computeHint', () => {
  it('names a misplaced landmark and the clues that mention it', () => {
    const wrong: Placement = { lighthouse: cellOf('farm') };
    expect(computeHint(PUZZLE, wrong)).toEqual({
      kind: 'misplaced',
      landmark: 'lighthouse',
      clues: [0, 1, 2],
    });
  });

  it('reports the first misplaced landmark in landmark order', () => {
    const wrong: Placement = { windmill: cellOf('farm'), harbor: cellOf('well') };
    expect(computeHint(PUZZLE, wrong)).toMatchObject({ kind: 'misplaced', landmark: 'windmill' });
  });

  it('with nothing placed, points at the most pinned-down landmark and its cells', () => {
    const hint = computeHint(PUZZLE, {});
    expect(hint.kind).toBe('next');
    if (hint.kind !== 'next') return;
    // Every island solves by propagation, so the first hint already has a single cell.
    expect(hint.cells).toEqual([cellOf(hint.landmark)]);
    expect(hint.clues.length).toBeGreaterThan(0);
    for (const i of hint.clues) {
      const clue = PUZZLE.clues[i];
      expect(JSON.stringify(clue)).toContain(hint.landmark);
    }
  });

  it('only suggests landmarks that are not placed yet, and never contradicts the placements', () => {
    const placed: Placement = {
      lighthouse: cellOf('lighthouse'),
      well: cellOf('well'),
      harbor: cellOf('harbor'),
    };
    const hint = computeHint(PUZZLE, placed);
    expect(hint.kind).toBe('next');
    if (hint.kind !== 'next') return;
    expect(placed[hint.landmark]).toBeUndefined();
    expect(hint.cells).toEqual([cellOf(hint.landmark)]);
  });

  it('answers none when every landmark is placed correctly', () => {
    expect(computeHint(PUZZLE, { ...SOLUTION })).toEqual({ kind: 'none' });
  });

  it('lists several cells when the clues leave a choice', () => {
    // Keep only the lighthouse's own clues: two shores leave more than one cell.
    const loose = { ...PUZZLE, landmarks: ['lighthouse'] as LandmarkId[], clues: PUZZLE.clues.slice(0, 2) };
    const hint = computeHint(loose, {});
    expect(hint.kind).toBe('next');
    if (hint.kind !== 'next') return;
    expect(hint.landmark).toBe('lighthouse');
    expect(hint.cells.length).toBeGreaterThan(1);
    expect(hint.clues).toEqual([0, 1]);
  });
});
