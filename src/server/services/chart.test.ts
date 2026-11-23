import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartRequest } from '../../shared/api';
import type { Placement, ScheduleEntry } from '../../shared/puzzle/types';
import { FIXTURE_NOW, makeDeps } from '../fakes';
import type { TestDeps } from '../fakes';
import { keys, SNOO_TTL_SECONDS } from '../keys';
import { FIXTURE_PRACTICE, FIXTURE_SCHEDULE } from '../puzzles/fixture';
import { buildResult, chart } from './chart';
import { postIsland } from './posting';
import { ensureStarted, readProgress } from './progress';
import { loadSnapshot } from './snapshot';
import { readStreak, writeStreak } from './streaks';

const DAY = 24 * 3600 * 1000;
const dated = FIXTURE_SCHEDULE.entries[0];
const practice = FIXTURE_PRACTICE.entries[0];
if (!dated || !practice) throw new Error('fixture missing');

const UID = 't2_u1';
const NAME = 'tester';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const post = async (deps: TestDeps, entry: ScheduleEntry = dated): Promise<string> => {
  const { postId } = await postIsland(deps, entry);
  deps.ctxState.postId = postId;
  return postId;
};

const solve = (entry: ScheduleEntry = dated, over: Partial<ChartRequest> = {}): ChartRequest => ({
  placements: { ...entry.solution },
  history: 'PPPPPPP',
  corrections: 0,
  ...over,
});

/** Swaps two landmarks: still a complete, valid placement, but not the solution. */
const swapped = (entry: ScheduleEntry): Placement => {
  const [a, b] = entry.landmarks;
  if (!a || !b) throw new Error('fixture too small');
  return { ...entry.solution, [a]: entry.solution[b], [b]: entry.solution[a] };
};

describe('chart', () => {
  it('finalizes a first correct solve with every side effect', async () => {
    const deps = makeDeps();
    deps.reddit.snoovatars[NAME] = 'https://i.redd.it/me.png';
    const postId = await post(deps);
    await ensureStarted(deps, postId, UID);
    deps.clock.now = FIXTURE_NOW + 95_000;

    const out = await chart(deps, postId, UID, NAME, solve());
    expect(out).toEqual({
      kind: 'ok',
      result: {
        elapsedMs: 95_000,
        corrections: 0,
        history: 'PPPPPPP',
        rank: 1,
        total: 1,
        streak: {
          current: 1,
          best: 1,
          cleanRun: 1,
          total: 1,
          tier: 'deckhand',
          steadyHand: false,
          counted: true,
        },
        commented: false,
        subscribePromptSeen: false,
      },
      stats: { started: 1, charted: 1, cleanPct: 100, medianMs: 95_000 },
    });

    const userKey = keys.user(postId, UID);
    expect(await deps.redis.hGetAll(userKey)).toEqual({
      startedAt: String(FIXTURE_NOW),
      solvedAt: String(FIXTURE_NOW + 95_000),
      elapsedMs: '95000',
      corrections: '0',
      history: 'PPPPPPP',
      placements: JSON.stringify(dated.solution),
    });
    expect(await deps.redis.zScore(keys.times(postId), UID)).toBe(95_000);
    expect(await deps.redis.zScore(keys.settlers(postId), UID)).toBe(FIXTURE_NOW + 95_000);
    expect(await deps.redis.get(keys.snoo(UID))).toBe('https://i.redd.it/me.png');
    expect(deps.redis.ttls.get(keys.snoo(UID))).toBe(SNOO_TTL_SECONDS);
    expect(await readStreak(deps, UID)).toEqual({
      current: 1,
      best: 1,
      lastDate: '2026-12-01',
      cleanRun: 1,
      total: 1,
    });
    expect(deps.reddit.setFlairs).toHaveLength(1);
    expect(deps.reddit.setFlairs[0]).toMatchObject({
      subredditName: 'cartographer_test',
      username: NAME,
      text: 'Deckhand · 1d',
    });
    expect(await deps.redis.get(keys.flair(UID))).toBe('Deckhand · 1d');
  });

  it('counts a solve with corrections as charted but not clean', async () => {
    const deps = makeDeps();
    const postId = await post(deps);
    await ensureStarted(deps, postId, UID);
    deps.clock.now += 30_000;
    const out = await chart(deps, postId, UID, NAME, solve(dated, { corrections: 2, history: 'PPLPPPPPP' }));
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.result.corrections).toBe(2);
    expect(out.result.history).toBe('PPLPPPPPP');
    expect(out.result.streak.cleanRun).toBe(0);
    expect(out.stats).toEqual({ started: 1, charted: 1, cleanPct: 0, medianMs: 30_000 });
  });

  it('starts the timer at chart time when the game was never opened', async () => {
    const deps = makeDeps();
    const postId = await post(deps);
    const out = await chart(deps, postId, UID, NAME, solve());
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.result.elapsedMs).toBe(0);
    expect(out.stats.started).toBe(1);
    expect(out.stats.medianMs).toBeNull();
  });

  it('returns not-found for a post without a snapshot', async () => {
    expect(await chart(makeDeps(), 't3_missing', UID, NAME, solve())).toEqual({ kind: 'not-found' });
  });

  it('rejects a placement missing a landmark, on water, or doubled up as invalid', async () => {
    const deps = makeDeps();
    const postId = await post(deps);
    const missing: Placement = { ...dated.solution };
    delete missing.fort;
    expect(await chart(deps, postId, UID, NAME, solve(dated, { placements: missing }))).toEqual({
      kind: 'invalid',
    });
    const water = { ...dated.solution, fort: { r: 0, c: 0 } };
    expect(await chart(deps, postId, UID, NAME, solve(dated, { placements: water }))).toEqual({
      kind: 'invalid',
    });
    const doubled = { ...dated.solution, fort: dated.solution.windmill };
    expect(await chart(deps, postId, UID, NAME, solve(dated, { placements: doubled }))).toEqual({
      kind: 'invalid',
    });
    expect(await deps.redis.hGet(keys.user(postId, UID), 'solvedAt')).toBeUndefined();
  });

  it('rejects a complete wrong placement as a mismatch without side effects', async () => {
    const deps = makeDeps();
    const postId = await post(deps);
    const out = await chart(deps, postId, UID, NAME, solve(dated, { placements: swapped(dated) }));
    expect(out).toEqual({ kind: 'mismatch' });
    expect(await deps.redis.hGet(keys.user(postId, UID), 'solvedAt')).toBeUndefined();
    expect(await deps.redis.zCard(keys.times(postId))).toBe(0);
    expect(await deps.redis.zCard(keys.settlers(postId))).toBe(0);
    expect(await readStreak(deps, UID)).toMatchObject({ total: 0 });
  });

  it('returns the stored result on a double submit and counts nothing twice', async () => {
    const deps = makeDeps();
    const postId = await post(deps);
    await ensureStarted(deps, postId, UID);
    deps.clock.now += 42_000;
    const first = await chart(deps, postId, UID, NAME, solve());

    deps.clock.now += 600_000;
    const second = await chart(deps, postId, UID, NAME, solve(dated, { corrections: 5, history: 'PLPLPPPPPPP' }));
    expect(second).toEqual(first);
    if (second.kind !== 'ok') throw new Error('expected ok');
    expect(second.result.elapsedMs).toBe(42_000);
    expect(second.result.corrections).toBe(0);
    expect(second.stats.charted).toBe(1);
    expect(await deps.redis.zCard(keys.times(postId))).toBe(1);
    expect(await deps.redis.zScore(keys.settlers(postId), UID)).toBe(FIXTURE_NOW + 42_000);
    expect((await readStreak(deps, UID)).total).toBe(1);
    expect(deps.reddit.setFlairs).toHaveLength(1);
    expect(deps.reddit.callsTo('getSnoovatarUrl')).toHaveLength(1);
  });

  it('skips flair and leaves current alone for a solve more than 24 hours after posting', async () => {
    const deps = makeDeps();
    const postId = await post(deps);
    await ensureStarted(deps, postId, UID);
    deps.clock.now = FIXTURE_NOW + DAY + 1;
    const out = await chart(deps, postId, UID, NAME, solve());
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.result.streak).toMatchObject({ current: 0, total: 1, counted: false, tier: 'deckhand' });
    expect(deps.reddit.setFlairs).toHaveLength(0);
    expect(deps.reddit.callsTo('getCurrentUser')).toHaveLength(0);
    expect(await readStreak(deps, UID)).toEqual({
      current: 0,
      best: 0,
      lastDate: null,
      cleanRun: 0,
      total: 1,
    });
  });

  it('never touches streak fields other than total on a practice island', async () => {
    const deps = makeDeps();
    const before = { current: 3, best: 5, lastDate: '2026-11-30', cleanRun: 2, total: 10 };
    await writeStreak(deps, UID, before);
    const postId = await post(deps, practice);
    await ensureStarted(deps, postId, UID);
    deps.clock.now += 20_000;
    const out = await chart(deps, postId, UID, NAME, solve(practice, { corrections: 0 }));
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(await readStreak(deps, UID)).toEqual({ ...before, total: 11 });
    expect(out.result.streak).toMatchObject({ current: 3, best: 5, cleanRun: 2, total: 11, counted: false });
    expect(deps.reddit.setFlairs).toHaveLength(0);
  });

  it('extends the streak from the previous day', async () => {
    const deps = makeDeps({ now: Date.UTC(2026, 11, 2, 12) });
    await writeStreak(deps, UID, { current: 2, best: 2, lastDate: '2026-12-01', cleanRun: 2, total: 2 });
    const second = FIXTURE_SCHEDULE.entries[1];
    if (!second) throw new Error('fixture missing');
    const postId = await post(deps, second);
    await ensureStarted(deps, postId, UID);
    deps.clock.now += 60_000;
    const out = await chart(deps, postId, UID, NAME, solve(second));
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.result.streak).toMatchObject({ current: 3, best: 3, cleanRun: 3, tier: 'navigator', counted: true });
    expect(deps.reddit.setFlairs[0]?.text).toBe('Navigator · 3d');
  });

  it('still succeeds when the flair write or snoovatar lookup fails', async () => {
    const deps = makeDeps();
    deps.reddit.setUserFlair = async () => {
      throw new Error('flair down');
    };
    deps.reddit.getSnoovatarUrl = async () => {
      throw new Error('snoovatar down');
    };
    const postId = await post(deps);
    await ensureStarted(deps, postId, UID);
    deps.clock.now += 50_000;
    const out = await chart(deps, postId, UID, NAME, solve());
    expect(out.kind).toBe('ok');
    expect(await deps.redis.get(keys.snoo(UID))).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('ranks later solvers by elapsed time', async () => {
    const deps = makeDeps();
    const postId = await post(deps);
    await ensureStarted(deps, postId, 't2_slow');
    await ensureStarted(deps, postId, 't2_fast');
    deps.clock.now += 20_000;
    await chart(deps, postId, 't2_fast', 'fast', solve());
    deps.clock.now += 100_000;
    const out = await chart(deps, postId, 't2_slow', 'slow', solve(dated, { corrections: 1 }));
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.result).toMatchObject({ elapsedMs: 120_000, rank: 2, total: 2 });
    expect(out.stats).toEqual({ started: 2, charted: 2, cleanPct: 50, medianMs: 70_000 });
  });
});

describe('buildResult', () => {
  it('rebuilds the stored result for GET routes', async () => {
    const deps = makeDeps();
    const postId = await post(deps);
    await ensureStarted(deps, postId, UID);
    deps.clock.now += 33_000;
    const out = await chart(deps, postId, UID, NAME, solve());
    if (out.kind !== 'ok') throw new Error('expected ok');
    await deps.redis.hSet(keys.user(postId, UID), { commented: '1', subscribePromptSeen: '1' });

    const snap = await loadSnapshot(deps, postId);
    if (!snap) throw new Error('snapshot missing');
    const p = await readProgress(deps, postId, UID);
    expect(await buildResult(deps, postId, UID, p, snap)).toEqual({
      ...out.result,
      commented: true,
      subscribePromptSeen: true,
    });
  });

  it('derives elapsed from solvedAt and startedAt when elapsedMs is not written yet', async () => {
    const deps = makeDeps();
    const postId = await post(deps);
    await deps.redis.hSet(keys.user(postId, UID), { startedAt: '1000', solvedAt: '26000' });
    const snap = await loadSnapshot(deps, postId);
    if (!snap) throw new Error('snapshot missing');
    const p = await readProgress(deps, postId, UID);
    expect((await buildResult(deps, postId, UID, p, snap)).elapsedMs).toBe(25_000);
  });
});
