import type { StreakInfo, Tier } from '../../shared/api';
import type { Deps } from '../deps';
import { keys } from '../keys';

export type StreakState = {
  current: number;
  best: number;
  /** Island date of the last counted solve, 'YYYY-MM-DD' or null. */
  lastDate: string | null;
  cleanRun: number;
  total: number;
};

export type SolveEvent = {
  islandDate: string | null;
  postedAt: number;
  solvedAt: number;
  corrections: number;
  /** Hints taken; a hinted solve is not clean. Absent means none. */
  hints?: number | undefined;
};

/** A clean solve took no corrections and no hints. */
const isCleanSolve = (e: SolveEvent): boolean => e.corrections === 0 && (e.hints ?? 0) === 0;

export const COUNTED_WINDOW_MS = 24 * 3600 * 1000;
export const STEADY_HAND_RUN = 7;
/** Hour (UTC) at which the daily island posts; mirrors `scheduler.tasks.daily` in devvit.json. */
export const POST_HOUR_UTC = 12;

export const EMPTY_STREAK: StreakState = {
  current: 0,
  best: 0,
  lastDate: null,
  cleanRun: 0,
  total: 0,
};

/** A dated island solved within 24 hours of its posting counts toward the streak. */
export const isCounted = (e: SolveEvent): boolean =>
  e.islandDate !== null && e.solvedAt - e.postedAt <= COUNTED_WINDOW_MS;

/** [year, monthIndex, day] for 'YYYY-MM-DD'; null when malformed. */
const parseDate = (date: string): [number, number, number] | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
};

/** Whole UTC days since the epoch for 'YYYY-MM-DD'; NaN when malformed. */
const dayNumber = (date: string): number => {
  const p = parseDate(date);
  return p ? Math.round(Date.UTC(p[0], p[1], p[2]) / 86_400_000) : Number.NaN;
};

/**
 * The last moment the island after `lastDate` can still be charted inside its
 * 24-hour window, assuming it posts at POST_HOUR_UTC. NaN for a malformed date.
 */
export const streakDeadline = (lastDate: string): number => {
  const p = parseDate(lastDate);
  return p
    ? Date.UTC(p[0], p[1], p[2] + 1, POST_HOUR_UTC) + COUNTED_WINDOW_MS
    : Number.NaN;
};

/** True once the island after `lastDate` can no longer extend the streak. */
export const isBroken = (s: StreakState, now: number): boolean => {
  if (s.current === 0 || s.lastDate === null) return false;
  const deadline = streakDeadline(s.lastDate);
  return !Number.isNaN(deadline) && now > deadline;
};

/**
 * The streak as the player should see it. A broken streak reads as 0 (and the
 * tier falls back to Deckhand) until the next counted solve starts a new one.
 * Stored fields are never rewritten here; `applySolve` resets them on that solve.
 */
export const displayStreak = (s: StreakState, now: number): StreakState =>
  isBroken(s, now) ? { ...s, current: 0 } : s;

/** Pure streak rule (spec section 5.5). Never mutates `prev`. */
export const applySolve = (prev: StreakState, e: SolveEvent): StreakState => {
  // Practice islands do not count: nothing changes, the total included.
  if (e.islandDate === null) return prev;
  const total = prev.total + 1;
  if (!isCounted(e)) return { ...prev, total };
  // A malformed stored lastDate (NaN day) is treated as no previous date, so a
  // bad value can never freeze the streak; the next write repairs it.
  const prevDay =
    prev.lastDate === null ? Number.NaN : dayNumber(prev.lastDate);
  if (!Number.isNaN(prevDay)) {
    const gap = dayNumber(e.islandDate) - prevDay;
    // The same date posted twice, or an older island: the streak is keyed by island
    // date and never moves backwards, so only the total grows.
    if (Number.isNaN(gap) || gap <= 0) return { ...prev, total };
    const current = gap === 1 ? prev.current + 1 : 1;
    return {
      current,
      best: Math.max(prev.best, current),
      lastDate: e.islandDate,
      cleanRun: isCleanSolve(e) ? prev.cleanRun + 1 : 0,
      total,
    };
  }
  return {
    current: 1,
    best: Math.max(prev.best, 1),
    lastDate: e.islandDate,
    cleanRun: isCleanSolve(e) ? prev.cleanRun + 1 : 0,
    total,
  };
};

export const tierFor = (s: StreakState): Tier | null => {
  if (s.current >= 30) return 'master';
  if (s.current >= 7) return 'cartographer';
  if (s.current >= 3) return 'navigator';
  if (s.total >= 1) return 'deckhand';
  return null;
};

/** Player-facing streak at time `now`: decayed when broken (see `displayStreak`). */
export const toStreakInfo = (
  s: StreakState,
  counted: boolean,
  now: number
): StreakInfo => {
  const shown = displayStreak(s, now);
  return {
    current: shown.current,
    best: shown.best,
    cleanRun: shown.cleanRun,
    total: shown.total,
    tier: tierFor(shown),
    steadyHand: shown.cleanRun >= STEADY_HAND_RUN,
    counted,
  };
};

const toInt = (v: string | undefined): number => {
  const n = Number(v ?? '0');
  return Number.isFinite(n) ? n : 0;
};

export const readStreak = async (
  deps: Deps,
  uid: string
): Promise<StreakState> => {
  const h = await deps.redis.hGetAll(keys.streak(uid));
  return {
    current: toInt(h.current),
    best: toInt(h.best),
    lastDate: h.lastDate ? h.lastDate : null,
    cleanRun: toInt(h.cleanRun),
    total: toInt(h.total),
  };
};

export const writeStreak = async (
  deps: Deps,
  uid: string,
  s: StreakState
): Promise<void> => {
  await deps.redis.hSet(keys.streak(uid), {
    current: String(s.current),
    best: String(s.best),
    lastDate: s.lastDate ?? '',
    cleanRun: String(s.cleanRun),
    total: String(s.total),
  });
};
