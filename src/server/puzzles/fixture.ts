import { maskFromRows } from '../../shared/puzzle/grid';
import type { Schedule, ScheduleEntry } from '../../shared/puzzle/types';

/**
 * Hand-built schedules for tests. Every entry is a genuinely valid puzzle with
 * a unique solution (verified by `fixture.test.ts`). Tests never read the
 * generated JSON files.
 */

const THISTLE_REACH: ScheduleEntry = {
  id: 'fx-2026-12-01',
  number: 1,
  name: 'Thistle Reach',
  difficulty: 'easy',
  date: '2026-12-01',
  seed: 1,
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
  solution: {
    lighthouse: { r: 2, c: 0 },
    well: { r: 2, c: 1 },
    harbor: { r: 3, c: 1 },
    farm: { r: 4, c: 1 },
    temple: { r: 3, c: 2 },
    windmill: { r: 0, c: 2 },
    fort: { r: 0, c: 4 },
  },
};

const GULL_HOLLOW: ScheduleEntry = {
  id: 'fx-2026-12-02',
  number: 2,
  name: 'Gull Hollow',
  difficulty: 'medium',
  date: '2026-12-02',
  seed: 2,
  land: maskFromRows(['..LL..', '.LLLL.', 'LLLLLL', '.LLLL.', '..LLL.', '...L..']),
  landmarks: ['cave', 'shipwreck', 'watchtower', 'camp', 'mine', 'ruins', 'beacon'],
  clues: [
    { type: 'shore', a: 'beacon', dir: 'E' },
    { type: 'shore', a: 'beacon', dir: 'W' },
    { type: 'touches', a: 'mine', b: 'beacon' },
    { type: 'due', a: 'ruins', dir: 'W', b: 'mine' },
    { type: 'due', a: 'camp', dir: 'E', b: 'mine' },
    { type: 'touches', a: 'watchtower', b: 'ruins' },
    { type: 'touches', a: 'cave', b: 'camp' },
    { type: 'between', a: 'shipwreck', b: 'cave', c: 'watchtower' },
  ],
  solution: {
    beacon: { r: 5, c: 3 },
    mine: { r: 4, c: 3 },
    ruins: { r: 4, c: 2 },
    camp: { r: 4, c: 4 },
    watchtower: { r: 3, c: 2 },
    cave: { r: 3, c: 4 },
    shipwreck: { r: 3, c: 3 },
  },
};

const EMBER_SHOAL: ScheduleEntry = {
  id: 'fx-practice-1',
  number: 0,
  name: 'Ember Shoal',
  difficulty: 'easy',
  date: null,
  seed: 3,
  land: maskFromRows(['.LL...', '.LLLL.', '.LLLL.', 'LLLLLL', '..LLL.', '...L..']),
  landmarks: ['lighthouse', 'harbor', 'temple', 'cave', 'farm', 'camp', 'beacon'],
  clues: [
    { type: 'shore', a: 'lighthouse', dir: 'N' },
    { type: 'shore', a: 'lighthouse', dir: 'S' },
    { type: 'touches', a: 'harbor', b: 'lighthouse' },
    { type: 'due', a: 'temple', dir: 'N', b: 'harbor' },
    { type: 'shore', a: 'temple', dir: 'N' },
    { type: 'due', a: 'cave', dir: 'E', b: 'temple' },
    { type: 'due', a: 'farm', dir: 'S', b: 'cave' },
    { type: 'shore', a: 'farm', dir: 'S' },
    { type: 'between', a: 'camp', b: 'farm', c: 'beacon' },
    { type: 'shore', a: 'beacon', dir: 'E' },
  ],
  solution: {
    lighthouse: { r: 3, c: 0 },
    harbor: { r: 3, c: 1 },
    temple: { r: 0, c: 1 },
    cave: { r: 0, c: 2 },
    farm: { r: 4, c: 2 },
    camp: { r: 4, c: 3 },
    beacon: { r: 4, c: 4 },
  },
};

export const FIXTURE_SCHEDULE: Schedule = {
  version: 1,
  masterSeed: 1001,
  entries: [THISTLE_REACH, GULL_HOLLOW],
};

export const FIXTURE_PRACTICE: Schedule = {
  version: 1,
  masterSeed: 1002,
  entries: [EMBER_SHOAL],
};
