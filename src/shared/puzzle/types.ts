export const SIZE = 6;

export const LANDMARKS = [
  'lighthouse',
  'windmill',
  'harbor',
  'fort',
  'temple',
  'well',
  'cave',
  'shipwreck',
  'farm',
  'watchtower',
  'camp',
  'mine',
  'ruins',
  'beacon',
] as const;

export type LandmarkId = (typeof LANDMARKS)[number];

export const LANDMARK_NAMES: Record<LandmarkId, string> = {
  lighthouse: 'Lighthouse',
  windmill: 'Windmill',
  harbor: 'Harbor',
  fort: 'Fort',
  temple: 'Temple',
  well: 'Well',
  cave: 'Cave',
  shipwreck: 'Shipwreck',
  farm: 'Farm',
  watchtower: 'Watchtower',
  camp: 'Camp',
  mine: 'Mine',
  ruins: 'Ruin',
  beacon: 'Beacon',
};

export const DIRS = ['N', 'E', 'S', 'W'] as const;
export type Dir = (typeof DIRS)[number];
export type Axis = 'row' | 'column';

/** Row 0 is north, column 0 is west. */
export type Cell = { r: number; c: number };

/** 36 characters, row-major, '1' = land, '0' = water. */
export type LandMask = string;

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

/** Spec 2.5: a dated island with this many landmarks (the Sunday draw) is labeled Expedition. */
export const EXPEDITION_LANDMARKS = 9;

export type Clue =
  | { type: 'shore'; a: LandmarkId; dir: Dir }
  | { type: 'inland'; a: LandmarkId }
  | { type: 'due'; a: LandmarkId; dir: Dir; b: LandmarkId }
  | { type: 'somewhere'; a: LandmarkId; dir: Dir; b: LandmarkId }
  | { type: 'touches'; a: LandmarkId; b: LandmarkId; not?: boolean }
  | { type: 'shares'; a: LandmarkId; axis: Axis; b: LandmarkId; not?: boolean }
  | { type: 'between'; a: LandmarkId; b: LandmarkId; c: LandmarkId }
  | { type: 'extreme'; a: LandmarkId; dir: Dir };

export type ClueType = Clue['type'];

export type Placement = Partial<Record<LandmarkId, Cell>>;

export type ClueState = 'pending' | 'lit' | 'contradicted';

export type Puzzle = {
  id: string;
  /** Dated islands are numbered from 1 in date order. Practice islands are 0. */
  number: number;
  name: string;
  difficulty: Difficulty;
  land: LandMask;
  landmarks: LandmarkId[];
  clues: Clue[];
};

export type ScheduleEntry = Puzzle & {
  /** 'YYYY-MM-DD' (UTC) for dated islands, null for practice islands. */
  date: string | null;
  seed: number;
  solution: Placement;
};

export type Schedule = {
  version: 1;
  masterSeed: number;
  entries: ScheduleEntry[];
};
