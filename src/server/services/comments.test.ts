import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartCardText as sharedChartCardText } from '../../shared/card';
import type { ScheduleEntry } from '../../shared/puzzle/types';
import { makeDeps } from '../fakes';
import type { TestDeps } from '../fakes';
import { keys } from '../keys';
import { FIXTURE_PRACTICE, FIXTURE_SCHEDULE } from '../puzzles/fixture';
import { chartCardText, postChart } from './comments';
import { postIsland } from './posting';
import { readProgress } from './progress';
import { writeStreak } from './streaks';

const dated = FIXTURE_SCHEDULE.entries[0];
const practice = FIXTURE_PRACTICE.entries[0];
if (!dated || !practice) throw new Error('fixture missing');

const UID = 't2_u1';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('chartCardText', () => {
  const base = {
    number: 12,
    name: 'Thistle Reach',
    history: 'PPPLPPPPP',
    elapsedMs: 252_000,
    corrections: 1,
    streakCurrent: 7,
    practice: false,
  };

  it('is the shared implementation, re-exported', () => {
    expect(chartCardText).toBe(sharedChartCardText);
  });

  it('renders the streak line', () => {
    expect(chartCardText(base)).toBe('Cartographer #12 · Thistle Reach\n📍📍📍↩📍📍📍📍📍  4:12\n7-day streak');
  });

  it('renders Clean chart for zero corrections on a streak of one or less', () => {
    expect(chartCardText({ ...base, history: 'PPPPPPP', corrections: 0, streakCurrent: 1, elapsedMs: 61_000 })).toBe(
      'Cartographer #12 · Thistle Reach\n📍📍📍📍📍📍📍  1:01\nClean chart'
    );
  });

  it('omits the third line for practice islands', () => {
    expect(chartCardText({ ...base, practice: true, number: 0, name: 'Ember Shoal' })).toBe(
      'Cartographer practice · Ember Shoal\n📍📍📍↩📍📍📍📍📍  4:12'
    );
  });

  it('truncates the pin line after 24 symbols', () => {
    expect(chartCardText({ ...base, history: `${'P'.repeat(24)}LP` })).toBe(
      `Cartographer #12 · Thistle Reach\n${'📍'.repeat(24)}…  4:12\n7-day streak`
    );
  });
});

/** Posts `entry` and writes a finished solve for UID directly into the user hash. */
const solved = async (
  deps: TestDeps,
  entry: ScheduleEntry = dated,
  fields: Record<string, string> = {}
): Promise<string> => {
  const { postId } = await postIsland(deps, entry);
  await deps.redis.hSet(keys.user(postId, UID), {
    startedAt: '1000',
    solvedAt: '96000',
    elapsedMs: '95000',
    history: 'PPPLPPPPP',
    corrections: '1',
    ...fields,
  });
  return postId;
};

describe('postChart', () => {
  it('replies to the results comment as the user with the fixed card and marks commented', async () => {
    const deps = makeDeps();
    await writeStreak(deps, UID, { current: 4, best: 4, lastDate: '2026-12-01', cleanRun: 0, total: 4 });
    const postId = await solved(deps);
    const resultsId = await deps.redis.get(keys.results(postId));

    const out = await postChart(deps, postId, UID);
    const reply = deps.reddit.comments.at(-1);
    expect(out).toEqual({ kind: 'ok', commentId: reply?.id });
    expect(reply).toMatchObject({
      parentId: resultsId,
      runAs: 'USER',
      text: 'Cartographer #1 · Thistle Reach\n📍📍📍↩📍📍📍📍📍  1:35\n4-day streak',
    });
    expect((await readProgress(deps, postId, UID)).commented).toBe(true);
  });

  it('posts the practice card without a streak line', async () => {
    const deps = makeDeps();
    const postId = await solved(deps, practice, { corrections: '0', history: 'PPPPPPP' });
    const out = await postChart(deps, postId, UID);
    expect(out.kind).toBe('ok');
    expect(deps.reddit.comments.at(-1)?.text).toBe('Cartographer practice · Ember Shoal\n📍📍📍📍📍📍📍  1:35');
  });

  it('refuses a second post', async () => {
    const deps = makeDeps();
    const postId = await solved(deps);
    await postChart(deps, postId, UID);
    expect(await postChart(deps, postId, UID)).toEqual({ kind: 'already' });
    expect(deps.reddit.callsTo('submitComment')).toHaveLength(2); // results header + one reply
  });

  it('refuses a concurrent second post while the first is in flight', async () => {
    const deps = makeDeps();
    const postId = await solved(deps);
    const [a, b] = await Promise.all([postChart(deps, postId, UID), postChart(deps, postId, UID)]);
    expect([a.kind, b.kind].sort()).toEqual(['already', 'ok']);
    expect(deps.reddit.comments.filter((c) => c.runAs === 'USER')).toHaveLength(1);
  });

  it('is not ready before the user has solved', async () => {
    const deps = makeDeps();
    const { postId } = await postIsland(deps, dated);
    expect(await postChart(deps, postId, UID)).toEqual({ kind: 'not-ready' });
    expect(deps.reddit.comments.filter((c) => c.runAs === 'USER')).toHaveLength(0);
  });

  it('is not ready when the results comment is missing or malformed', async () => {
    const deps = makeDeps();
    const postId = await solved(deps);
    await deps.redis.del(keys.results(postId));
    expect(await postChart(deps, postId, UID)).toEqual({ kind: 'not-ready' });
    await deps.redis.set(keys.results(postId), 't3_notacomment');
    expect(await postChart(deps, postId, UID)).toEqual({ kind: 'not-ready' });
    expect(deps.reddit.comments.filter((c) => c.runAs === 'USER')).toHaveLength(0);
  });

  it('propagates a submit failure without marking commented, and a retry can succeed', async () => {
    const deps = makeDeps();
    const postId = await solved(deps);
    deps.reddit.failSubmitComment = true;
    await expect(postChart(deps, postId, UID)).rejects.toThrow();
    expect((await readProgress(deps, postId, UID)).commented).toBe(false);

    deps.reddit.failSubmitComment = false;
    expect((await postChart(deps, postId, UID)).kind).toBe('ok');
  });
});
