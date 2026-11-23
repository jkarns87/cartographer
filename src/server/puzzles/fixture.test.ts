import { describe, expect, it } from 'vitest';
import { idx, isConnected, isValidMask, landCells, landCount } from '../../shared/puzzle/grid';
import {
  allCluesLit,
  clueLandmarks,
  evaluateClue,
  isSolved,
  validatePlacement,
} from '../../shared/puzzle/predicates';
import { LANDMARKS } from '../../shared/puzzle/types';
import type { Placement, Puzzle, ScheduleEntry } from '../../shared/puzzle/types';
import { FIXTURE_PRACTICE, FIXTURE_SCHEDULE } from './fixture';

/**
 * Small backtracking counter (test-only). Places landmarks in order, pruning
 * as soon as any clue is contradicted. Stops counting at `cap`.
 */
const countSolutions = (puzzle: Puzzle, cap: number): number => {
  const cells = landCells(puzzle.land);
  const placement: Placement = {};
  const used = new Set<number>();
  let count = 0;
  const consistent = (): boolean =>
    puzzle.clues.every(
      (c) => evaluateClue(c, placement, puzzle.land, puzzle.landmarks) !== 'contradicted'
    );
  const rec = (i: number): void => {
    if (count >= cap) return;
    const id = puzzle.landmarks[i];
    if (id === undefined) {
      if (isSolved(puzzle, placement)) count++;
      return;
    }
    for (const cell of cells) {
      const k = idx(cell);
      if (used.has(k)) continue;
      used.add(k);
      placement[id] = cell;
      if (consistent()) rec(i + 1);
      delete placement[id];
      used.delete(k);
    }
  };
  rec(0);
  return count;
};

const ALL: ScheduleEntry[] = [...FIXTURE_SCHEDULE.entries, ...FIXTURE_PRACTICE.entries];

describe('fixture schedules', () => {
  it('has two dated entries and one practice entry', () => {
    expect(FIXTURE_SCHEDULE.version).toBe(1);
    expect(FIXTURE_PRACTICE.version).toBe(1);
    expect(FIXTURE_SCHEDULE.entries.map((e) => e.date)).toEqual(['2026-12-01', '2026-12-02']);
    expect(FIXTURE_SCHEDULE.entries.map((e) => e.number)).toEqual([1, 2]);
    expect(FIXTURE_PRACTICE.entries.map((e) => e.date)).toEqual([null]);
    expect(FIXTURE_PRACTICE.entries.map((e) => e.number)).toEqual([0]);
    expect(new Set(ALL.map((e) => e.id)).size).toBe(ALL.length);
  });

  describe.each(ALL.map((e) => [e.id, e] as const))('%s', (_id, entry) => {
    it('has a valid connected island of 18 to 22 cells', () => {
      expect(isValidMask(entry.land)).toBe(true);
      expect(isConnected(entry.land)).toBe(true);
      expect(landCount(entry.land)).toBeGreaterThanOrEqual(18);
      expect(landCount(entry.land)).toBeLessThanOrEqual(22);
    });

    it('draws 7 distinct landmarks from the pool', () => {
      expect(entry.landmarks).toHaveLength(7);
      expect(new Set(entry.landmarks).size).toBe(7);
      for (const id of entry.landmarks) expect(LANDMARKS).toContain(id);
    });

    it('keeps the clue sheet within the grammar limits', () => {
      expect(entry.clues.length).toBeGreaterThanOrEqual(7);
      expect(entry.clues.length).toBeLessThanOrEqual(11);
      const named = new Set(entry.landmarks);
      for (const clue of entry.clues) {
        for (const id of clueLandmarks(clue)) expect(named.has(id)).toBe(true);
      }
      const negatives = entry.clues.filter(
        (c) => (c.type === 'touches' || c.type === 'shares') && c.not === true
      );
      expect(negatives.length).toBeLessThanOrEqual(2);
      expect(entry.clues.filter((c) => c.type === 'between').length).toBeLessThanOrEqual(2);
      expect(entry.clues.filter((c) => c.type === 'extreme').length).toBeLessThanOrEqual(2);
    });

    it('is solved by its solution with every clue lit', () => {
      expect(validatePlacement(entry, entry.solution)).toEqual({ ok: true });
      expect(allCluesLit(entry, entry.solution)).toBe(true);
      expect(isSolved(entry, entry.solution)).toBe(true);
      for (const clue of entry.clues) {
        expect(evaluateClue(clue, entry.solution, entry.land, entry.landmarks)).toBe('lit');
      }
    });

    it('has exactly one solution', () => {
      expect(countSolutions(entry, 2)).toBe(1);
    });
  });
});
