import { landCells } from '../../src/shared/puzzle/grid';
import { clueLandmarks } from '../../src/shared/puzzle/predicates';
import {
  countSolutions,
  difficultyFor,
  propagate,
  propagateInPlace,
} from '../../src/shared/puzzle/solver';
import type { PropagateResult } from '../../src/shared/puzzle/solver';
import { LANDMARKS } from '../../src/shared/puzzle/types';
import type {
  Clue,
  ClueType,
  LandMask,
  LandmarkId,
  Placement,
  ScheduleEntry,
} from '../../src/shared/puzzle/types';
import {
  clueKey,
  enumerateTrueClues,
  impliedPairs,
  isImpliedBySheet,
} from './clues';
import { growIsland, isAcceptableIsland, MAX_LAND, MIN_LAND } from './island';
import { islandName } from './names';
import { hashSeed, mulberry32 } from './rng';
import type { Rng } from './rng';

/** Relative chance a clue is drawn early when building a sheet (spec 3.3 step 4). */
export const CLUE_WEIGHTS: Record<ClueType, number> = {
  due: 3,
  somewhere: 2,
  touches: 2,
  shares: 2,
  shore: 2,
  between: 2,
  inland: 1,
  extreme: 1,
};
/** Negated touches and shares weigh this instead of their type's weight. */
export const NEGATIVE_WEIGHT = 0.5;

/** `maxNegatives` covers negated touches and negated shares together. */
export const CAPS = {
  minClues: 7,
  maxClues: 11,
  maxNegatives: 2,
  maxBetween: 2,
  maxExtreme: 2,
} as const;

export const MAX_ATTEMPTS = 50;
const ISLAND_RETRIES = 20;
const HUMAN_FIXES = 3;
/**
 * Minimization is greedy, so its result depends on the shuffle. When a pass leaves more than
 * `CAPS.maxClues` clues, re-run it from the same unique prefix with a fresh shuffle, up to this
 * many passes in total, before rejecting the attempt. Without this, 9-landmark attempts are
 * rejected about 80% of the time for too many clues; with it, about 45%.
 */
const MINIMIZE_TRIES = 8;

export type BuildOptions = {
  landmarkCount: number;
  number: number;
  date: string | null;
  id: string;
};

export const REJECT_REASONS = [
  'island',
  'not-unique',
  'stuck',
  'too-many-clues',
  'too-few-clues',
  'caps',
  'unnamed',
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export type BuildReport = {
  entry: ScheduleEntry | null;
  /** Attempts used, including the successful one. */
  attempts: number;
  rejects: Partial<Record<RejectReason, number>>;
};

export const isNegative = (clue: Clue): boolean =>
  (clue.type === 'touches' || clue.type === 'shares') && clue.not === true;

export const clueWeight = (clue: Clue): number =>
  isNegative(clue) ? NEGATIVE_WEIGHT : CLUE_WEIGHTS[clue.type];

type Tally = { negatives: number; between: number; extreme: number };

const tally = (clues: readonly Clue[]): Tally => {
  const t: Tally = { negatives: 0, between: 0, extreme: 0 };
  for (const clue of clues) {
    if (isNegative(clue)) t.negatives++;
    if (clue.type === 'between') t.between++;
    if (clue.type === 'extreme') t.extreme++;
  }
  return t;
};

/** Whether adding `clue` to `sheet` keeps the per-type caps (negatives, between, extreme). */
const fitsTypeCaps = (clue: Clue, sheet: readonly Clue[]): boolean => {
  const t = tally(sheet);
  if (isNegative(clue) && t.negatives >= CAPS.maxNegatives) return false;
  if (clue.type === 'between' && t.between >= CAPS.maxBetween) return false;
  if (clue.type === 'extreme' && t.extreme >= CAPS.maxExtreme) return false;
  return true;
};

/** Landmarks no clue names. Extreme counts as naming its `a` only. */
export const unnamedLandmarks = (
  clues: readonly Clue[],
  landmarks: readonly LandmarkId[]
): LandmarkId[] => {
  const named = new Set<LandmarkId>(clues.flatMap(clueLandmarks));
  return landmarks.filter((id) => !named.has(id));
};

export type CapProblem = { reason: RejectReason; message: string };

/** Every violated cap, or [] when the sheet is within all of `CAPS` and names every landmark. */
export const capProblems = (
  clues: readonly Clue[],
  landmarks: readonly LandmarkId[]
): CapProblem[] => {
  const problems: CapProblem[] = [];
  if (clues.length > CAPS.maxClues) {
    problems.push({
      reason: 'too-many-clues',
      message: `${clues.length} clues > ${CAPS.maxClues}`,
    });
  }
  if (clues.length < CAPS.minClues) {
    problems.push({
      reason: 'too-few-clues',
      message: `${clues.length} clues < ${CAPS.minClues}`,
    });
  }
  const t = tally(clues);
  if (t.negatives > CAPS.maxNegatives) {
    problems.push({
      reason: 'caps',
      message: `${t.negatives} negative clues > ${CAPS.maxNegatives}`,
    });
  }
  if (t.between > CAPS.maxBetween) {
    problems.push({
      reason: 'caps',
      message: `${t.between} between clues > ${CAPS.maxBetween}`,
    });
  }
  if (t.extreme > CAPS.maxExtreme) {
    problems.push({
      reason: 'caps',
      message: `${t.extreme} extreme clues > ${CAPS.maxExtreme}`,
    });
  }
  const unnamed = unnamedLandmarks(clues, landmarks);
  if (unnamed.length > 0) {
    problems.push({
      reason: 'unnamed',
      message: `no clue names ${unnamed.join(', ')}`,
    });
  }
  return problems;
};

/**
 * One representative per equivalence class (random orientation), then a weighted random order:
 * ascending `-ln(u) / weight`, so heavier clues tend to come first (Efraimidis-Spirakis).
 */
const weightedOrder = (rng: Rng, all: readonly Clue[]): Clue[] => {
  const classes = new Map<string, Clue[]>();
  for (const clue of all) {
    const key = clueKey(clue);
    const group = classes.get(key);
    if (group) group.push(clue);
    else classes.set(key, [clue]);
  }
  const keyed = [...classes.values()].map((group) => {
    const clue = rng.pick(group);
    return { clue, key: -Math.log(rng.next()) / clueWeight(clue) };
  });
  keyed.sort((x, y) => x.key - y.key);
  return keyed.map((k) => k.clue);
};

/** The island and landmark draw a clue sheet is being built for. */
export type SheetContext = { land: LandMask; landmarks: LandmarkId[] };
type Ctx = SheetContext;

/**
 * Propagation for status and candidate checks. The in-place sweep reaches exactly the same
 * fixpoint as `propagate` in fewer sweeps; only grading needs `propagate`'s round count.
 */
const run = (ctx: Ctx, clues: readonly Clue[]): PropagateResult =>
  propagateInPlace({
    land: ctx.land,
    landmarks: ctx.landmarks,
    clues: [...clues],
  });

/** Sum of candidate set sizes after propagation. Lower is more progress; solved = landmark count. */
const progressScore = (result: PropagateResult): number => {
  let total = 0;
  for (const set of result.cands.values()) total += set.size;
  return total;
};

const largestSet = (result: PropagateResult): number => {
  let max = 0;
  for (const set of result.cands.values()) max = Math.max(max, set.size);
  return max;
};

/** Exactly one solution. Propagation alone settling every landmark is proof enough. */
const isUnique = (ctx: Ctx, clues: readonly Clue[]): boolean => {
  const quick = run(ctx, clues);
  if (quick.status === 'solved') return true;
  if (quick.status === 'contradiction') return false;
  const result = countSolutions({
    land: ctx.land,
    landmarks: ctx.landmarks,
    clues: [...clues],
  });
  return result.count === 1 && !result.capped;
};

/**
 * The shortest prefix of `ordered` with a unique solution, or null if even all of it is not.
 * Uniqueness is monotone in the prefix length, so a galloping search finds the same prefix as
 * adding one clue at a time, with far fewer solver calls.
 */
const shortestUniquePrefix = (
  ctx: Ctx,
  ordered: readonly Clue[]
): Clue[] | null => {
  if (!isUnique(ctx, ordered)) return null;
  let lo = 0; // longest length known not unique
  let hi = ordered.length; // shortest length known unique
  let probe = 4;
  while (probe < hi) {
    if (isUnique(ctx, ordered.slice(0, probe))) {
      hi = probe;
      break;
    }
    lo = probe;
    probe *= 2;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (isUnique(ctx, ordered.slice(0, mid))) hi = mid;
    else lo = mid;
  }
  return ordered.slice(0, hi);
};

/** Spec 3.3 step 4: drop each clue in shuffled order when the puzzle stays unique without it. */
const minimize = (rng: Rng, ctx: Ctx, sheet: Clue[]): Clue[] => {
  let current = sheet;
  for (const clue of rng.shuffle(sheet)) {
    const without = current.filter((c) => c !== clue);
    if (isUnique(ctx, without)) current = without;
  }
  return current;
};

/** `minimize` with fresh shuffles until a pass fits `CAPS.maxClues`; else the shortest pass. */
const minimizeWithinCap = (rng: Rng, ctx: Ctx, prefix: Clue[]): Clue[] => {
  let best = minimize(rng, ctx, prefix);
  for (let k = 1; k < MINIMIZE_TRIES && best.length > CAPS.maxClues; k++) {
    const next = minimize(rng, ctx, prefix);
    if (next.length < best.length) best = next;
  }
  return best;
};

/**
 * Re-minimize after a human-solver fix: never drop a pinned (added-back) clue, and drop another
 * clue only when the propagation fixpoint is unchanged and the puzzle stays unique, so the human
 * solver never loses ground.
 */
const reminimize = (
  rng: Rng,
  ctx: Ctx,
  sheet: Clue[],
  pinned: ReadonlySet<Clue>
): Clue[] => {
  let current = sheet;
  let score = progressScore(run(ctx, current));
  for (const clue of rng.shuffle(sheet)) {
    if (pinned.has(clue)) continue;
    const without = current.filter((c) => c !== clue);
    const result = run(ctx, without);
    const withoutScore = progressScore(result);
    if (withoutScore > score) continue;
    if (result.status === 'solved' || isUnique(ctx, without)) {
      current = without;
      score = withoutScore;
    }
  }
  return current;
};

/** The unused true clue whose addition most shrinks the largest candidate set. */
const bestFix = (
  ctx: Ctx,
  sheet: readonly Clue[],
  pool: readonly Clue[],
  current: PropagateResult
): Clue | null => {
  let best: Clue | null = null;
  let bestLargest = largestSet(current);
  let bestTotal = progressScore(current);
  const used = new Set(sheet);
  for (const clue of pool) {
    if (
      used.has(clue) ||
      !fitsTypeCaps(clue, sheet) ||
      isImpliedBySheet(clue, sheet)
    )
      continue;
    const result = run(ctx, [...sheet, clue]);
    if (result.status === 'contradiction') continue;
    const largest = largestSet(result);
    const total = progressScore(result);
    if (
      largest < bestLargest ||
      (largest === bestLargest && total < bestTotal)
    ) {
      best = clue;
      bestLargest = largest;
      bestTotal = total;
    }
  }
  return best;
};

/**
 * Spec 3.3 step 5: while the human solver is stuck on `sheet`, add the best unused clue from
 * `pool` (pinned so re-minimization keeps it) and re-minimize, at most `HUMAN_FIXES` times.
 * Returns the solvable sheet (unchanged if it already was), or null when it stays stuck.
 */
export const fixForHumans = (
  rng: Rng,
  ctx: SheetContext,
  sheet: Clue[],
  pool: readonly Clue[]
): Clue[] | null => {
  let current = sheet;
  const pinned = new Set<Clue>();
  for (let fix = 0; ; fix++) {
    const result = run(ctx, current);
    if (result.status === 'solved') return current;
    if (fix === HUMAN_FIXES) return null;
    const clue = bestFix(ctx, current, pool, result);
    if (clue === null) return null;
    pinned.add(clue);
    current = reminimize(rng, ctx, [...current, clue], pinned);
  }
};

type AttemptResult = { entry: ScheduleEntry } | { reject: RejectReason };

const attempt = (
  seed: number,
  opts: BuildOptions,
  index: number
): AttemptResult => {
  const rng = mulberry32(hashSeed(seed, index));

  let land: LandMask | null = null;
  for (let i = 0; i < ISLAND_RETRIES && land === null; i++) {
    const grown = growIsland(rng, MIN_LAND + rng.int(MAX_LAND - MIN_LAND + 1));
    if (isAcceptableIsland(grown)) land = grown;
  }
  if (land === null) return { reject: 'island' };

  const drawn = new Set(rng.shuffle(LANDMARKS).slice(0, opts.landmarkCount));
  // Canonical order so the legend reads the same way every day.
  const landmarks = LANDMARKS.filter((id) => drawn.has(id));
  const cells = rng.shuffle(landCells(land));
  const solution: Placement = {};
  landmarks.forEach((id, k) => {
    const cell = cells[k];
    if (cell) solution[id] = cell;
  });
  const ctx: Ctx = { land, landmarks };

  const pool = weightedOrder(
    rng,
    enumerateTrueClues(land, landmarks, solution)
  );
  // The add order, skipping clues that would break a type cap or that the sheet already implies.
  const ordered: Clue[] = [];
  for (const clue of pool) {
    if (fitsTypeCaps(clue, ordered) && !isImpliedBySheet(clue, ordered))
      ordered.push(clue);
  }

  const prefix = shortestUniquePrefix(ctx, ordered);
  if (prefix === null) return { reject: 'not-unique' };
  const fixed = fixForHumans(
    rng,
    ctx,
    minimizeWithinCap(rng, ctx, prefix),
    pool
  );
  if (fixed === null) return { reject: 'stuck' };
  let sheet = fixed;

  // A clue implied by another single clue on the sheet adds nothing; drop the weaker one.
  for (
    let pairs = impliedPairs(sheet);
    pairs.length > 0;
    pairs = impliedPairs(sheet)
  ) {
    const weaker = pairs[0]?.[1];
    sheet = sheet.filter((_, k) => k !== weaker);
  }

  const problems = capProblems(sheet, landmarks);
  const first = problems[0];
  if (first) return { reject: first.reason };

  const clues = rng.shuffle(sheet);
  // Rounds of the human solver; the same for every clue order.
  const graded = propagate({ land, landmarks, clues });
  if (graded.status !== 'solved') return { reject: 'stuck' };

  const orderedSolution: Placement = {};
  for (const id of landmarks) {
    const cell = solution[id];
    if (cell) orderedSolution[id] = { r: cell.r, c: cell.c };
  }

  return {
    entry: {
      id: opts.id,
      number: opts.number,
      date: opts.date,
      name: islandName(rng),
      difficulty: difficultyFor(graded.passes),
      seed,
      land,
      landmarks,
      clues,
      solution: orderedSolution,
    },
  };
};

/** `buildPuzzle` plus the attempt count and reject reasons, for the spike numbers. */
export const buildPuzzleReport = (
  seed: number,
  opts: BuildOptions
): BuildReport => {
  const rejects: Partial<Record<RejectReason, number>> = {};
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const result = attempt(seed, opts, i);
    if ('entry' in result)
      return { entry: result.entry, attempts: i + 1, rejects };
    rejects[result.reject] = (rejects[result.reject] ?? 0) + 1;
  }
  return { entry: null, attempts: MAX_ATTEMPTS, rejects };
};

/** Spec 3.3: one island from `seed`, or null after `MAX_ATTEMPTS` rejected attempts. */
export const buildPuzzle = (
  seed: number,
  opts: BuildOptions
): ScheduleEntry | null => buildPuzzleReport(seed, opts).entry;
