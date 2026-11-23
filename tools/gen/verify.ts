import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clueText } from '../../src/shared/puzzle/templates';
import { isValidMask } from '../../src/shared/puzzle/grid';
import {
  clueHolds,
  clueLandmarks,
  samePlacement,
  validatePlacement,
} from '../../src/shared/puzzle/predicates';
import {
  countSolutions,
  difficultyFor,
  propagate,
} from '../../src/shared/puzzle/solver';
import { LANDMARKS } from '../../src/shared/puzzle/types';
import type { Schedule, ScheduleEntry } from '../../src/shared/puzzle/types';
import { capProblems } from './build';
import { impliedPairs } from './clues';
import { islandProblem } from './island';
import { PRACTICE_PATH, readSchedule, SCHEDULE_PATH } from './io';
import { isIsoDate, landmarkCountFor } from './schedule';

export type VerifyProblem = { id: string; problem: string };

const MIN_LANDMARKS = 7;
const MAX_LANDMARKS = 9;
const KNOWN = new Set<string>(LANDMARKS);

/** Everything wrong with one entry on its own (schedule-level checks are separate). */
export const entryProblems = (entry: ScheduleEntry): string[] => {
  const problems: string[] = [];
  if (entry.name.trim() === '') problems.push('name is empty');
  if (!Number.isInteger(entry.seed) || entry.seed < 0)
    problems.push(`seed ${entry.seed} is not a uint32`);

  if (!isValidMask(entry.land))
    return [...problems, 'land is not a valid 36-cell mask'];
  const island = islandProblem(entry.land);
  if (island) problems.push(`island ${island}`);

  const { landmarks } = entry;
  if (new Set(landmarks).size !== landmarks.length)
    problems.push('landmarks repeat');
  if (landmarks.length < MIN_LANDMARKS || landmarks.length > MAX_LANDMARKS) {
    problems.push(
      `${landmarks.length} landmarks, expected ${MIN_LANDMARKS}..${MAX_LANDMARKS}`
    );
  }
  const unknown = landmarks.filter((id) => !KNOWN.has(id));
  if (unknown.length > 0)
    return [...problems, `unknown landmarks ${unknown.join(', ')}`];

  const placement = validatePlacement(entry, entry.solution);
  if (!placement.ok)
    return [...problems, `solution is invalid (${placement.reason})`];

  const inPuzzle = new Set<string>(landmarks);
  for (const clue of entry.clues) {
    if (!clueLandmarks(clue).every((id) => inPuzzle.has(id))) {
      problems.push(
        `clue names a landmark outside the puzzle: ${JSON.stringify(clue)}`
      );
    } else if (!clueHolds(clue, entry.solution, entry.land, landmarks)) {
      problems.push(`clue is false on the solution: ${clueText(clue)}`);
    }
  }
  if (problems.length > 0) return problems;

  for (const cap of capProblems(entry.clues, landmarks))
    problems.push(cap.message);
  for (const [i, j] of impliedPairs(entry.clues)) {
    const strong = entry.clues[i];
    const weak = entry.clues[j];
    if (strong && weak)
      problems.push(
        `"${clueText(strong)}" already implies "${clueText(weak)}"`
      );
  }

  const count = countSolutions(entry);
  if (count.capped)
    problems.push(`uniqueness search hit the node cap (${count.nodes} nodes)`);
  else if (count.count !== 1)
    problems.push(`${count.count} solutions, expected exactly 1`);
  else {
    const found = count.solutions[0];
    if (!found || !samePlacement(found, entry.solution, landmarks)) {
      problems.push('the unique solution differs from the stored solution');
    }
  }

  const human = propagate(entry);
  if (human.status !== 'solved')
    problems.push(`human solver is ${human.status}`);
  else if (difficultyFor(human.passes) !== entry.difficulty) {
    problems.push(
      `difficulty is ${entry.difficulty} but ${human.passes} passes grade ${difficultyFor(human.passes)}`
    );
  }
  return problems;
};

/** [] when every entry and the schedule as a whole are valid. */
export const verifySchedule = (schedule: Schedule): VerifyProblem[] => {
  const out: VerifyProblem[] = [];
  const add = (id: string, problem: string): void => {
    out.push({ id, problem });
  };

  for (const entry of schedule.entries) {
    try {
      for (const problem of entryProblems(entry)) add(entry.id, problem);
    } catch (err) {
      add(
        entry.id,
        `verification threw: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of schedule.entries) {
    if (ids.has(entry.id)) add(entry.id, 'id is not unique');
    ids.add(entry.id);
    if (names.has(entry.name))
      add(entry.id, `name "${entry.name}" is not unique`);
    names.add(entry.name);
  }

  const dated: Array<ScheduleEntry & { date: string }> = [];
  for (const entry of schedule.entries) {
    if (entry.date === null) {
      if (entry.number !== 0)
        add(entry.id, `practice entry has number ${entry.number}, expected 0`);
      continue;
    }
    const { date } = entry;
    if (!isIsoDate(date)) {
      add(entry.id, `date "${date}" is not a YYYY-MM-DD date`);
      continue;
    }
    if (entry.id !== date)
      add(entry.id, `dated entry id should be its date ${date}`);
    if (entry.landmarks.length !== landmarkCountFor(date)) {
      add(
        entry.id,
        `${entry.landmarks.length} landmarks, the weekday ramp wants ${landmarkCountFor(date)}`
      );
    }
    dated.push({ ...entry, date });
  }
  const dates = new Set<string>();
  for (const entry of dated) {
    if (dates.has(entry.date))
      add(entry.id, `date ${entry.date} is not unique`);
    dates.add(entry.date);
  }
  [...dated]
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
    .forEach((entry, k) => {
      if (entry.number !== k + 1)
        add(
          entry.id,
          `number ${entry.number}, expected ${k + 1} in date order`
        );
    });
  return out;
};

/** Ids and names must also be unique across the dated and practice files. */
export const crossFileProblems = (
  a: Schedule,
  b: Schedule
): VerifyProblem[] => {
  const out: VerifyProblem[] = [];
  const ids = new Set(a.entries.map((e) => e.id));
  const names = new Set(a.entries.map((e) => e.name));
  for (const entry of b.entries) {
    if (ids.has(entry.id))
      out.push({ id: entry.id, problem: 'id also appears in the other file' });
    if (names.has(entry.name))
      out.push({
        id: entry.id,
        problem: `name "${entry.name}" also appears in the other file`,
      });
  }
  return out;
};

const main = (): void => {
  const schedule = readSchedule(SCHEDULE_PATH);
  const practice = readSchedule(PRACTICE_PATH);
  const problems = [
    ...verifySchedule(schedule).map((p) => ({ ...p, file: 'schedule.json' })),
    ...verifySchedule(practice).map((p) => ({ ...p, file: 'practice.json' })),
    ...crossFileProblems(schedule, practice).map((p) => ({
      ...p,
      file: 'practice.json',
    })),
  ];
  for (const p of problems) console.error(`${p.file} ${p.id}: ${p.problem}`);
  if (problems.length > 0) {
    console.error(`${problems.length} problem(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `ok: ${schedule.entries.length} dated and ${practice.entries.length} practice islands are unique, human-solvable and within caps`
  );
};

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  resolve(invokedPath) === fileURLToPath(import.meta.url)
)
  main();
