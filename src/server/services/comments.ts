import { chartCardText } from '../../shared/card';
import type { Deps } from '../deps';
import { isCommentId } from '../deps';
import { keys } from '../keys';
import { F, elapsedOf, readProgress } from './progress';
import { loadSnapshot } from './snapshot';
import { readStreak } from './streaks';

/** The fixed card text (spec 5.8). One implementation, shared with the client's share sheet. */
export { chartCardText };

/**
 * Per-user hash field used as an atomic claim so a double tap cannot post two
 * replies. Incremented before submitting; released (decremented) when this
 * request does not end up posting.
 */
const COMMENT_CLAIM = 'commentClaim';

export type PostChartOutcome = { kind: 'ok'; commentId: string } | { kind: 'already' } | { kind: 'not-ready' };

/**
 * "Post my chart" (spec 5.8): replies under the stickied results comment as the
 * user with the fixed card text, then sets `commented`. Not ready until the user
 * has solved and the results comment exists. A Reddit failure propagates to the
 * caller with the claim released, so the user can retry.
 */
export const postChart = async (deps: Deps, postId: string, uid: string): Promise<PostChartOutcome> => {
  const p = await readProgress(deps, postId, uid);
  if (p.solvedAt === null) return { kind: 'not-ready' };
  if (p.commented) return { kind: 'already' };

  const resultsId = await deps.redis.get(keys.results(postId));
  if (resultsId === undefined || !isCommentId(resultsId)) return { kind: 'not-ready' };
  const snap = await loadSnapshot(deps, postId);
  if (!snap) return { kind: 'not-ready' };

  const userKey = keys.user(postId, uid);
  const release = async (): Promise<void> => {
    await deps.redis.hIncrBy(userKey, COMMENT_CLAIM, -1);
  };
  if ((await deps.redis.hIncrBy(userKey, COMMENT_CLAIM, 1)) !== 1) {
    await release();
    return { kind: 'already' };
  }

  let commentId: string;
  try {
    const streak = await readStreak(deps, uid);
    const text = chartCardText({
      number: snap.number,
      name: snap.name,
      history: p.history,
      elapsedMs: elapsedOf(p),
      corrections: p.corrections,
      streakCurrent: streak.current,
      practice: snap.date === null,
    });
    const comment = await deps.reddit.submitComment({ id: resultsId, text, runAs: 'USER' });
    commentId = comment.id;
  } catch (err) {
    // A failed release must not replace the Reddit error the caller needs to see.
    try {
      await release();
    } catch (releaseErr) {
      console.error(`postChart: claim release failed for ${uid}`, releaseErr);
    }
    throw err;
  }
  // The claim stays held from here on, so even a failed flag write cannot lead to a second reply.
  await deps.redis.hSet(userKey, { [F.commented]: '1' });
  return { kind: 'ok', commentId };
};
