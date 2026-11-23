import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LandmarkId } from '../../shared/puzzle/types';
import { makeDeps } from '../fakes';
import { keys } from '../keys';
import { FIXTURE_PRACTICE, FIXTURE_SCHEDULE } from '../puzzles/fixture';
import {
  FALLBACK_TEXT,
  POST_FLAIR_TEXT,
  RESULTS_HEADER,
  pinResults,
  postIsland,
  postPractice,
  postTitle,
  postToday,
  postUrl,
  submitIsland,
} from './posting';
import { loadSnapshot, toPostData } from './snapshot';

const DAY = 24 * 3600 * 1000;
const first = FIXTURE_SCHEDULE.entries[0];
const practice = FIXTURE_PRACTICE.entries[0];
if (!first || !practice) throw new Error('fixture missing');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('postTitle / postUrl', () => {
  it('formats dated and practice titles', () => {
    expect(postTitle(first)).toBe('Cartographer #1 · Thistle Reach · Easy');
    expect(postTitle(practice)).toBe('Cartographer practice · Ember Shoal');
  });

  it('labels a dated 9-landmark island as an Expedition (spec 2.5)', () => {
    const nine: LandmarkId[] = [
      'lighthouse',
      'windmill',
      'harbor',
      'fort',
      'temple',
      'well',
      'farm',
      'cave',
      'mine',
    ];
    expect(postTitle({ ...first, landmarks: nine, difficulty: 'hard' })).toBe(
      'Cartographer #1 · Thistle Reach · Hard · Expedition'
    );
    expect(postTitle({ ...practice, landmarks: nine })).toBe('Cartographer practice · Ember Shoal');
    expect(postTitle({ ...first, landmarks: nine.slice(0, 8) })).toBe('Cartographer #1 · Thistle Reach · Easy');
  });

  it('builds the post URL without the thing prefix', () => {
    expect(postUrl('cartographer_test', 't3_1abc')).toBe(
      'https://www.reddit.com/r/cartographer_test/comments/1abc'
    );
  });
});

describe('postToday', () => {
  it('posts a fresh day with snapshot, marker and stickied results comment', async () => {
    const deps = makeDeps();
    const result = await postToday(deps);
    expect(result).toEqual({ status: 'posted', postId: 't3_1', date: '2026-12-01' });

    expect(deps.reddit.posts).toHaveLength(1);
    expect(deps.reddit.posts[0]).toEqual({
      id: 't3_1',
      subredditName: 'cartographer_test',
      title: 'Cartographer #1 · Thistle Reach · Easy',
      entry: 'default',
      postData: toPostData(first),
      textFallback: { text: FALLBACK_TEXT },
      flairText: POST_FLAIR_TEXT,
    });

    const snap = await loadSnapshot(deps, 't3_1');
    expect(snap).toEqual({ ...first, postedAt: deps.clock.now, postId: 't3_1' });
    expect(await deps.redis.get(keys.posted('2026-12-01'))).toBe('t3_1');

    expect(deps.reddit.comments).toHaveLength(1);
    expect(deps.reddit.comments[0]).toMatchObject({
      parentId: 't3_1',
      text: RESULTS_HEADER,
      runAs: 'APP',
      sticky: true,
      distinguished: true,
    });
    expect(await deps.redis.get(keys.results('t3_1'))).toBe(deps.reddit.comments[0]?.id);
  });

  it('is idempotent for the day', async () => {
    const deps = makeDeps();
    await postToday(deps);
    const again = await postToday(deps);
    expect(again).toEqual({ status: 'already', postId: 't3_1', date: '2026-12-01' });
    expect(deps.reddit.posts).toHaveLength(1);
  });

  it('reports a missing entry without posting', async () => {
    const deps = makeDeps({ now: Date.UTC(2026, 11, 3, 12) });
    expect(await postToday(deps)).toEqual({ status: 'missing', date: '2026-12-03' });
    expect(deps.reddit.posts).toHaveLength(0);
    expect(await deps.redis.exists(keys.posted('2026-12-03'))).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });

  it('leaves no marker on a submit failure so the retry can recover', async () => {
    const deps = makeDeps();
    deps.reddit.failSubmitPost = true;
    await expect(postToday(deps)).rejects.toThrow();
    expect(await deps.redis.exists(keys.posted('2026-12-01'))).toBe(0);
    expect(deps.reddit.callsTo('submitCustomPost')).toHaveLength(2);

    deps.reddit.failSubmitPost = false;
    deps.clock.now += 15 * 60_000;
    expect(await postToday(deps)).toEqual({ status: 'posted', postId: 't3_1', date: '2026-12-01' });
  });

  it('retries once without flair when the flaired submit fails', async () => {
    const deps = makeDeps();
    deps.reddit.rejectFlairText = true;
    expect(await postToday(deps)).toMatchObject({ status: 'posted', postId: 't3_1' });
    const calls = deps.reddit.callsTo('submitCustomPost');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.args[0]).toMatchObject({ flairText: POST_FLAIR_TEXT });
    expect(calls[1]?.args[0]).not.toHaveProperty('flairText');
    expect(console.warn).toHaveBeenCalled();
  });

  it('still succeeds and keeps the day marker when the results comment fails', async () => {
    const deps = makeDeps();
    deps.reddit.failSubmitComment = true;
    expect(await postToday(deps)).toEqual({ status: 'posted', postId: 't3_1', date: '2026-12-01' });
    expect(await deps.redis.exists(keys.results('t3_1'))).toBe(0);
    expect(deps.reddit.comments).toHaveLength(0);
    expect(await deps.redis.get(keys.posted('2026-12-01'))).toBe('t3_1');
    expect(await loadSnapshot(deps, 't3_1')).toMatchObject({ postId: 't3_1' });
    expect(console.error).toHaveBeenCalled();

    // The retry task sees the marker and does not post a second island.
    deps.reddit.failSubmitComment = false;
    deps.clock.now += 15 * 60_000;
    expect(await postToday(deps)).toEqual({ status: 'already', postId: 't3_1', date: '2026-12-01' });
    expect(deps.reddit.posts).toHaveLength(1);
  });

  it('writes the snapshot and day marker before the results comment is submitted', async () => {
    const deps = makeDeps();
    const original = deps.reddit.submitComment.bind(deps.reddit);
    let markerAtComment: string | undefined;
    let snapshotAtComment = false;
    deps.reddit.submitComment = async (opts) => {
      markerAtComment = await deps.redis.get(keys.posted('2026-12-01'));
      snapshotAtComment = (await loadSnapshot(deps, 't3_1')) !== undefined;
      return original(opts);
    };

    expect(await postToday(deps)).toEqual({ status: 'posted', postId: 't3_1', date: '2026-12-01' });
    expect(markerAtComment).toBe('t3_1');
    expect(snapshotAtComment).toBe(true);
    expect(deps.reddit.comments).toHaveLength(1);
    expect(await deps.redis.get(keys.results('t3_1'))).toBe(deps.reddit.comments[0]?.id);
  });

  it('posts the second day on the next date', async () => {
    const deps = makeDeps();
    await postToday(deps);
    deps.clock.now += DAY;
    expect(await postToday(deps)).toEqual({ status: 'posted', postId: 't3_3', date: '2026-12-02' });
    expect(deps.reddit.posts[1]?.title).toBe('Cartographer #2 · Gull Hollow · Medium');
  });
});

describe('submitIsland / pinResults', () => {
  it('submitIsland resolves the subreddit from Reddit when the context header is missing', async () => {
    const deps = makeDeps({ ctx: { subredditName: undefined } });
    await submitIsland(deps, first);
    expect(deps.reddit.posts[0]?.subredditName).toBe('testsub');
    expect(deps.reddit.callsTo('getCurrentSubreddit')).toHaveLength(1);
  });

  it('submitIsland snapshots without touching markers or comments', async () => {
    const deps = makeDeps();
    expect(await submitIsland(deps, first)).toEqual({ postId: 't3_1' });
    expect(await loadSnapshot(deps, 't3_1')).toEqual({ ...first, postedAt: deps.clock.now, postId: 't3_1' });
    expect(deps.reddit.comments).toHaveLength(0);
    expect(await deps.redis.exists(keys.posted('2026-12-01'), keys.results('t3_1'))).toBe(0);
  });

  it('pinResults stickies the app comment and stores its id', async () => {
    const deps = makeDeps();
    const { postId } = await submitIsland(deps, first);
    expect(await pinResults(deps, postId)).toBe('t1_2');
    expect(deps.reddit.comments[0]).toMatchObject({
      parentId: 't3_1',
      text: RESULTS_HEADER,
      runAs: 'APP',
      sticky: true,
    });
    expect(await deps.redis.get(keys.results('t3_1'))).toBe('t1_2');
  });

  it('pinResults swallows comment failures', async () => {
    const deps = makeDeps();
    const { postId } = await submitIsland(deps, first);
    deps.reddit.failSubmitComment = true;
    expect(await pinResults(deps, postId)).toBeUndefined();
    expect(await deps.redis.exists(keys.results('t3_1'))).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('postIsland', () => {
  it('returns the post and comment ids and stamps postedAt from the clock', async () => {
    const deps = makeDeps({ now: 123_456 });
    const result = await postIsland(deps, practice);
    expect(result).toEqual({ postId: 't3_1', commentId: 't1_2' });
    expect(await loadSnapshot(deps, 't3_1')).toMatchObject({ postedAt: 123_456, date: null });
  });

  it('reports an undefined comment id when the comment fails', async () => {
    const deps = makeDeps();
    deps.reddit.failSubmitComment = true;
    expect(await postIsland(deps, first)).toEqual({ postId: 't3_1', commentId: undefined });
  });
});

describe('postPractice', () => {
  it('posts practice islands from a counter and never writes a day marker', async () => {
    const deps = makeDeps();
    expect(await postPractice(deps)).toEqual({ postId: 't3_1' });
    expect(deps.reddit.posts[0]?.title).toBe('Cartographer practice · Ember Shoal');
    expect(deps.reddit.posts[0]?.postData).toEqual(toPostData(practice));
    expect(await deps.redis.get(keys.practiceNext())).toBe('1');
    expect(await loadSnapshot(deps, 't3_1')).toMatchObject({ date: null, number: 0 });
    expect(await deps.redis.exists(keys.posted('2026-12-01'))).toBe(0);

    expect(await postPractice(deps)).toEqual({ postId: 't3_3' });
    expect(await deps.redis.get(keys.practiceNext())).toBe('2');
    expect(deps.reddit.posts[1]?.title).toBe('Cartographer practice · Ember Shoal');
  });

  it('rejects when the practice pool is empty', async () => {
    const deps = makeDeps({ practice: { version: 1, masterSeed: 0, entries: [] } });
    await expect(postPractice(deps)).rejects.toThrow();
    expect(deps.reddit.posts).toHaveLength(0);
  });
});
