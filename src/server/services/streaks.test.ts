import { describe, expect, it } from 'vitest';
import { makeDeps } from '../fakes';
import { keys } from '../keys';
import {
  applySolve,
  displayStreak,
  isBroken,
  isCounted,
  readStreak,
  streakDeadline,
  tierFor,
  toStreakInfo,
  writeStreak,
} from './streaks';
import type { SolveEvent, StreakState } from './streaks';

const DAY = 24 * 3600 * 1000;
const ZERO: StreakState = {
  current: 0,
  best: 0,
  lastDate: null,
  cleanRun: 0,
  total: 0,
};
const POSTED = Date.UTC(2026, 11, 1, 12);

const event = (over: Partial<SolveEvent> = {}): SolveEvent => ({
  islandDate: '2026-12-01',
  postedAt: POSTED,
  solvedAt: POSTED + 60_000,
  corrections: 0,
  ...over,
});

describe('isCounted', () => {
  it.each([
    ['one minute after posting', event(), true],
    ['exactly 24 h after posting', event({ solvedAt: POSTED + DAY }), true],
    [
      '24 h and 1 ms after posting',
      event({ solvedAt: POSTED + DAY + 1 }),
      false,
    ],
    ['practice island', event({ islandDate: null }), false],
  ])('%s', (_name, e, expected) => {
    expect(isCounted(e)).toBe(expected);
  });
});

describe('applySolve', () => {
  const day2: StreakState = {
    current: 1,
    best: 1,
    lastDate: '2026-12-01',
    cleanRun: 1,
    total: 1,
  };

  it.each<[string, StreakState, SolveEvent, StreakState]>([
    [
      'first counted solve',
      ZERO,
      event(),
      { current: 1, best: 1, lastDate: '2026-12-01', cleanRun: 1, total: 1 },
    ],
    [
      'consecutive day',
      day2,
      event({
        islandDate: '2026-12-02',
        postedAt: POSTED + DAY,
        solvedAt: POSTED + DAY + 1,
      }),
      { current: 2, best: 2, lastDate: '2026-12-02', cleanRun: 2, total: 2 },
    ],
    [
      'gap of two days resets to 1',
      { current: 4, best: 4, lastDate: '2026-12-01', cleanRun: 4, total: 4 },
      event({
        islandDate: '2026-12-03',
        postedAt: POSTED + 2 * DAY,
        solvedAt: POSTED + 2 * DAY,
      }),
      { current: 1, best: 4, lastDate: '2026-12-03', cleanRun: 5, total: 5 },
    ],
    [
      'uncounted (25 h late) only increments total',
      day2,
      event({
        islandDate: '2026-12-02',
        postedAt: POSTED + DAY,
        solvedAt: POSTED + 2 * DAY + 3600_000,
      }),
      { ...day2, total: 2 },
    ],
    [
      'practice island only increments total',
      day2,
      event({ islandDate: null }),
      { ...day2, total: 2 },
    ],
    [
      'corrections reset the clean run',
      { current: 2, best: 2, lastDate: '2026-12-01', cleanRun: 6, total: 2 },
      event({
        islandDate: '2026-12-02',
        postedAt: POSTED + DAY,
        solvedAt: POSTED + DAY,
        corrections: 2,
      }),
      { current: 3, best: 3, lastDate: '2026-12-02', cleanRun: 0, total: 3 },
    ],
    [
      'clean solve restarts the clean run',
      { current: 3, best: 3, lastDate: '2026-12-02', cleanRun: 0, total: 3 },
      event({
        islandDate: '2026-12-03',
        postedAt: POSTED + 2 * DAY,
        solvedAt: POSTED + 2 * DAY,
      }),
      { current: 4, best: 4, lastDate: '2026-12-03', cleanRun: 1, total: 4 },
    ],
    [
      'same island date again only increments total',
      day2,
      event(),
      { ...day2, total: 2 },
    ],
    [
      'an older island never moves the streak backwards',
      { current: 1, best: 1, lastDate: '2026-12-02', cleanRun: 1, total: 1 },
      event({ islandDate: '2026-12-01', solvedAt: POSTED + 1 }),
      { current: 1, best: 1, lastDate: '2026-12-02', cleanRun: 1, total: 2 },
    ],
    [
      'month boundary counts as consecutive',
      { current: 2, best: 2, lastDate: '2026-11-30', cleanRun: 0, total: 2 },
      event(),
      { current: 3, best: 3, lastDate: '2026-12-01', cleanRun: 1, total: 3 },
    ],
    [
      'year boundary counts as consecutive',
      { current: 9, best: 9, lastDate: '2026-12-31', cleanRun: 2, total: 9 },
      event({
        islandDate: '2027-01-01',
        postedAt: Date.UTC(2027, 0, 1, 12),
        solvedAt: Date.UTC(2027, 0, 1, 13),
      }),
      { current: 10, best: 10, lastDate: '2027-01-01', cleanRun: 3, total: 10 },
    ],
    [
      'best is kept when current is lower',
      { current: 1, best: 12, lastDate: '2026-11-30', cleanRun: 0, total: 20 },
      event(),
      { current: 2, best: 12, lastDate: '2026-12-01', cleanRun: 1, total: 21 },
    ],
    [
      'a malformed lastDate is treated as no previous date instead of freezing the streak',
      { current: 4, best: 4, lastDate: 'garbage', cleanRun: 2, total: 4 },
      event(),
      { current: 1, best: 4, lastDate: '2026-12-01', cleanRun: 3, total: 5 },
    ],
    [
      'a partially malformed lastDate (wrong shape) is also repaired',
      { current: 4, best: 4, lastDate: '2026-12-1', cleanRun: 0, total: 4 },
      event({ corrections: 1 }),
      { current: 1, best: 4, lastDate: '2026-12-01', cleanRun: 0, total: 5 },
    ],
  ])('%s', (_name, prev, e, expected) => {
    expect(applySolve(prev, e)).toEqual(expected);
  });

  it('does not mutate the previous state', () => {
    const prev = { ...ZERO };
    applySolve(prev, event());
    expect(prev).toEqual(ZERO);
  });
});

describe('tierFor', () => {
  it.each<[Partial<StreakState>, ReturnType<typeof tierFor>]>([
    [{}, null],
    [{ total: 1, current: 1 }, 'deckhand'],
    [{ total: 5, current: 2 }, 'deckhand'],
    [{ total: 5, current: 3 }, 'navigator'],
    [{ total: 9, current: 6 }, 'navigator'],
    [{ total: 9, current: 7 }, 'cartographer'],
    [{ total: 40, current: 29 }, 'cartographer'],
    [{ total: 40, current: 30 }, 'master'],
    [{ total: 3, current: 0 }, 'deckhand'],
  ])('%o -> %s', (over, expected) => {
    expect(tierFor({ ...ZERO, ...over })).toBe(expected);
  });
});

describe('isBroken / displayStreak', () => {
  const alive: StreakState = {
    current: 5,
    best: 5,
    lastDate: '2026-12-01',
    cleanRun: 2,
    total: 9,
  };
  // The 2026-12-02 island posts at 12:00 UTC; its 24-hour window closes here.
  const deadline = Date.UTC(2026, 11, 3, 12);

  it.each<[string, StreakState, number, boolean]>([
    ['the same afternoon', alive, Date.UTC(2026, 11, 1, 15), false],
    ['the next island just posted', alive, Date.UTC(2026, 11, 2, 12), false],
    ['the last millisecond of the next window', alive, deadline, false],
    ['one millisecond after the next window', alive, deadline + 1, true],
    ['a week later', alive, deadline + 7 * DAY, true],
    ['no streak to break', { ...ZERO, total: 3 }, deadline + DAY, false],
    [
      'a malformed lastDate is left alone',
      { ...alive, lastDate: 'garbage' },
      deadline + DAY,
      false,
    ],
  ])('%s', (_name, s, now, expected) => {
    expect(isBroken(s, now)).toBe(expected);
    expect(displayStreak(s, now)).toEqual(expected ? { ...s, current: 0 } : s);
  });

  it('puts the deadline at the close of the following island window', () => {
    expect(streakDeadline('2026-12-01')).toBe(deadline);
    expect(streakDeadline('2026-12-31')).toBe(Date.UTC(2027, 0, 2, 12));
    expect(streakDeadline('nope')).toBeNaN();
  });
});

describe('toStreakInfo', () => {
  const s: StreakState = {
    current: 8,
    best: 9,
    lastDate: '2026-12-01',
    cleanRun: 7,
    total: 20,
  };
  const sameDay = Date.UTC(2026, 11, 1, 13);

  it('derives tier, steady hand and passes counted through', () => {
    expect(toStreakInfo(s, true, sameDay)).toEqual({
      current: 8,
      best: 9,
      cleanRun: 7,
      total: 20,
      tier: 'cartographer',
      steadyHand: true,
      counted: true,
    });
    expect(toStreakInfo({ ...s, cleanRun: 6 }, false, sameDay)).toMatchObject({
      steadyHand: false,
      counted: false,
    });
  });

  it('shows a lapsed streak as 0 with the tier back at deckhand, keeping best and the clean run', () => {
    expect(toStreakInfo(s, false, Date.UTC(2026, 11, 10))).toEqual({
      current: 0,
      best: 9,
      cleanRun: 7,
      total: 20,
      tier: 'deckhand',
      steadyHand: true,
      counted: false,
    });
  });
});

describe('readStreak / writeStreak', () => {
  it('defaults to zero state', async () => {
    const deps = makeDeps();
    expect(await readStreak(deps, 't2_u1')).toEqual(ZERO);
  });

  it('round trips including a null lastDate', async () => {
    const deps = makeDeps();
    const s: StreakState = {
      current: 3,
      best: 5,
      lastDate: '2026-12-02',
      cleanRun: 1,
      total: 7,
    };
    await writeStreak(deps, 't2_u1', s);
    expect(await readStreak(deps, 't2_u1')).toEqual(s);
    await writeStreak(deps, 't2_u1', { ...s, lastDate: null });
    expect(await readStreak(deps, 't2_u1')).toEqual({ ...s, lastDate: null });
  });

  it('leaves unrelated hash fields alone', async () => {
    const deps = makeDeps();
    await deps.redis.hSet(keys.streak('t2_u1'), { tutorialSeen: '1' });
    await writeStreak(deps, 't2_u1', { ...ZERO, total: 1 });
    expect(await deps.redis.hGet(keys.streak('t2_u1'), 'tutorialSeen')).toBe(
      '1'
    );
  });
});
