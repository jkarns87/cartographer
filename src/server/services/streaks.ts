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
};

export const COUNTED_WINDOW_MS = 24 * 3600 * 1000;
export const STEADY_HAND_RUN = 7;

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

/** Whole UTC days since the epoch for 'YYYY-MM-DD'; NaN when malformed. */
const dayNumber = (date: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return Number.NaN;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
};

/** Pure streak rule (spec section 5.5). Never mutates `prev`. */
export const applySolve = (prev: StreakState, e: SolveEvent): StreakState => {
  const total = prev.total + 1;
  if (e.islandDate === null || !isCounted(e)) return { ...prev, total };
  if (prev.lastDate !== null) {
    const gap = dayNumber(e.islandDate) - dayNumber(prev.lastDate);
    // Same island, or an older island solved late through a delayed post: never move backwards.
    if (!(gap > 0)) return { ...prev, total };
    const current = gap === 1 ? prev.current + 1 : 1;
    return {
      current,
      best: Math.max(prev.best, current),
      lastDate: e.islandDate,
      cleanRun: e.corrections === 0 ? prev.cleanRun + 1 : 0,
      total,
    };
  }
  return {
    current: 1,
    best: Math.max(prev.best, 1),
    lastDate: e.islandDate,
    cleanRun: e.corrections === 0 ? prev.cleanRun + 1 : 0,
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

export const toStreakInfo = (s: StreakState, counted: boolean): StreakInfo => ({
  current: s.current,
  best: s.best,
  cleanRun: s.cleanRun,
  total: s.total,
  tier: tierFor(s),
  steadyHand: s.cleanRun >= STEADY_HAND_RUN,
  counted,
});

const toInt = (v: string | undefined): number => {
  const n = Number(v ?? '0');
  return Number.isFinite(n) ? n : 0;
};

export const readStreak = async (deps: Deps, uid: string): Promise<StreakState> => {
  const h = await deps.redis.hGetAll(keys.streak(uid));
  return {
    current: toInt(h.current),
    best: toInt(h.best),
    lastDate: h.lastDate ? h.lastDate : null,
    cleanRun: toInt(h.cleanRun),
    total: toInt(h.total),
  };
};

export const writeStreak = async (deps: Deps, uid: string, s: StreakState): Promise<void> => {
  await deps.redis.hSet(keys.streak(uid), {
    current: String(s.current),
    best: String(s.best),
    lastDate: s.lastDate ?? '',
    cleanRun: String(s.cleanRun),
    total: String(s.total),
  });
};
