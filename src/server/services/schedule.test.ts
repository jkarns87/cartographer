import { describe, expect, it } from 'vitest';
import { FIXTURE_PRACTICE, FIXTURE_SCHEDULE } from '../puzzles/fixture';
import { entryForDate, parseEntry, parseSchedule, practiceEntry, utcDate } from './schedule';

const clone = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe('utcDate', () => {
  it('formats the UTC calendar date', () => {
    expect(utcDate(Date.UTC(2026, 11, 1, 23, 59, 59))).toBe('2026-12-01');
    expect(utcDate(Date.UTC(2026, 11, 2, 0, 0, 0))).toBe('2026-12-02');
    expect(utcDate(Date.UTC(2027, 0, 5, 12))).toBe('2027-01-05');
  });
});

describe('entryForDate', () => {
  it('finds dated entries and nothing else', () => {
    expect(entryForDate(FIXTURE_SCHEDULE, '2026-12-02')?.name).toBe('Gull Hollow');
    expect(entryForDate(FIXTURE_SCHEDULE, '2026-12-03')).toBeUndefined();
  });
});

describe('practiceEntry', () => {
  it('wraps the index modulo the pool size', () => {
    expect(practiceEntry(FIXTURE_PRACTICE, 0)?.name).toBe('Ember Shoal');
    expect(practiceEntry(FIXTURE_PRACTICE, 1)?.name).toBe('Ember Shoal');
    expect(practiceEntry(FIXTURE_PRACTICE, -1)?.name).toBe('Ember Shoal');
    expect(practiceEntry({ version: 1, masterSeed: 0, entries: [] }, 0)).toBeUndefined();
  });
});

describe('parseSchedule', () => {
  it('round trips the fixture through JSON', () => {
    expect(parseSchedule(clone(FIXTURE_SCHEDULE), 'schedule')).toEqual(FIXTURE_SCHEDULE);
    expect(parseSchedule(clone(FIXTURE_PRACTICE), 'practice')).toEqual(FIXTURE_PRACTICE);
  });

  it('accepts an empty schedule', () => {
    expect(parseSchedule({ version: 1, masterSeed: 0, entries: [] }, 'x')).toEqual({
      version: 1,
      masterSeed: 0,
      entries: [],
    });
  });

  it.each<[string, (raw: Record<string, unknown>) => void]>([
    ['wrong version', (raw) => (raw.version = 2)],
    ['entries not an array', (raw) => (raw.entries = {})],
    ['missing masterSeed', (raw) => delete raw.masterSeed],
  ])('rejects %s', (_name, mutate) => {
    const raw = { version: 1, masterSeed: 0, entries: [] };
    mutate(raw);
    expect(() => parseSchedule(raw, 'x')).toThrow();
  });
});

describe('parseEntry', () => {
  const base = (): Record<string, unknown> => {
    const raw = clone(FIXTURE_SCHEDULE.entries[0]);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('bad clone');
    return { ...raw };
  };

  it('round trips the fixture entry', () => {
    expect(parseEntry(base(), 'e')).toEqual(FIXTURE_SCHEDULE.entries[0]);
  });

  it('keeps negated clues and drops absent flags', () => {
    const raw = base();
    raw.clues = [
      { type: 'touches', a: 'well', b: 'fort', not: true },
      { type: 'shares', a: 'well', axis: 'column', b: 'fort' },
    ];
    expect(parseEntry(raw, 'e').clues).toEqual([
      { type: 'touches', a: 'well', b: 'fort', not: true },
      { type: 'shares', a: 'well', axis: 'column', b: 'fort' },
    ]);
  });

  it.each<[string, (raw: Record<string, unknown>) => void]>([
    ['unknown clue type', (raw) => (raw.clues = [{ type: 'near', a: 'well', b: 'fort' }])],
    ['unknown landmark in a clue', (raw) => (raw.clues = [{ type: 'inland', a: 'castle' }])],
    ['bad direction', (raw) => (raw.clues = [{ type: 'shore', a: 'well', dir: 'NE' }])],
    ['bad axis', (raw) => (raw.clues = [{ type: 'shares', a: 'well', axis: 'diag', b: 'fort' }])],
    ['unknown landmark in the draw', (raw) => (raw.landmarks = ['well', 'castle'])],
    ['duplicate landmark in the draw', (raw) => (raw.landmarks = ['well', 'well'])],
    ['bad mask length', (raw) => (raw.land = '1010')],
    ['bad mask characters', (raw) => (raw.land = 'x'.repeat(36))],
    ['bad difficulty', (raw) => (raw.difficulty = 'brutal')],
    ['bad date', (raw) => (raw.date = '12/01/2026')],
    ['missing date', (raw) => delete raw.date],
    ['non-integer number', (raw) => (raw.number = 1.5)],
    ['solution missing a landmark', (raw) => (raw.solution = { well: { r: 0, c: 0 } })],
    [
      'solution with an unknown landmark',
      (raw) => {
        const s = clone(FIXTURE_SCHEDULE.entries[0]?.solution);
        if (typeof s !== 'object' || s === null) throw new Error('bad clone');
        raw.solution = { ...s, castle: { r: 0, c: 0 } };
      },
    ],
    [
      'solution cell off grid',
      (raw) => {
        const s = clone(FIXTURE_SCHEDULE.entries[0]?.solution);
        if (typeof s !== 'object' || s === null) throw new Error('bad clone');
        raw.solution = { ...s, well: { r: 6, c: 0 } };
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const raw = base();
    mutate(raw);
    expect(() => parseEntry(raw, 'e')).toThrow();
  });
});
