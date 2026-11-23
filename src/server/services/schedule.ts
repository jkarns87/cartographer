import { isValidMask } from '../../shared/puzzle/grid';
import { DIRS, LANDMARKS, SIZE } from '../../shared/puzzle/types';
import type {
  Axis,
  Cell,
  Clue,
  Difficulty,
  Dir,
  LandmarkId,
  Placement,
  Schedule,
  ScheduleEntry,
} from '../../shared/puzzle/types';
import practiceJson from '../puzzles/practice.json';
import scheduleJson from '../puzzles/schedule.json';

/** 'YYYY-MM-DD' of the UTC calendar day containing `ms`. */
export const utcDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const entryForDate = (schedule: Schedule, date: string): ScheduleEntry | undefined =>
  schedule.entries.find((e) => e.date === date);

/** Practice entry at `index` modulo the pool size; undefined for an empty pool. */
export const practiceEntry = (practice: Schedule, index: number): ScheduleEntry | undefined => {
  const n = practice.entries.length;
  if (n === 0) return undefined;
  return practice.entries[((index % n) + n) % n];
};

/** Parses and validates the committed JSON files. Throws at startup on bad data. */
export const loadSchedules = (): { schedule: Schedule; practice: Schedule } => ({
  schedule: parseSchedule(scheduleJson, 'schedule.json'),
  practice: parseSchedule(practiceJson, 'practice.json'),
});

// Structural validation. JSON imports are inferred as widened types, so the
// data is rebuilt into the contract types instead of being cast.

const LANDMARK_SET: ReadonlySet<string> = new Set(LANDMARKS);
const DIR_SET: ReadonlySet<string> = new Set(DIRS);
const DIFFICULTY_SET: ReadonlySet<string> = new Set(['easy', 'medium', 'hard']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isLandmarkId = (v: string): v is LandmarkId => LANDMARK_SET.has(v);
const isDir = (v: string): v is Dir => DIR_SET.has(v);
const isAxis = (v: string): v is Axis => v === 'row' || v === 'column';
const isDifficulty = (v: string): v is Difficulty => DIFFICULTY_SET.has(v);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const fail = (where: string, msg: string): never => {
  throw new Error(`${where}: ${msg}`);
};

const str = (o: Record<string, unknown>, k: string, where: string): string => {
  const v = o[k];
  return typeof v === 'string' ? v : fail(where, `${k} must be a string`);
};

const int = (o: Record<string, unknown>, k: string, where: string): number => {
  const v = o[k];
  return typeof v === 'number' && Number.isInteger(v) ? v : fail(where, `${k} must be an integer`);
};

const landmark = (v: unknown, where: string): LandmarkId =>
  typeof v === 'string' && isLandmarkId(v) ? v : fail(where, `unknown landmark ${String(v)}`);

const dir = (v: unknown, where: string): Dir =>
  typeof v === 'string' && isDir(v) ? v : fail(where, `bad direction ${String(v)}`);

const axis = (v: unknown, where: string): Axis =>
  typeof v === 'string' && isAxis(v) ? v : fail(where, `bad axis ${String(v)}`);

const negation = (v: unknown, where: string): boolean | undefined => {
  if (v === undefined) return undefined;
  return typeof v === 'boolean' ? v : fail(where, 'not must be a boolean');
};

export const parseClue = (raw: unknown, where: string): Clue => {
  if (!isRecord(raw)) return fail(where, 'clue must be an object');
  const type = str(raw, 'type', where);
  switch (type) {
    case 'shore':
      return { type, a: landmark(raw.a, where), dir: dir(raw.dir, where) };
    case 'inland':
      return { type, a: landmark(raw.a, where) };
    case 'due':
    case 'somewhere':
      return { type, a: landmark(raw.a, where), dir: dir(raw.dir, where), b: landmark(raw.b, where) };
    case 'touches': {
      const not = negation(raw.not, where);
      const clue: Clue = { type, a: landmark(raw.a, where), b: landmark(raw.b, where) };
      return not === undefined ? clue : { ...clue, not };
    }
    case 'shares': {
      const not = negation(raw.not, where);
      const clue: Clue = {
        type,
        a: landmark(raw.a, where),
        axis: axis(raw.axis, where),
        b: landmark(raw.b, where),
      };
      return not === undefined ? clue : { ...clue, not };
    }
    case 'between':
      return {
        type,
        a: landmark(raw.a, where),
        b: landmark(raw.b, where),
        c: landmark(raw.c, where),
      };
    case 'extreme':
      return { type, a: landmark(raw.a, where), dir: dir(raw.dir, where) };
    default:
      return fail(where, `unknown clue type ${type}`);
  }
};

const parseCell = (raw: unknown, where: string): Cell => {
  if (!isRecord(raw)) return fail(where, 'cell must be an object');
  const r = int(raw, 'r', where);
  const c = int(raw, 'c', where);
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return fail(where, `cell off grid (${r},${c})`);
  return { r, c };
};

export const parseEntry = (raw: unknown, where: string): ScheduleEntry => {
  if (!isRecord(raw)) return fail(where, 'entry must be an object');
  const id = str(raw, 'id', where);
  const at = `${where}[${id}]`;

  const number = int(raw, 'number', at);
  if (number < 0) fail(at, 'number must not be negative');
  const name = str(raw, 'name', at);
  if (name.length === 0) fail(at, 'name must not be empty');
  const difficultyRaw = str(raw, 'difficulty', at);
  const difficulty = isDifficulty(difficultyRaw)
    ? difficultyRaw
    : fail(at, `bad difficulty ${difficultyRaw}`);
  const land = str(raw, 'land', at);
  if (!isValidMask(land)) fail(at, 'land must be a 36-character mask of 0 and 1');

  if (!Array.isArray(raw.landmarks)) return fail(at, 'landmarks must be an array');
  const landmarks = raw.landmarks.map((v) => landmark(v, at));
  if (landmarks.length === 0 || landmarks.length > LANDMARKS.length) {
    fail(at, 'landmarks must draw between 1 and 14');
  }
  if (new Set(landmarks).size !== landmarks.length) fail(at, 'landmarks must be distinct');

  if (!Array.isArray(raw.clues)) return fail(at, 'clues must be an array');
  const clues = raw.clues.map((c, i) => parseClue(c, `${at}.clues[${i}]`));

  const dateRaw = raw.date;
  let date: string | null;
  if (dateRaw === null) date = null;
  else if (typeof dateRaw === 'string' && DATE_RE.test(dateRaw)) date = dateRaw;
  else return fail(at, 'date must be YYYY-MM-DD or null');

  const seed = int(raw, 'seed', at);

  if (!isRecord(raw.solution)) return fail(at, 'solution must be an object');
  const solution: Placement = {};
  for (const key of Object.keys(raw.solution)) landmark(key, `${at}.solution`);
  for (const lm of landmarks) {
    const cell = raw.solution[lm];
    if (cell === undefined) fail(at, `solution is missing ${lm}`);
    solution[lm] = parseCell(cell, `${at}.solution.${lm}`);
  }
  if (Object.keys(raw.solution).length !== landmarks.length) {
    fail(at, 'solution names landmarks outside the draw');
  }

  return { id, number, name, difficulty, land, landmarks, clues, date, seed, solution };
};

export const parseSchedule = (raw: unknown, where: string): Schedule => {
  if (!isRecord(raw)) return fail(where, 'schedule must be an object');
  if (raw.version !== 1) return fail(where, 'version must be 1');
  const masterSeed = int(raw, 'masterSeed', where);
  if (!Array.isArray(raw.entries)) return fail(where, 'entries must be an array');
  const entries = raw.entries.map((e, i) => parseEntry(e, `${where}.entries[${i}]`));
  return { version: 1, masterSeed, entries };
};
