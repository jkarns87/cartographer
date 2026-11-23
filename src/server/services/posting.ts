import {
  DIFFICULTY_LABEL,
  EXPEDITION_LANDMARKS,
} from '../../shared/puzzle/types';
import type { ScheduleEntry } from '../../shared/puzzle/types';
import type { Deps, PostId, PostLike, SubmitCustomPostLike } from '../deps';
import { keys } from '../keys';
import { POST_FLAIR_TEXT, ensurePostFlairTemplate } from './flair';
import { entryForDate, practiceEntry, utcDate } from './schedule';
import { saveSnapshot, toPostData } from './snapshot';
import { resolveSubredditName } from './subreddit';

export const RESULTS_HEADER =
  'Results thread. Finish the island and tap Post my chart in the game to add yours.';
export const FALLBACK_TEXT =
  'Cartographer is a daily island deduction game. Open this post in the Reddit app or on new Reddit to play.';
export { POST_FLAIR_TEXT };

/** Spec 2.5: the Sunday 9-landmark dated islands are labeled Expedition. */
export const isExpedition = (
  entry: Pick<ScheduleEntry, 'date' | 'landmarks'>
): boolean =>
  entry.date !== null && entry.landmarks.length === EXPEDITION_LANDMARKS;

export const postTitle = (entry: ScheduleEntry): string =>
  entry.date === null
    ? `Cartographer practice · ${entry.name}`
    : `Cartographer #${entry.number} · ${entry.name} · ${DIFFICULTY_LABEL[entry.difficulty]}` +
      (isExpedition(entry) ? ' · Expedition' : '');

export const postUrl = (subredditName: string, postId: string): string =>
  `https://www.reddit.com/r/${subredditName}/comments/${postId.replace(/^t3_/, '')}`;

/**
 * Submits the custom post with the "Daily Island" flair template when one can be
 * ensured (plain otherwise, retrying once without flair if the flaired
 * submit throws) and snapshots the entry under the new post ID. Spec 5.7 step 1.
 */
export const submitIsland = async (
  deps: Deps,
  entry: ScheduleEntry
): Promise<{ postId: PostId }> => {
  const subredditName = await resolveSubredditName(deps);
  const base: SubmitCustomPostLike = {
    subredditName,
    title: postTitle(entry),
    entry: 'default',
    postData: toPostData(entry),
    textFallback: { text: FALLBACK_TEXT },
  };
  let flairId: string | undefined;
  try {
    flairId = await ensurePostFlairTemplate(deps, subredditName);
  } catch (err) {
    console.warn(
      `submitIsland: no post flair template for ${entry.id}, posting without flair`,
      err
    );
  }
  let post: PostLike;
  if (flairId === undefined) {
    post = await deps.reddit.submitCustomPost(base);
  } else {
    try {
      post = await deps.reddit.submitCustomPost({
        ...base,
        flairId,
        flairText: POST_FLAIR_TEXT,
      });
    } catch (err) {
      console.warn(
        `submitIsland: submit with flair failed for ${entry.id}, retrying without`,
        err
      );
      post = await deps.reddit.submitCustomPost(base);
    }
  }
  await saveSnapshot(deps, { ...entry, postedAt: deps.now(), postId: post.id });
  return { postId: post.id };
};

/**
 * Posts and stickies the app's results comment and stores its ID. Failures are
 * logged and swallowed; the post is already live. Spec 5.7 last step.
 */
export const pinResults = async (
  deps: Deps,
  postId: PostId
): Promise<string | undefined> => {
  try {
    const comment = await deps.reddit.submitComment({
      id: postId,
      text: RESULTS_HEADER,
      runAs: 'APP',
    });
    await comment.distinguish(true);
    await deps.redis.set(keys.results(postId), comment.id);
    return comment.id;
  } catch (err) {
    console.error(`pinResults: results comment failed for ${postId}`, err);
    return undefined;
  }
};

export type PostIslandResult = {
  postId: string;
  commentId: string | undefined;
};

/** Undated posting (practice): submit, snapshot, then pin the results comment. */
export const postIsland = async (
  deps: Deps,
  entry: ScheduleEntry
): Promise<PostIslandResult> => {
  const { postId } = await submitIsland(deps, entry);
  const commentId = await pinResults(deps, postId);
  return { postId, commentId };
};

export type PostTodayResult = {
  status: 'posted' | 'already' | 'missing';
  postId?: string;
  date: string;
};

/**
 * Cron and menu entry point. Idempotent per UTC day. Order per spec 5.7:
 * submit, snapshot, write `posted:<date>`, then pin the results comment, so a
 * request that dies after the submit can never let the retry post a second
 * island for the day. The marker is never written when the submit fails.
 */
export const postToday = async (deps: Deps): Promise<PostTodayResult> => {
  const date = utcDate(deps.now());
  const marker = keys.posted(date);
  const existing = await deps.redis.get(marker);
  if (existing !== undefined)
    return { status: 'already', postId: existing, date };

  const entry = entryForDate(deps.schedule, date);
  if (!entry) {
    console.error(`postToday: no schedule entry for ${date}`);
    return { status: 'missing', date };
  }

  const { postId } = await submitIsland(deps, entry);
  await deps.redis.set(marker, postId);
  await pinResults(deps, postId);
  return { status: 'posted', postId, date };
};

/** Posts the next practice island, cycling through the pool with a counter. */
export const postPractice = async (deps: Deps): Promise<{ postId: string }> => {
  const next = await deps.redis.incrBy(keys.practiceNext(), 1);
  const entry = practiceEntry(deps.practice, next - 1);
  if (!entry) throw new Error('postPractice: the practice pool is empty');
  const { postId } = await postIsland(deps, entry);
  return { postId };
};
