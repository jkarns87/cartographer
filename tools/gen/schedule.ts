import type { Schedule, ScheduleEntry } from '../../src/shared/puzzle/types';
import { buildPuzzleReport, MAX_ATTEMPTS } from './build';
import type { BuildOptions, BuildReport } from './build';
import { islandName } from './names';
import { hashSeed, mulberry32 } from './rng';

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRACTICE_SALT = 0x70726163; // "prac"
const NAME_SALT = 0x6e616d65; // "name"
const MAX_NAME_DRAWS = 10_000;
const MASK_SALT = 0x6d61736b; // "mask"
const MAX_MASK_REBUILDS = 50;

/** Landmark counts the practice pool cycles through: mostly weekday sizes, one Expedition. */
export const PRACTICE_COUNTS = [7, 7, 8, 8, 9] as const;

const parseDate = (date: string): number => {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!DATE_RE.test(date) || Number.isNaN(ms))
    throw new Error(`"${date}" is not a YYYY-MM-DD date`);
  return ms;
};

export const isIsoDate = (date: string): boolean => {
  if (!DATE_RE.test(date)) return false;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === date;
};

export const addDays = (date: string, days: number): string =>
  new Date(parseDate(date) + days * DAY_MS).toISOString().slice(0, 10);

/** Weekly ramp by UTC weekday: Monday to Wednesday 7, Thursday to Saturday 8, Sunday 9. */
export const landmarkCountFor = (date: string): number => {
  const weekday = new Date(parseDate(date)).getUTCDay();
  if (weekday === 0) return 9;
  if (weekday >= 4) return 8;
  return 7;
};

export const daySeed = (masterSeed: number, index: number): number =>
  hashSeed(masterSeed, index);

export const practiceSeed = (masterSeed: number, index: number): number =>
  hashSeed(hashSeed(masterSeed, PRACTICE_SALT), index);

export const practiceId = (index: number): string =>
  `practice-${String(index + 1).padStart(2, '0')}`;

export type BuildListener = (report: BuildReport, opts: BuildOptions) => void;

const mustBuild = (
  seed: number,
  opts: BuildOptions,
  onBuild?: BuildListener
): ScheduleEntry => {
  const report = buildPuzzleReport(seed, opts);
  onBuild?.(report, opts);
  if (!report.entry) {
    throw new Error(
      `no acceptable island for ${opts.id} (seed ${seed}) after ${MAX_ATTEMPTS} attempts`
    );
  }
  return report.entry;
};

/**
 * Dated islands within this many consecutive days never share an adjective or a noun
 * ("Kelp Rise" on Monday rules out "Kelp ..." and "... Rise" until the next Monday).
 */
export const NAME_WINDOW_DAYS = 7;

/** The adjective and the noun of a two-word island name. */
export const nameWords = (name: string): [string, string] => {
  const [adjective = '', noun = ''] = name.split(' ');
  return [adjective, noun];
};

/**
 * Keep island names unique, and free of any word in `forbiddenWords` (adjectives and nouns come
 * from disjoint lists, so one set serves both): on a clash, redraw deterministically from the
 * entry's seed. Adds the final name to `taken`.
 */
export const withUniqueName = (
  entry: ScheduleEntry,
  taken: Set<string>,
  forbiddenWords: ReadonlySet<string> = new Set()
): ScheduleEntry => {
  const clashes = (candidate: string): boolean =>
    taken.has(candidate) ||
    nameWords(candidate).some((word) => forbiddenWords.has(word));
  let name = entry.name;
  for (let k = 1; clashes(name); k++) {
    if (k > MAX_NAME_DRAWS)
      throw new Error(`ran out of island names for ${entry.id}`);
    name = islandName(mulberry32(hashSeed(entry.seed ^ NAME_SALT, k)));
  }
  taken.add(name);
  return name === entry.name ? entry : { ...entry, name };
};

/**
 * Build from `seed`; while the silhouette (land mask) is already in `takenMasks`, rebuild from
 * seeds derived from it. The entry's stored seed is the one that built it. Adds its mask.
 */
const buildDistinct = (
  seed: number,
  opts: BuildOptions,
  takenMasks: Set<string>,
  onBuild?: BuildListener
): ScheduleEntry => {
  let entry = mustBuild(seed, opts, onBuild);
  for (let k = 1; takenMasks.has(entry.land); k++) {
    if (k > MAX_MASK_REBUILDS)
      throw new Error(`no fresh silhouette for ${opts.id} (seed ${seed})`);
    entry = mustBuild(hashSeed(seed ^ MASK_SALT, k), opts, onBuild);
  }
  takenMasks.add(entry.land);
  return entry;
};

/** Words of the dated names within `NAME_WINDOW_DAYS` of `date` (either side), except `date`. */
const nearbyWords = (
  entries: readonly ScheduleEntry[],
  date: string
): Set<string> => {
  const at = parseDate(date);
  const words = new Set<string>();
  for (const e of entries) {
    if (e.date === null || e.date === date) continue;
    const gap = Math.abs(parseDate(e.date) - at) / DAY_MS;
    if (gap < NAME_WINDOW_DAYS) {
      for (const word of nameWords(e.name)) words.add(word);
    }
  }
  return words;
};

export type ScheduleOptions = {
  masterSeed: number;
  startDate: string;
  days: number;
  onBuild?: BuildListener;
};

/**
 * Dated islands from `startDate`, numbered 1..days, with distinct silhouettes, unique names and no
 * name word repeated within `NAME_WINDOW_DAYS`. Throws if any day cannot be built.
 */
export const generateSchedule = (opts: ScheduleOptions): Schedule => {
  const taken = new Set<string>();
  const takenMasks = new Set<string>();
  const entries: ScheduleEntry[] = [];
  for (let i = 0; i < opts.days; i++) {
    const date = addDays(opts.startDate, i);
    const built = buildDistinct(
      daySeed(opts.masterSeed, i),
      { landmarkCount: landmarkCountFor(date), number: i + 1, date, id: date },
      takenMasks,
      opts.onBuild
    );
    entries.push(withUniqueName(built, taken, nearbyWords(entries, date)));
  }
  return { version: 1, masterSeed: opts.masterSeed, entries };
};

export type PracticeOptions = {
  masterSeed: number;
  count: number;
  /** Names already used (by the dated schedule); practice names avoid them. */
  avoidNames?: ReadonlySet<string>;
  /** Silhouettes already used (by the dated schedule); practice islands avoid them. */
  avoidMasks?: ReadonlySet<string>;
  onBuild?: BuildListener;
};

/** Undated practice islands: number 0, date null, ids practice-01, practice-02, ... */
export const generatePractice = (opts: PracticeOptions): Schedule => {
  const taken = new Set<string>(opts.avoidNames ?? []);
  const takenMasks = new Set<string>(opts.avoidMasks ?? []);
  const entries: ScheduleEntry[] = [];
  for (let i = 0; i < opts.count; i++) {
    const landmarkCount = PRACTICE_COUNTS[i % PRACTICE_COUNTS.length] ?? 7;
    const built = buildDistinct(
      practiceSeed(opts.masterSeed, i),
      { landmarkCount, number: 0, date: null, id: practiceId(i) },
      takenMasks,
      opts.onBuild
    );
    entries.push(withUniqueName(built, taken));
  }
  return { version: 1, masterSeed: opts.masterSeed, entries };
};

/**
 * Rebuild the dated entry for `date` from `seed`, keeping its id, number, date and landmark
 * count. Its silhouette avoids every other entry plus `avoidMasks`; its name is unique against
 * every other entry plus `avoidNames` and shares no word with dated names within
 * `NAME_WINDOW_DAYS`. Other entries are returned untouched.
 */
export const regenerateDay = (
  schedule: Schedule,
  date: string,
  seed: number,
  avoidNames: ReadonlySet<string> = new Set(),
  avoidMasks: ReadonlySet<string> = new Set()
): Schedule => {
  const index = schedule.entries.findIndex((e) => e.date === date);
  const old = schedule.entries[index];
  if (!old) throw new Error(`no dated entry for ${date} in the schedule`);
  const taken = new Set<string>(avoidNames);
  const takenMasks = new Set<string>(avoidMasks);
  schedule.entries.forEach((e, k) => {
    if (k === index) return;
    taken.add(e.name);
    takenMasks.add(e.land);
  });
  const built = buildDistinct(
    seed >>> 0,
    {
      landmarkCount: landmarkCountFor(date),
      number: old.number,
      date,
      id: old.id,
    },
    takenMasks
  );
  const named = withUniqueName(
    built,
    taken,
    nearbyWords(schedule.entries, date)
  );
  const entries = schedule.entries.map((e, k) => (k === index ? named : e));
  return { ...schedule, entries };
};
