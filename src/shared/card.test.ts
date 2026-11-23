import { describe, expect, it } from 'vitest';

import { cardTime, chartCardText, MAX_CARD_PINS } from './card';
import type { ChartCardOpts } from './card';

const BASE: ChartCardOpts = {
  number: 12,
  name: 'Thistle Reach',
  history: 'PPPLPPPPP',
  elapsedMs: 252_000,
  corrections: 1,
  streakCurrent: 7,
  practice: false,
};

const card = (overrides: Partial<ChartCardOpts> = {}): string =>
  chartCardText({ ...BASE, ...overrides });

describe('chartCardText', () => {
  it('renders the spec example: title, pins with lift, m:ss time, streak line', () => {
    expect(card()).toBe('Cartographer #12 · Thistle Reach\n📍📍📍↩📍📍📍📍📍  4:12\n7-day streak');
  });

  it('says Clean chart when there were no corrections on a one-day streak', () => {
    expect(card({ history: 'PPPPPPP', corrections: 0, streakCurrent: 1, elapsedMs: 61_500 })).toBe(
      'Cartographer #12 · Thistle Reach\n📍📍📍📍📍📍📍  1:01\nClean chart'
    );
  });

  it('says Clean chart when there were no corrections and no counted streak', () => {
    expect(card({ history: 'PPPPPPP', corrections: 0, streakCurrent: 0 })).toBe(
      'Cartographer #12 · Thistle Reach\n📍📍📍📍📍📍📍  4:12\nClean chart'
    );
  });

  it('keeps the streak line for a clean chart on a longer streak', () => {
    expect(card({ history: 'PPPPPPP', corrections: 0, streakCurrent: 2 })).toBe(
      'Cartographer #12 · Thistle Reach\n📍📍📍📍📍📍📍  4:12\n2-day streak'
    );
  });

  it('uses the streak line on day one when there were corrections', () => {
    expect(card({ corrections: 3, streakCurrent: 1 })).toBe(
      'Cartographer #12 · Thistle Reach\n📍📍📍↩📍📍📍📍📍  4:12\n1-day streak'
    );
  });

  it('follows the stated rule literally for an uncounted streak with corrections', () => {
    expect(card({ corrections: 2, streakCurrent: 0 })).toBe(
      'Cartographer #12 · Thistle Reach\n📍📍📍↩📍📍📍📍📍  4:12\n0-day streak'
    );
  });

  it('renders practice islands with the practice title and no third line', () => {
    expect(card({ practice: true, number: 0, name: 'Gull Hollow', corrections: 0, streakCurrent: 1 })).toBe(
      'Cartographer practice · Gull Hollow\n📍📍📍↩📍📍📍📍📍  4:12'
    );
    expect(card({ practice: true, number: 0, name: 'Gull Hollow', streakCurrent: 9 })).toBe(
      'Cartographer practice · Gull Hollow\n📍📍📍↩📍📍📍📍📍  4:12'
    );
  });

  it('shows exactly 24 symbols without an ellipsis', () => {
    const history = 'PL'.repeat(12);
    expect(card({ history })).toBe(
      `Cartographer #12 · Thistle Reach\n${'📍↩'.repeat(12)}  4:12\n7-day streak`
    );
  });

  it('truncates past 24 symbols and appends an ellipsis', () => {
    const history = 'PPPPPPPPPPPPPPPPPPPPPPPPL';
    expect(history).toHaveLength(MAX_CARD_PINS + 1);
    expect(card({ history })).toBe(
      `Cartographer #12 · Thistle Reach\n${'📍'.repeat(24)}…  4:12\n7-day streak`
    );
    expect(card({ history: `${'PL'.repeat(20)}P` })).toBe(
      `Cartographer #12 · Thistle Reach\n${'📍↩'.repeat(12)}…  4:12\n7-day streak`
    );
  });

  it('ignores characters other than P and L in the history', () => {
    expect(card({ history: 'PxP L\nP' })).toBe(
      'Cartographer #12 · Thistle Reach\n📍📍↩📍  4:12\n7-day streak'
    );
  });

  it('drops the pin gap when the history is empty', () => {
    expect(card({ history: '' })).toBe('Cartographer #12 · Thistle Reach\n4:12\n7-day streak');
  });

  it('formats long solves as m:ss with minutes past an hour', () => {
    expect(card({ elapsedMs: 3_725_999 })).toBe(
      'Cartographer #12 · Thistle Reach\n📍📍📍↩📍📍📍📍📍  62:05\n7-day streak'
    );
  });
});

describe('cardTime', () => {
  it('floors to whole seconds and pads seconds', () => {
    expect(cardTime(0)).toBe('0:00');
    expect(cardTime(9_999)).toBe('0:09');
    expect(cardTime(60_000)).toBe('1:00');
    expect(cardTime(252_000)).toBe('4:12');
  });

  it('renders negative and non-finite input as 0:00', () => {
    expect(cardTime(-5)).toBe('0:00');
    expect(cardTime(Number.NaN)).toBe('0:00');
    expect(cardTime(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});
