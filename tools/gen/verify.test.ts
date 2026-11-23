import { describe, expect, it } from 'vitest';
import type {
  Clue,
  Schedule,
  ScheduleEntry,
} from '../../src/shared/puzzle/types';
import { buildPuzzle } from './build';
import { OPPOSITE } from './clues';
import { PRACTICE_PATH, readSchedule, SCHEDULE_PATH } from './io';
import { addDays } from './schedule';
import { crossFileProblems, verifySchedule } from './verify';

describe('committed puzzle files', () => {
  const schedule = readSchedule(SCHEDULE_PATH);
  const practice = readSchedule(PRACTICE_PATH);

  it('schedule.json holds 180 consecutive days from 2026-12-01', () => {
    expect(schedule.entries).toHaveLength(180);
    schedule.entries.forEach((entry, k) => {
      expect(entry.date).toBe(addDays('2026-12-01', k));
    });
  });

  it('practice.json holds 20 practice islands', () => {
    expect(practice.entries).toHaveLength(20);
  });

  it('schedule.json verifies', () => {
    expect(verifySchedule(schedule)).toEqual([]);
  }, 60_000);

  it('practice.json verifies', () => {
    expect(verifySchedule(practice)).toEqual([]);
  }, 60_000);

  it('ids and names do not repeat across the two files', () => {
    expect(crossFileProblems(schedule, practice)).toEqual([]);
  });
});

describe('verifySchedule catches', () => {
  const dated = (seed: number, date: string, number: number): ScheduleEntry => {
    const entry = buildPuzzle(seed, {
      landmarkCount: 7,
      number,
      date,
      id: date,
    });
    if (!entry) throw new Error(`seed ${seed} built nothing`);
    return entry;
  };
  // 2026-12-01 and 2026-12-02 are a Tuesday and a Wednesday: 7 landmarks each.
  // Fixed names so the 7-day name-word rule cannot trip on whatever the seeds drew.
  const a = { ...dated(21, '2026-12-01', 1), name: 'Amber Atoll' };
  const b = { ...dated(22, '2026-12-02', 2), name: 'Bracken Bank' };
  const wrap = (...entries: ScheduleEntry[]): Schedule => ({
    version: 1,
    masterSeed: 0,
    entries,
  });
  const problemsOf = (...entries: ScheduleEntry[]): string[] =>
    verifySchedule(wrap(...entries)).map((p) => p.problem);

  it('nothing in a good pair', () => {
    expect(problemsOf(a, b)).toEqual([]);
  });

  it('a clue that is false on the solution', () => {
    const [first] = a.landmarks;
    if (!first) throw new Error('no landmarks');
    const cell = a.solution[first];
    const moved = {
      ...a,
      solution: {
        ...a.solution,
        [first]: cell ? { r: cell.r, c: (cell.c + 1) % 6 } : cell,
      },
    };
    expect(problemsOf(moved).length).toBeGreaterThan(0);
  });

  it('a sheet that is no longer unique', () => {
    expect(
      problemsOf({ ...a, clues: a.clues.slice(0, 3) }).some((p) =>
        /solutions|clues </.test(p)
      )
    ).toBe(true);
  });

  it('a restated clue', () => {
    const restate = (c: Clue): Clue | null => {
      if (c.type === 'touches') return { type: 'touches', a: c.b, b: c.a };
      if (c.type === 'due' || c.type === 'somewhere')
        return { type: c.type, a: c.b, dir: OPPOSITE[c.dir], b: c.a };
      return null;
    };
    const restated = a.clues.map(restate).find((c) => c !== null);
    if (!restated) throw new Error('no pair clue to restate');
    expect(
      problemsOf({ ...a, clues: [...a.clues, restated] }).some((p) =>
        /already implies/.test(p)
      )
    ).toBe(true);
  });

  it('a clue that names the same landmark twice', () => {
    const [x, y] = a.landmarks;
    if (!x || !y) throw new Error('no landmarks');
    const selfRef: Clue[] = [
      { type: 'due', a: x, dir: 'E', b: x },
      { type: 'somewhere', a: x, dir: 'N', b: x },
      { type: 'touches', a: x, b: x, not: true },
      { type: 'shares', a: x, axis: 'row', b: x },
      { type: 'between', a: x, b: y, c: x },
    ];
    for (const clue of selfRef) {
      expect(
        problemsOf({ ...a, clues: [...a.clues, clue] }).some((p) =>
          /same landmark twice/.test(p)
        ),
        JSON.stringify(clue)
      ).toBe(true);
    }
  });

  it('a repeated silhouette, within a file and across files', () => {
    expect(
      problemsOf(a, { ...b, land: a.land }).some((p) =>
        /silhouette repeats/.test(p)
      )
    ).toBe(true);
    const practice = {
      ...b,
      id: 'practice-01',
      date: null,
      number: 0,
      land: a.land,
    };
    expect(
      crossFileProblems(wrap(a), wrap(practice)).some((p) =>
        /silhouette/.test(p.problem)
      )
    ).toBe(true);
  });

  it('a name word repeated within seven days', () => {
    expect(
      problemsOf(a, { ...b, name: 'Amber Bank' }).some((p) =>
        /shares "Amber"/.test(p)
      )
    ).toBe(true);
    expect(
      problemsOf(a, { ...b, name: 'Bracken Atoll' }).some((p) =>
        /shares "Atoll"/.test(p)
      )
    ).toBe(true);
    // Seven days apart is outside the window.
    const later = { ...dated(23, '2026-12-08', 2), name: 'Amber Bank' };
    expect(problemsOf(a, later).filter((p) => /shares/.test(p))).toEqual([]);
  });

  it('a wrong difficulty label', () => {
    const wrong = a.difficulty === 'hard' ? 'easy' : 'hard';
    expect(
      problemsOf({ ...a, difficulty: wrong }).some((p) => /difficulty/.test(p))
    ).toBe(true);
  });

  it('duplicate dates, misnumbering and mislabelled practice entries', () => {
    expect(
      problemsOf(a, { ...b, date: a.date, id: a.id, number: 2 }).some((p) =>
        /not unique/.test(p)
      )
    ).toBe(true);
    expect(
      problemsOf({ ...a, number: 2 }, { ...b, number: 1 }).some((p) =>
        /in date order/.test(p)
      )
    ).toBe(true);
    expect(
      problemsOf({ ...a, date: null, number: 4 }).some((p) =>
        /expected 0/.test(p)
      )
    ).toBe(true);
    expect(
      problemsOf({ ...a, name: b.name }, b).some((p) => /name/.test(p))
    ).toBe(true);
  });

  it('an island that breaks the island rules', () => {
    expect(
      problemsOf({ ...a, land: '1'.repeat(36) }).some((p) => /island/.test(p))
    ).toBe(true);
  });
});
