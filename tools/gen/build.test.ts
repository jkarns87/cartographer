import { describe, expect, it } from 'vitest';
import { landCells, maskFromRows } from '../../src/shared/puzzle/grid';
import { clueHolds } from '../../src/shared/puzzle/predicates';
import { countSolutions, propagate } from '../../src/shared/puzzle/solver';
import type {
  Clue,
  LandmarkId,
  Placement,
} from '../../src/shared/puzzle/types';
import {
  buildPuzzle,
  buildPuzzleReport,
  CAPS,
  capProblems,
  clueWeight,
  fixForHumans,
  isNegative,
  REJECT_REASONS,
  isOppositeShorePair,
} from './build';
import type { RejectReason } from './build';
import { clueKey, enumerateTrueClues, impliedPairs, implies } from './clues';
import { growIsland, isAcceptableIsland, islandProblem } from './island';
import { islandName, NAME_ADJECTIVES, NAME_NOUNS } from './names';
import { hashSeed, mulberry32 } from './rng';
import { verifySchedule } from './verify';

// 19 cells, no full line, no lake, one inland cell at (2,2).
const GOOD = maskFromRows([
  '.LL...',
  '.LLLL.',
  'LLLLL.',
  '.LLLLL',
  '..LL..',
  '...L..',
]);

describe('rng', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    const first = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(first);
    for (const x of first) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(2).next()).not.toBe(first[0]);
  });

  it('int stays in range and shuffle is a permutation that leaves its input alone', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 500; i++) {
      const n = rng.int(6);
      expect(Number.isInteger(n) && n >= 0 && n < 6).toBe(true);
    }
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = rng.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(() => rng.pick([])).toThrow();
  });

  it('hashSeed is a deterministic uint32 that differs by index and master', () => {
    expect(hashSeed(7, 3)).toBe(hashSeed(7, 3));
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const h = hashSeed(7, i);
      expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
      seen.add(h);
    }
    expect(seen.size).toBe(1000);
    expect(hashSeed(8, 3)).not.toBe(hashSeed(7, 3));
  });
});

describe('island', () => {
  it('growIsland yields an acceptable island within 20 tries for seeds 1..20', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = mulberry32(seed);
      let found: string | null = null;
      for (let i = 0; i < 20 && found === null; i++) {
        const grown = growIsland(rng, 18 + rng.int(5));
        if (isAcceptableIsland(grown)) found = grown;
      }
      expect(found, `seed ${seed}`).not.toBeNull();
    }
  });

  it('growIsland grows exactly the target number of cells', () => {
    const rng = mulberry32(5);
    for (const target of [18, 20, 22]) {
      expect(landCells(growIsland(rng, target))).toHaveLength(target);
    }
  });

  it('accepts a varied island', () => {
    expect(islandProblem(GOOD)).toBeNull();
    expect(isAcceptableIsland(GOOD)).toBe(true);
  });

  it.each([
    [
      'a full row',
      ['..LL..', '.LLLL.', 'LLLLLL', '.LLLL.', '..LL..', '......'],
      /row 2/,
    ],
    [
      'a full column',
      ['..L...', '.LLLL.', '.LLLL.', '.LLLL.', '.LLLL.', '..L...'],
      /column 2/,
    ],
    [
      'a lake',
      ['.LLLL.', '.L.LL.', '.LLLL.', '.LLLL.', '.LLLL.', '......'],
      /lake/,
    ],
    [
      'a rectangle',
      ['......', '.LLLLL', '.LLLLL', '.LLLLL', '.LLLLL', '......'],
      /rows have a northern/,
    ],
    [
      'too few cells',
      ['......', '.LLLL.', '.LLLL.', '.LLLL.', '.L....', '......'],
      /land cells/,
    ],
    [
      'no inland cell',
      ['LLLLL.', 'L.....', 'LLLLL.', '....L.', 'LLLLL.', 'L.....'],
      /inland/,
    ],
    [
      'two pieces',
      ['LLL...', 'LLL...', 'LLL..L', '...LLL', '...LLL', '...LLL'],
      /connected/,
    ],
  ])('rejects %s', (_label, rows, reason) => {
    expect(islandProblem(maskFromRows(rows))).toMatch(reason);
  });
});

describe('enumerateTrueClues', () => {
  const landmarks: LandmarkId[] = ['lighthouse', 'windmill', 'harbor'];
  const solution: Placement = {
    lighthouse: { r: 1, c: 1 },
    windmill: { r: 1, c: 4 },
    harbor: { r: 3, c: 1 },
  };
  const clues = enumerateTrueClues(GOOD, landmarks, solution);

  it('contains the expected due clues in both orientations', () => {
    expect(clues).toContainEqual({
      type: 'due',
      a: 'windmill',
      dir: 'E',
      b: 'lighthouse',
    });
    expect(clues).toContainEqual({
      type: 'due',
      a: 'lighthouse',
      dir: 'W',
      b: 'windmill',
    });
    expect(clues).toContainEqual({
      type: 'due',
      a: 'harbor',
      dir: 'S',
      b: 'lighthouse',
    });
    expect(clues).toContainEqual({
      type: 'shares',
      a: 'harbor',
      axis: 'row',
      b: 'windmill',
      not: true,
    });
    expect(clues).toContainEqual({ type: 'extreme', a: 'windmill', dir: 'E' });
  });

  it('never contains a false clue', () => {
    expect(clues.length).toBeGreaterThan(20);
    for (const clue of clues) {
      expect(
        clueHolds(clue, solution, GOOD, landmarks),
        JSON.stringify(clue)
      ).toBe(true);
    }
  });

  it('omits the false and the impossible', () => {
    expect(clues).not.toContainEqual({
      type: 'due',
      a: 'windmill',
      dir: 'W',
      b: 'lighthouse',
    });
    expect(clues.some((c) => c.type === 'between')).toBe(false);
    expect(clues.some((c) => c.type === 'touches' && !c.not)).toBe(false);
  });
});

describe('clue equivalence and implication', () => {
  const due: Clue = { type: 'due', a: 'fort', dir: 'E', b: 'well' };

  it('keys equivalent phrasings the same', () => {
    expect(clueKey(due)).toBe(
      clueKey({ type: 'due', a: 'well', dir: 'W', b: 'fort' })
    );
    expect(clueKey({ type: 'touches', a: 'fort', b: 'well' })).toBe(
      clueKey({ type: 'touches', a: 'well', b: 'fort' })
    );
    expect(clueKey({ type: 'touches', a: 'fort', b: 'well' })).not.toBe(
      clueKey({ type: 'touches', a: 'well', b: 'fort', not: true })
    );
    expect(clueKey({ type: 'between', a: 'mine', b: 'fort', c: 'well' })).toBe(
      clueKey({ type: 'between', a: 'mine', b: 'well', c: 'fort' })
    );
    expect(
      clueKey({ type: 'between', a: 'mine', b: 'fort', c: 'well' })
    ).not.toBe(clueKey({ type: 'between', a: 'fort', b: 'mine', c: 'well' }));
  });

  it('drops the weaker clue of an implied pair', () => {
    expect(
      implies(due, { type: 'somewhere', a: 'fort', dir: 'E', b: 'well' })
    ).toBe(true);
    expect(
      implies(due, { type: 'somewhere', a: 'well', dir: 'W', b: 'fort' })
    ).toBe(true);
    expect(
      implies(due, { type: 'shares', a: 'well', axis: 'row', b: 'fort' })
    ).toBe(true);
    expect(
      implies(due, {
        type: 'shares',
        a: 'fort',
        axis: 'column',
        b: 'well',
        not: true,
      })
    ).toBe(true);
    expect(
      implies(
        { type: 'somewhere', a: 'fort', dir: 'N', b: 'well' },
        { type: 'shares', a: 'fort', axis: 'row', b: 'well', not: true }
      )
    ).toBe(true);
    expect(
      implies(
        { type: 'shares', a: 'fort', axis: 'row', b: 'well' },
        { type: 'shares', a: 'fort', axis: 'column', b: 'well', not: true }
      )
    ).toBe(true);
    expect(
      implies({ type: 'somewhere', a: 'fort', dir: 'E', b: 'well' }, due)
    ).toBe(false);
    expect(
      implies(due, { type: 'somewhere', a: 'fort', dir: 'E', b: 'mine' })
    ).toBe(false);
    expect(
      impliedPairs([due, { type: 'due', a: 'well', dir: 'W', b: 'fort' }])
    ).toHaveLength(2);
  });
});

describe('names', () => {
  it('uses two word lists of at least 24 entries each', () => {
    expect(NAME_ADJECTIVES.length).toBeGreaterThanOrEqual(24);
    expect(NAME_NOUNS.length).toBeGreaterThanOrEqual(24);
    expect(islandName(mulberry32(4))).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(islandName(mulberry32(4))).toBe(islandName(mulberry32(4)));
  });
});

// Copied from solver.test.ts: 9 landmarks on 22 cells, unique, but propagation alone stalls.
const ISLAND_22 = maskFromRows([
  '.LLLL.',
  'LLLLLL',
  'LLLL.L',
  '.LLLLL',
  '..LL..',
  '......',
]);
const EXPEDITION_LANDMARKS: LandmarkId[] = [
  'well',
  'windmill',
  'temple',
  'shipwreck',
  'beacon',
  'farm',
  'mine',
  'watchtower',
  'cave',
];
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
const EXPEDITION_CLUES: Clue[] = [
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
];

describe('opposite shore clues', () => {
  const beaconE: Clue = { type: 'shore', a: 'beacon', dir: 'E' };
  const beaconW: Clue = { type: 'shore', a: 'beacon', dir: 'W' };
  const beaconN: Clue = { type: 'shore', a: 'beacon', dir: 'N' };
  const fortE: Clue = { type: 'shore', a: 'fort', dir: 'E' };

  it('recognizes only the same landmark with opposite directions', () => {
    expect(isOppositeShorePair(beaconE, beaconW)).toBe(true);
    expect(isOppositeShorePair(beaconW, beaconE)).toBe(true);
    expect(isOppositeShorePair(beaconE, beaconN)).toBe(false);
    expect(isOppositeShorePair(beaconE, fortE)).toBe(false);
  });

  it('is a cap problem on a finished sheet', () => {
    const base: Clue[] = [
      { type: 'inland', a: 'fort' },
      { type: 'due', a: 'fort', dir: 'W', b: 'beacon' },
      beaconE,
      beaconN,
      { type: 'somewhere', a: 'temple', dir: 'S', b: 'fort' },
      { type: 'touches', a: 'temple', b: 'well' },
      { type: 'shares', a: 'well', axis: 'row', b: 'cave' },
    ];
    const landmarks: LandmarkId[] = [
      'fort',
      'beacon',
      'temple',
      'well',
      'cave',
    ];
    expect(capProblems(base, landmarks)).toEqual([]);
    expect(capProblems([...base, beaconW], landmarks)).toEqual([
      { reason: 'caps', message: 'opposite shore clues on beacon' },
    ]);
  });
});

describe('fixForHumans', () => {
  const ctx = { land: ISLAND_22, landmarks: EXPEDITION_LANDMARKS };
  const puzzle = { ...ctx, clues: EXPEDITION_CLUES };
  const pool = enumerateTrueClues(
    ISLAND_22,
    EXPEDITION_LANDMARKS,
    EXPEDITION_SOLUTION
  );

  it('adds a clue to a unique sheet the human solver is stuck on, keeping it unique', () => {
    expect(propagate(puzzle).status).toBe('stuck');
    expect(countSolutions(puzzle).count).toBe(1);

    const fixed = fixForHumans(mulberry32(1), ctx, [...EXPEDITION_CLUES], pool);
    expect(fixed).not.toBeNull();
    if (!fixed) return;
    const before = new Set(EXPEDITION_CLUES.map(clueKey));
    const added = fixed.filter((c) => !before.has(clueKey(c)));
    expect(added.length).toBeGreaterThan(0);
    for (const clue of fixed) {
      expect(
        clueHolds(clue, EXPEDITION_SOLUTION, ISLAND_22, EXPEDITION_LANDMARKS)
      ).toBe(true);
    }
    expect(propagate({ ...ctx, clues: fixed }).status).toBe('solved');
    const count = countSolutions({ ...ctx, clues: fixed });
    expect(count.count).toBe(1);
    expect(count.capped).toBe(false);
  });

  it('returns a solvable sheet untouched and gives up when no clue helps', () => {
    const solvable = [...EXPEDITION_CLUES, ...pool];
    expect(fixForHumans(mulberry32(1), ctx, solvable, pool)).toBe(solvable);
    expect(
      fixForHumans(mulberry32(1), ctx, [...EXPEDITION_CLUES], [])
    ).toBeNull();
  });
});

describe('buildPuzzle', () => {
  it('builds a unique, human-solvable 7-landmark island within the caps', () => {
    const entry = buildPuzzle(1, {
      landmarkCount: 7,
      number: 0,
      date: null,
      id: 'seed-1',
    });
    expect(entry).not.toBeNull();
    if (!entry) return;
    const count = countSolutions(entry);
    expect(count.count).toBe(1);
    expect(count.capped).toBe(false);
    expect(propagate(entry).status).toBe('solved');
    expect(entry.landmarks).toHaveLength(7);
    expect(entry.clues.length).toBeGreaterThanOrEqual(CAPS.minClues);
    expect(entry.clues.length).toBeLessThanOrEqual(CAPS.maxClues);
    expect(entry.clues.filter(isNegative).length).toBeLessThanOrEqual(
      CAPS.maxNegatives
    );
    expect(
      entry.clues.filter((c) => c.type === 'between').length
    ).toBeLessThanOrEqual(CAPS.maxBetween);
    expect(
      entry.clues.filter((c) => c.type === 'extreme').length
    ).toBeLessThanOrEqual(CAPS.maxExtreme);
    expect(capProblems(entry.clues, entry.landmarks)).toEqual([]);
    expect(new Set(entry.clues.map(clueKey)).size).toBe(entry.clues.length);
    expect(impliedPairs(entry.clues)).toEqual([]);
    expect(
      buildPuzzle(1, { landmarkCount: 7, number: 0, date: null, id: 'seed-1' })
    ).toEqual(entry);
  });

  it('weighs negatives at 0.5', () => {
    expect(
      clueWeight({ type: 'touches', a: 'fort', b: 'well', not: true })
    ).toBe(0.5);
    expect(clueWeight({ type: 'touches', a: 'fort', b: 'well' })).toBe(2);
    expect(clueWeight({ type: 'due', a: 'fort', dir: 'N', b: 'well' })).toBe(3);
  });

  // The day-5 spike: every built entry must pass the verifier.
  it.each([7, 8, 9])(
    'seeds 1..100 with %i landmarks all verify',
    (landmarkCount) => {
      const rejects: Partial<Record<RejectReason, number>> = {};
      const clueCounts: Record<number, number> = {};
      const difficulty: Record<string, number> = {};
      let attempts = 0;
      let failed = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const report = buildPuzzleReport(seed, {
          landmarkCount,
          number: 0,
          date: null,
          id: `seed-${seed}`,
        });
        attempts += report.attempts;
        for (const reason of REJECT_REASONS) {
          const n = report.rejects[reason];
          if (n) rejects[reason] = (rejects[reason] ?? 0) + n;
        }
        const entry = report.entry;
        if (!entry) {
          failed++;
          continue;
        }
        expect(
          verifySchedule({ version: 1, masterSeed: 0, entries: [entry] }),
          `seed ${seed}`
        ).toEqual([]);
        clueCounts[entry.clues.length] =
          (clueCounts[entry.clues.length] ?? 0) + 1;
        difficulty[entry.difficulty] = (difficulty[entry.difficulty] ?? 0) + 1;
      }
      const rejected = attempts - (100 - failed);
      console.info(
        `[spike] ${landmarkCount} landmarks: ${100 - failed}/100 built, ${attempts} attempts, ${rejected} rejected (${Math.round((rejected / attempts) * 100)}%)`,
        { rejects, clueCounts, difficulty }
      );
      expect(failed).toBe(0);
    },
    180_000
  );
});
