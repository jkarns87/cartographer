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
 * Keep island names unique: on a collision, redraw deterministically from the entry's seed.
 * Adds the final name to `taken`.
 */
export const withUniqueName = (
  entry: ScheduleEntry,
  taken: Set<string>
): ScheduleEntry => {
  let name = entry.name;
  for (let k = 1; taken.has(name); k++) {
    if (k > MAX_NAME_DRAWS)
      throw new Error(`ran out of island names for ${entry.id}`);
    name = islandName(mulberry32(hashSeed(entry.seed ^ NAME_SALT, k)));
  }
  taken.add(name);
  return name === entry.name ? entry : { ...entry, name };
};

export type ScheduleOptions = {
  masterSeed: number;
  startDate: string;
  days: number;
  onBuild?: BuildListener;
};

/** Dated islands from `startDate`, numbered 1..days. Throws if any day cannot be built. */
export const generateSchedule = (opts: ScheduleOptions): Schedule => {
  const taken = new Set<string>();
  const entries: ScheduleEntry[] = [];
  for (let i = 0; i < opts.days; i++) {
    const date = addDays(opts.startDate, i);
    const built = mustBuild(
      daySeed(opts.masterSeed, i),
      { landmarkCount: landmarkCountFor(date), number: i + 1, date, id: date },
      opts.onBuild
    );
    entries.push(withUniqueName(built, taken));
  }
  return { version: 1, masterSeed: opts.masterSeed, entries };
};

export type PracticeOptions = {
  masterSeed: number;
  count: number;
  /** Names already used (by the dated schedule); practice names avoid them. */
  avoidNames?: ReadonlySet<string>;
  onBuild?: BuildListener;
};

/** Undated practice islands: number 0, date null, ids practice-01, practice-02, ... */
export const generatePractice = (opts: PracticeOptions): Schedule => {
  const taken = new Set<string>(opts.avoidNames ?? []);
  const entries: ScheduleEntry[] = [];
  for (let i = 0; i < opts.count; i++) {
    const landmarkCount = PRACTICE_COUNTS[i % PRACTICE_COUNTS.length] ?? 7;
    const built = mustBuild(
      practiceSeed(opts.masterSeed, i),
      { landmarkCount, number: 0, date: null, id: practiceId(i) },
      opts.onBuild
    );
    entries.push(withUniqueName(built, taken));
  }
  return { version: 1, masterSeed: opts.masterSeed, entries };
};

/**
 * Rebuild the dated entry for `date` from `seed`, keeping its id, number, date and landmark
 * count, and a name unique against every other entry plus `avoidNames`. Other entries are
 * returned untouched.
 */
export const regenerateDay = (
  schedule: Schedule,
  date: string,
  seed: number,
  avoidNames: ReadonlySet<string> = new Set()
): Schedule => {
  const index = schedule.entries.findIndex((e) => e.date === date);
  const old = schedule.entries[index];
  if (!old) throw new Error(`no dated entry for ${date} in the schedule`);
  const taken = new Set<string>(avoidNames);
  schedule.entries.forEach((e, k) => {
    if (k !== index) taken.add(e.name);
  });
  const built = mustBuild(seed >>> 0, {
    landmarkCount: landmarkCountFor(date),
    number: old.number,
    date,
    id: old.id,
  });
  const entries = schedule.entries.map((e, k) =>
    k === index ? withUniqueName(built, taken) : e
  );
  return { ...schedule, entries };
};
