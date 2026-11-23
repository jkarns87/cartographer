import type { Stats } from '../../shared/api';
import type { Deps } from '../deps';
import { keys } from '../keys';

/** Solve times under this are stored and ranked but excluded from the median (spec 5.3). */
export const MEDIAN_FLOOR_MS = 10_000;

const count = (v: string | undefined): number => {
  const n = Number(v ?? '0');
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Stats hash fields (spec 5.4) plus `fast`, the count of stored times under the floor. */
const FAST = 'fast';

/**
 * Median of the stored times at or above the floor, or null when there are none.
 * Times under the floor sort first in the zset and `fast` counts them, so the
 * eligible times are the rank window [fast, zCard - 1]; only the middle one or
 * two members are fetched. Rank ranges only: the real client caps score ranges
 * at 1,000 members and rejects `limit` with rank.
 */
const medianOf = async (deps: Deps, postId: string, fast: number): Promise<number | null> => {
  const key = keys.times(postId);
  const all = await deps.redis.zCard(key);
  const skip = Math.min(fast, all);
  const n = all - skip;
  if (n <= 0) return null;
  const lo = skip + Math.floor((n - 1) / 2);
  const hi = skip + Math.floor(n / 2);
  const middle = await deps.redis.zRange(key, lo, hi, { by: 'rank' });
  if (middle.length === 0) return null;
  const sum = middle.reduce((acc, m) => acc + m.score, 0);
  return Math.round(sum / middle.length);
};

export const readStats = async (deps: Deps, postId: string): Promise<Stats> => {
  const h = await deps.redis.hGetAll(keys.stats(postId));
  const charted = count(h.charted);
  const clean = count(h.clean);
  return {
    started: count(h.started),
    charted,
    cleanPct: charted > 0 ? Math.round((clean * 100) / charted) : 0,
    medianMs: await medianOf(deps, postId, count(h[FAST])),
  };
};

/** Counts a first solve and stores its time. Called exactly once per user per post. */
export const recordTime = async (
  deps: Deps,
  postId: string,
  uid: string,
  elapsedMs: number,
  clean: boolean
): Promise<void> => {
  const statsKey = keys.stats(postId);
  await deps.redis.hIncrBy(statsKey, 'charted', 1);
  if (clean) await deps.redis.hIncrBy(statsKey, 'clean', 1);
  if (elapsedMs < MEDIAN_FLOOR_MS) await deps.redis.hIncrBy(statsKey, FAST, 1);
  await deps.redis.zAdd(keys.times(postId), { member: uid, score: elapsedMs });
};

/** 1-based rank by elapsed time among every recorded time; rank 0 when the user has none. */
export const rankOf = async (
  deps: Deps,
  postId: string,
  uid: string
): Promise<{ rank: number; total: number }> => {
  const key = keys.times(postId);
  const index = await deps.redis.zRank(key, uid);
  const total = await deps.redis.zCard(key);
  return { rank: index === undefined ? 0 : index + 1, total };
};
