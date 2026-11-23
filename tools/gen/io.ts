import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DIRS, LANDMARKS } from '../../src/shared/puzzle/types';
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
} from '../../src/shared/puzzle/types';

export const SCHEDULE_PATH = fileURLToPath(
  new URL('../../src/server/puzzles/schedule.json', import.meta.url)
);
export const PRACTICE_PATH = fileURLToPath(
  new URL('../../src/server/puzzles/practice.json', import.meta.url)
);

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const LANDMARK_SET = new Set<string>(LANDMARKS);
const DIR_SET = new Set<string>(DIRS);
const DIFFICULTIES = new Set<string>(['easy', 'medium', 'hard']);

const isLandmarkId = (value: unknown): value is LandmarkId =>
  typeof value === 'string' && LANDMARK_SET.has(value);
const isDir = (value: unknown): value is Dir =>
  typeof value === 'string' && DIR_SET.has(value);
const isAxis = (value: unknown): value is Axis =>
  value === 'row' || value === 'column';
const isDifficulty = (value: unknown): value is Difficulty =>
  typeof value === 'string' && DIFFICULTIES.has(value);
const isOptionalFlag = (value: unknown): boolean =>
  value === undefined || typeof value === 'boolean';
const isCell = (value: unknown): value is Cell =>
  isObj(value) && Number.isInteger(value.r) && Number.isInteger(value.c);

export const isClue = (value: unknown): value is Clue => {
  if (!isObj(value)) return false;
  switch (value.type) {
    case 'shore':
      return isLandmarkId(value.a) && isDir(value.dir);
    case 'inland':
      return isLandmarkId(value.a);
    case 'due':
    case 'somewhere':
      return isLandmarkId(value.a) && isDir(value.dir) && isLandmarkId(value.b);
    case 'touches':
      return (
        isLandmarkId(value.a) &&
        isLandmarkId(value.b) &&
        isOptionalFlag(value.not)
      );
    case 'shares':
      return (
        isLandmarkId(value.a) &&
        isAxis(value.axis) &&
        isLandmarkId(value.b) &&
        isOptionalFlag(value.not)
      );
    case 'between':
      return (
        isLandmarkId(value.a) && isLandmarkId(value.b) && isLandmarkId(value.c)
      );
    case 'extreme':
      return isLandmarkId(value.a) && isDir(value.dir);
    default:
      return false;
  }
};

const isPlacement = (value: unknown): value is Placement =>
  isObj(value) &&
  Object.entries(value).every(
    ([key, cell]) => isLandmarkId(key) && isCell(cell)
  );

const isEntry = (value: unknown): value is ScheduleEntry =>
  isObj(value) &&
  typeof value.id === 'string' &&
  typeof value.number === 'number' &&
  typeof value.name === 'string' &&
  isDifficulty(value.difficulty) &&
  typeof value.land === 'string' &&
  Array.isArray(value.landmarks) &&
  value.landmarks.every(isLandmarkId) &&
  Array.isArray(value.clues) &&
  value.clues.every(isClue) &&
  (value.date === null || typeof value.date === 'string') &&
  typeof value.seed === 'number' &&
  isPlacement(value.solution);

/** Structural check of parsed JSON. `verifySchedule` does the semantic checks. */
export const isSchedule = (value: unknown): value is Schedule =>
  isObj(value) &&
  value.version === 1 &&
  typeof value.masterSeed === 'number' &&
  Array.isArray(value.entries) &&
  value.entries.every(isEntry);

export const parseSchedule = (text: string, label: string): Schedule => {
  const raw: unknown = JSON.parse(text);
  if (!isSchedule(raw))
    throw new Error(`${label} is not a well-formed schedule`);
  return raw;
};

export const readSchedule = (path: string): Schedule =>
  parseSchedule(readFileSync(path, 'utf8'), path);

/** 2-space JSON with a trailing newline, so regenerating with the same seed is byte-identical. */
export const formatSchedule = (schedule: Schedule): string =>
  `${JSON.stringify(schedule, null, 2)}\n`;

export const writeSchedule = (path: string, schedule: Schedule): void => {
  writeFileSync(path, formatSchedule(schedule));
};
