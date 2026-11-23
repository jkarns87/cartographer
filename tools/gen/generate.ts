import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Schedule } from '../../src/shared/puzzle/types';
import { REJECT_REASONS } from './build';
import type { BuildOptions, BuildReport, RejectReason } from './build';
import { hashSeed } from './rng';
import {
  PRACTICE_PATH,
  readSchedule,
  SCHEDULE_PATH,
  writeSchedule,
} from './io';
import {
  generatePractice,
  generateSchedule,
  isIsoDate,
  regenerateDay,
} from './schedule';

/**
 * npm run gen                       regenerate both files from --seed (default 7)
 * npm run gen -- --day 2026-12-14   rebuild one dated entry with a fresh sub-seed
 */
const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '7' },
    start: { type: 'string', default: '2026-12-01' },
    days: { type: 'string', default: '180' },
    practice: { type: 'string', default: '20' },
    day: { type: 'string' },
  },
  strict: true,
});

const intArg = (name: string, raw: string, min: number): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min)
    throw new Error(`--${name} must be an integer >= ${min}, got "${raw}"`);
  return value;
};

type Stats = {
  builds: number;
  attempts: number;
  rejects: Partial<Record<RejectReason, number>>;
};

const statsByCount = new Map<number, Stats>();
const onBuild = (report: BuildReport, opts: BuildOptions): void => {
  const stats = statsByCount.get(opts.landmarkCount) ?? {
    builds: 0,
    attempts: 0,
    rejects: {},
  };
  stats.builds++;
  stats.attempts += report.attempts;
  for (const reason of REJECT_REASONS) {
    const n = report.rejects[reason];
    if (n) stats.rejects[reason] = (stats.rejects[reason] ?? 0) + n;
  }
  statsByCount.set(opts.landmarkCount, stats);
};

const histogram = (values: readonly (string | number)[]): string => {
  const counts = new Map<string, number>();
  for (const v of values)
    counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a < b ? -1 : a > b ? 1 : 0;
    })
    .map(([k, n]) => `${k}:${n}`)
    .join(' ');
};

const summarize = (label: string, schedule: Schedule): void => {
  const { entries } = schedule;
  console.log(`${label}: ${entries.length} islands`);
  for (const count of [7, 8, 9]) {
    const group = entries.filter((e) => e.landmarks.length === count);
    if (group.length === 0) continue;
    console.log(
      `  ${count} landmarks (${group.length}): clues ${histogram(group.map((e) => e.clues.length))} | difficulty ${histogram(group.map((e) => e.difficulty))}`
    );
  }
  console.log(
    `  all: difficulty ${histogram(entries.map((e) => e.difficulty))}`
  );
};

const regenerateOne = (date: string): void => {
  if (!isIsoDate(date))
    throw new Error(`--day must be YYYY-MM-DD, got "${date}"`);
  const schedule = readSchedule(SCHEDULE_PATH);
  const index = schedule.entries.findIndex((e) => e.date === date);
  if (index < 0) throw new Error(`${date} is not in schedule.json`);
  const practiceEntries = existsSync(PRACTICE_PATH)
    ? readSchedule(PRACTICE_PATH).entries
    : [];
  // A fresh sub-seed each run: the point of --day is to replace an island someone disliked.
  const seed = (hashSeed(schedule.masterSeed, index) ^ Date.now()) >>> 0;
  const next = regenerateDay(
    schedule,
    date,
    seed,
    new Set(practiceEntries.map((e) => e.name)),
    new Set(practiceEntries.map((e) => e.land))
  );
  writeSchedule(SCHEDULE_PATH, next);
  const entry = next.entries[index];
  if (entry)
    console.log(
      `rebuilt ${date}: "${entry.name}" ${entry.difficulty}, ${entry.clues.length} clues, seed ${entry.seed}`
    );
};

const regenerateAll = (): void => {
  const masterSeed = intArg('seed', values.seed, 0);
  const days = intArg('days', values.days, 1);
  const count = intArg('practice', values.practice, 0);
  if (!isIsoDate(values.start))
    throw new Error(`--start must be YYYY-MM-DD, got "${values.start}"`);

  const t0 = performance.now();
  const schedule = generateSchedule({
    masterSeed,
    startDate: values.start,
    days,
    onBuild,
  });
  const practice = generatePractice({
    masterSeed,
    count,
    avoidNames: new Set(schedule.entries.map((e) => e.name)),
    avoidMasks: new Set(schedule.entries.map((e) => e.land)),
    onBuild,
  });
  const seconds = (performance.now() - t0) / 1000;
  writeSchedule(SCHEDULE_PATH, schedule);
  writeSchedule(PRACTICE_PATH, practice);

  console.log(
    `masterSeed ${masterSeed}, ${days} days from ${values.start}, ${count} practice, ${seconds.toFixed(1)} s`
  );
  for (const [landmarks, stats] of [...statsByCount.entries()].sort(
    ([a], [b]) => a - b
  )) {
    const rejected = stats.attempts - stats.builds;
    const rate = ((rejected / stats.attempts) * 100).toFixed(0);
    const reasons = Object.entries(stats.rejects)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
    console.log(
      `  ${landmarks} landmarks: ${stats.builds} islands, ${stats.attempts} attempts, ${rejected} rejected (${rate}%)${reasons ? `: ${reasons}` : ''}`
    );
  }
  summarize('schedule.json', schedule);
  summarize('practice.json', practice);
};

if (values.day !== undefined) regenerateOne(values.day);
else regenerateAll();
