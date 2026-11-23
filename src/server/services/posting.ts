import { DIFFICULTY_LABEL } from '../../shared/puzzle/types';
import type { ScheduleEntry } from '../../shared/puzzle/types';
import type { Deps, PostLike, SubmitCustomPostLike } from '../deps';
import { keys } from '../keys';
import { entryForDate, practiceEntry, utcDate } from './schedule';
import { saveSnapshot, toPostData } from './snapshot';

export const RESULTS_HEADER =
  'Results thread. Finish the island and tap Post my chart in the game to add yours.';
export const FALLBACK_TEXT =
  'Cartographer is a daily island deduction game. Open this post in the Reddit app or on new Reddit to play.';
export const POST_FLAIR_TEXT = 'Daily Island';

export const postTitle = (entry: ScheduleEntry): string =>
  entry.date === null
    ? `Cartographer practice · ${entry.name}`
    : `Cartographer #${entry.number} · ${entry.name} · ${DIFFICULTY_LABEL[entry.difficulty]}`;

export const postUrl = (subredditName: string, postId: string): string =>
  `https://www.reddit.com/r/${subredditName}/comments/${postId.replace(/^t3_/, '')}`;

export type PostIslandResult = { postId: string; commentId: string | undefined };

/** Submits the custom post, snapshots the entry, then tries to pin the results comment. */
export const postIsland = async (deps: Deps, entry: ScheduleEntry): Promise<PostIslandResult> => {
  const { subredditName } = deps.ctx();
  const base: SubmitCustomPostLike = {
    subredditName,
    title: postTitle(entry),
    entry: 'default',
    postData: toPostData(entry),
    textFallback: { text: FALLBACK_TEXT },
  };
  let post: PostLike;
  try {
    post = await deps.reddit.submitCustomPost({ ...base, flairText: POST_FLAIR_TEXT });
  } catch (err) {
    console.warn(`postIsland: submit with flair failed for ${entry.id}, retrying without`, err);
    post = await deps.reddit.submitCustomPost(base);
  }

  await saveSnapshot(deps, { ...entry, postedAt: deps.now(), postId: post.id });

  let commentId: string | undefined;
  try {
    const comment = await deps.reddit.submitComment({
      id: post.id,
      text: RESULTS_HEADER,
      runAs: 'APP',
    });
    await comment.distinguish(true);
    await deps.redis.set(keys.results(post.id), comment.id);
    commentId = comment.id;
  } catch (err) {
    console.error(`postIsland: results comment failed for ${post.id}`, err);
  }
  return { postId: post.id, commentId };
};

export type PostTodayResult = {
  status: 'posted' | 'already' | 'missing';
  postId?: string;
  date: string;
};

/** Cron and menu entry point. Idempotent per UTC day; the marker is written only after success. */
export const postToday = async (deps: Deps): Promise<PostTodayResult> => {
  const date = utcDate(deps.now());
  const marker = keys.posted(date);
  const existing = await deps.redis.get(marker);
  if (existing !== undefined) return { status: 'already', postId: existing, date };

  const entry = entryForDate(deps.schedule, date);
  if (!entry) {
    console.error(`postToday: no schedule entry for ${date}`);
    return { status: 'missing', date };
  }

  const { postId } = await postIsland(deps, entry);
  await deps.redis.set(marker, postId);
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
