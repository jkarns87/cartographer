import { describe, expect, it } from 'vitest';
import { formatSchedule } from './io';
import {
  addDays,
  generatePractice,
  generateSchedule,
  isIsoDate,
  landmarkCountFor,
  practiceId,
  regenerateDay,
  withUniqueName,
} from './schedule';
import { verifySchedule } from './verify';

describe('dates', () => {
  it('ramps landmark count by UTC weekday', () => {
    expect(landmarkCountFor('2026-11-30')).toBe(7); // Monday
    expect(landmarkCountFor('2026-12-01')).toBe(7); // Tuesday
    expect(landmarkCountFor('2026-12-02')).toBe(7); // Wednesday
    expect(landmarkCountFor('2026-12-03')).toBe(8); // Thursday
    expect(landmarkCountFor('2026-12-04')).toBe(8); // Friday
    expect(landmarkCountFor('2026-12-05')).toBe(8); // Saturday
    expect(landmarkCountFor('2026-12-06')).toBe(9); // Sunday
    expect(() => landmarkCountFor('12/06/2026')).toThrow();
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-12-01', 179)).toBe('2027-05-29');
  });

  it('validates ISO dates', () => {
    expect(isIsoDate('2026-12-01')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-1-01')).toBe(false);
  });
});

describe('generateSchedule', () => {
  const opts = { masterSeed: 3, startDate: '2026-12-05', days: 3 };
  const schedule = generateSchedule(opts);

  it('numbers dated islands 1..n with the date as id and the weekday ramp', () => {
    expect(schedule.version).toBe(1);
    expect(schedule.masterSeed).toBe(3);
    expect(
      schedule.entries.map((e) => [e.id, e.date, e.number, e.landmarks.length])
    ).toEqual([
      ['2026-12-05', '2026-12-05', 1, 8],
      ['2026-12-06', '2026-12-06', 2, 9],
      ['2026-12-07', '2026-12-07', 3, 7],
    ]);
    expect(verifySchedule(schedule)).toEqual([]);
  });

  it('is byte-identical for the same seed and differs for another', () => {
    expect(formatSchedule(generateSchedule(opts))).toBe(
      formatSchedule(schedule)
    );
    expect(formatSchedule(schedule).endsWith('}\n')).toBe(true);
    const other = generateSchedule({ ...opts, masterSeed: 4 });
    expect(other.entries[0]?.land).not.toBe(schedule.entries[0]?.land);
  });
});

describe('generatePractice', () => {
  it('builds undated islands numbered 0 whose names avoid the given set', () => {
    const first = generatePractice({ masterSeed: 3, count: 1 });
    const avoid = new Set([first.entries[0]?.name ?? '']);
    const practice = generatePractice({
      masterSeed: 3,
      count: 3,
      avoidNames: avoid,
    });
    expect(practice.entries.map((e) => [e.id, e.number, e.date])).toEqual([
      ['practice-01', 0, null],
      ['practice-02', 0, null],
      ['practice-03', 0, null],
    ]);
    expect(practice.entries.map((e) => e.landmarks.length)).toEqual([7, 7, 8]);
    expect(practice.entries[0]?.land).toBe(first.entries[0]?.land);
    for (const e of practice.entries) expect(avoid.has(e.name)).toBe(false);
    expect(verifySchedule(practice)).toEqual([]);
    expect(practiceId(19)).toBe('practice-20');
  });
});

describe('withUniqueName', () => {
  it('redraws a colliding name deterministically', () => {
    const [entry] = generatePractice({ masterSeed: 5, count: 1 }).entries;
    if (!entry) throw new Error('no entry');
    const taken = new Set([entry.name]);
    const renamed = withUniqueName(entry, taken);
    expect(renamed.name).not.toBe(entry.name);
    expect(taken.has(renamed.name)).toBe(true);
    expect(withUniqueName(entry, new Set([entry.name])).name).toBe(
      renamed.name
    );
    expect(withUniqueName(entry, new Set())).toBe(entry);
  });
});

describe('regenerateDay', () => {
  it('replaces only the requested day, keeping its id, number and date', () => {
    const schedule = generateSchedule({
      masterSeed: 11,
      startDate: '2026-12-01',
      days: 3,
    });
    const next = regenerateDay(schedule, '2026-12-02', 123456);
    expect(next.entries[0]).toBe(schedule.entries[0]);
    expect(next.entries[2]).toBe(schedule.entries[2]);
    const before = schedule.entries[1];
    const after = next.entries[1];
    expect(
      after?.land === before?.land && after?.solution === before?.solution
    ).toBe(false);
    expect([after?.id, after?.number, after?.date, after?.seed]).toEqual([
      '2026-12-02',
      2,
      '2026-12-02',
      123456,
    ]);
    expect(verifySchedule(next)).toEqual([]);
    expect(() => regenerateDay(schedule, '2027-01-01', 1)).toThrow(
      /no dated entry/
    );
  });
});
