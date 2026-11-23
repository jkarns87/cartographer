import type { Deps } from '../deps';
import { markSubscribePromptSeen } from './progress';

export type SubscribeOutcome = { kind: 'ok' } | { kind: 'forbidden' };

/**
 * Reddit's refusal to act as the player. `subscribeToCurrentSubreddit` always runs as the user,
 * and until an app version is published and approved for user actions Reddit grants that only to
 * the app owner (Devvit docs, "User actions", "Differences during playtesting"). Seen in playtest
 * on 2026-11-23 with a non-owner account as
 * `2 UNKNOWN: permission not granted for [SUBSCRIBE_TO_SUBREDDIT]`.
 */
export const isUserActionDenied = (err: unknown): boolean =>
  err instanceof Error && /permission not granted/i.test(err.message);

/**
 * Subscribes the player to the subreddit and remembers that Join was used on this island.
 * A refusal is reported, not thrown, so the client can send the player to the subreddit page;
 * the prompt stays unseen because nothing was done. Any other failure propagates as a 500.
 */
export const subscribe = async (
  deps: Deps,
  postId: string,
  uid: string
): Promise<SubscribeOutcome> => {
  try {
    await deps.reddit.subscribeToCurrentSubreddit();
  } catch (err) {
    if (isUserActionDenied(err)) {
      console.warn(
        'subscribe: Reddit refused to act as the user; the app is not approved yet'
      );
      return { kind: 'forbidden' };
    }
    throw err;
  }
  await markSubscribePromptSeen(deps, postId, uid);
  return { kind: 'ok' };
};
