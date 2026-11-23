import type { ChartRequest, Result, Stats, StreakInfo } from '../../shared/api';
import { allCluesLit, samePlacement, validatePlacement } from '../../shared/puzzle/predicates';
import type { Deps } from '../deps';
import { keys } from '../keys';
import { applyFlair } from './flair';
import { F, elapsedOf, ensureStarted, readProgress } from './progress';
import type { UserProgress } from './progress';
import { resolveSnoovatar } from './snoovatar';
import { loadSnapshot, toPuzzle } from './snapshot';
import type { Snapshot } from './snapshot';
import { rankOf, readStats, recordTime } from './stats';
import { applySolve, isCounted, readStreak, toStreakInfo, writeStreak } from './streaks';
import type { SolveEvent } from './streaks';

export type ChartOutcome =
  | { kind: 'ok'; result: Result; stats: Stats }
  | { kind: 'invalid' }
  | { kind: 'mismatch' }
  | { kind: 'not-found' };

const solveEvent = (snap: Snapshot, solvedAt: number, corrections: number): SolveEvent => ({
  islandDate: snap.date,
  postedAt: snap.postedAt,
  solvedAt,
  corrections,
});

const assemble = async (
  deps: Deps,
  postId: string,
  uid: string,
  p: UserProgress,
  streak: StreakInfo
): Promise<Result> => {
  const { rank, total } = await rankOf(deps, postId, uid);
  return {
    elapsedMs: elapsedOf(p),
    corrections: p.corrections,
    history: p.history,
    rank,
    total,
    streak,
    commented: p.commented,
    subscribePromptSeen: p.subscribePromptSeen,
  };
};

/**
 * The stored result of a solved post, for GET routes and repeat chart calls.
 * The streak block reflects the user's streak now; `counted` is recomputed from
 * the stored solve time.
 */
export const buildResult = async (
  deps: Deps,
  postId: string,
  uid: string,
  p: UserProgress,
  snap: Snapshot
): Promise<Result> => {
  const counted = p.solvedAt !== null && isCounted(solveEvent(snap, p.solvedAt, p.corrections));
  const streak = toStreakInfo(await readStreak(deps, uid), counted);
  return assemble(deps, postId, uid, p, streak);
};

/**
 * Verifies and finalizes a solve (spec 5.3). The client's placements are checked
 * against the snapshot's solution and every clue is recomputed; nothing the
 * client reports about time is used. `hSetNX solvedAt` makes the finalization
 * happen exactly once per user per post; a repeat returns the stored result.
 * Snoovatar and flair failures are logged and never fail the solve.
 */
export const chart = async (
  deps: Deps,
  postId: string,
  uid: string,
  username: string,
  req: ChartRequest
): Promise<ChartOutcome> => {
  const snap = await loadSnapshot(deps, postId);
  if (!snap) return { kind: 'not-found' };
  if (!validatePlacement(snap, req.placements).ok) return { kind: 'invalid' };
  if (
    !samePlacement(req.placements, snap.solution, snap.landmarks) ||
    !allCluesLit(toPuzzle(snap), req.placements)
  ) {
    return { kind: 'mismatch' };
  }

  const startedAt = await ensureStarted(deps, postId, uid);
  const now = deps.now();
  const userKey = keys.user(postId, uid);
  const claimed = await deps.redis.hSetNX(userKey, F.solvedAt, String(now));
  if (claimed === 0) {
    const p = await readProgress(deps, postId, uid);
    const result = await buildResult(deps, postId, uid, p, snap);
    return { kind: 'ok', result, stats: await readStats(deps, postId) };
  }

  const elapsedMs = Math.max(0, now - startedAt);
  await deps.redis.hSet(userKey, {
    [F.elapsedMs]: String(elapsedMs),
    [F.corrections]: String(req.corrections),
    [F.history]: req.history,
    [F.placements]: JSON.stringify(req.placements),
  });
  await recordTime(deps, postId, uid, elapsedMs, req.corrections === 0);
  await deps.redis.zAdd(keys.settlers(postId), { member: uid, score: now });

  if (username !== '') {
    try {
      await resolveSnoovatar(deps, uid, username);
    } catch (err) {
      console.error(`chart: snoovatar lookup failed for ${uid}`, err);
    }
  }

  const event = solveEvent(snap, now, req.corrections);
  const next = applySolve(await readStreak(deps, uid), event);
  await writeStreak(deps, uid, next);
  const counted = isCounted(event);
  const info = toStreakInfo(next, counted);
  if (counted && username !== '') {
    try {
      await applyFlair(deps, uid, username, info);
    } catch (err) {
      console.error(`chart: flair update failed for ${uid}`, err);
    }
  }

  const stats = await readStats(deps, postId);
  const p = await readProgress(deps, postId, uid);
  const result = await assemble(deps, postId, uid, p, info);
  return { kind: 'ok', result, stats };
};
