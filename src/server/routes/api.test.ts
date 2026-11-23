import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartRequest } from '../../shared/api';
import type { Placement } from '../../shared/puzzle/types';
import { createApp } from '../app';
import { FIXTURE_NOW, makeDeps } from '../fakes';
import type { TestDeps } from '../fakes';
import { keys } from '../keys';
import { FIXTURE_SCHEDULE } from '../puzzles/fixture';
import { postIsland } from '../services/posting';
import { toPuzzle } from '../services/snapshot';
import type { Snapshot } from '../services/snapshot';

const entry = FIXTURE_SCHEDULE.entries[0];
if (!entry) throw new Error('fixture missing');

const UID = 't2_u1';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Res = { status: number; body: unknown };

const get = async (deps: TestDeps, path: string): Promise<Res> => {
  const res = await createApp(deps).request(path);
  return { status: res.status, body: await res.json() };
};

const post = async (deps: TestDeps, path: string, body?: unknown, raw?: string): Promise<Res> => {
  const res = await createApp(deps).request(path, {
    method: 'POST',
    body: raw ?? (body === undefined ? '{}' : JSON.stringify(body)),
    headers: { 'content-type': 'application/json' },
  });
  return { status: res.status, body: await res.json() };
};

/** Posts the fixture island and points the request context at it. */
const setup = async (): Promise<{ deps: TestDeps; postId: string }> => {
  const deps = makeDeps();
  const { postId } = await postIsland(deps, entry);
  deps.ctxState.postId = postId;
  return { deps, postId };
};

const logOut = (deps: TestDeps): void => {
  deps.ctxState.userId = undefined;
  deps.ctxState.username = undefined;
};

const solution = (): ChartRequest => ({ placements: { ...entry.solution }, history: 'PPPPPPP', corrections: 0 });

const swapped = (): Placement => ({
  ...entry.solution,
  lighthouse: entry.solution.windmill,
  windmill: entry.solution.lighthouse,
});

describe('every /api route', () => {
  const routes: Array<['GET' | 'POST', string]> = [
    ['GET', '/api/cover'],
    ['GET', '/api/game'],
    ['POST', '/api/place'],
    ['POST', '/api/chart'],
    ['POST', '/api/comment'],
    ['POST', '/api/subscribe'],
    ['POST', '/api/tutorial-seen'],
    ['GET', '/api/reveal'],
  ];

  it.each(routes)('%s %s is 400 invalid without a postId in context', async (method, path) => {
    const deps = makeDeps();
    const res = method === 'GET' ? await get(deps, path) : await post(deps, path, solution());
    expect(res).toEqual({ status: 400, body: { error: 'invalid' } });
  });

  it.each(routes.filter(([, path]) => path !== '/api/cover' && path !== '/api/reveal'))(
    '%s %s is 401 login when logged out',
    async (method, path) => {
      const { deps } = await setup();
      logOut(deps);
      const res = method === 'GET' ? await get(deps, path) : await post(deps, path, solution());
      expect(res).toEqual({ status: 401, body: { error: 'login' } });
    }
  );

  it('answers 500 server when a service throws', async () => {
    const { deps, postId } = await setup();
    await deps.redis.set(keys.puzzle(postId), '{"broken": true}');
    expect(await get(deps, '/api/cover')).toEqual({ status: 500, body: { error: 'server' } });
  });
});

describe('GET /api/cover', () => {
  it('is 404 for a post without a snapshot', async () => {
    const deps = makeDeps({ ctx: { postId: 't3_missing' } });
    expect(await get(deps, '/api/cover')).toEqual({ status: 404, body: { error: 'not-found' } });
  });

  it('works logged out', async () => {
    const { deps, postId } = await setup();
    logOut(deps);
    expect(await get(deps, '/api/cover')).toEqual({
      status: 200,
      body: {
        postId,
        island: {
          number: 1,
          name: 'Thistle Reach',
          difficulty: 'easy',
          land: entry.land,
          landmarkCount: 7,
          date: '2026-12-01',
        },
        stats: { started: 0, charted: 0, cleanPct: 0, medianMs: null },
        me: { loggedIn: false, status: 'unsolved' },
      },
    });
  });

  it('reports unsolved, then in-progress, then solved with the result', async () => {
    const { deps } = await setup();
    expect((await get(deps, '/api/cover')).body).toMatchObject({ me: { loggedIn: true, status: 'unsolved' } });

    await get(deps, '/api/game');
    const progress = await get(deps, '/api/cover');
    expect(progress.body).toMatchObject({ me: { loggedIn: true, status: 'in-progress' }, stats: { started: 1 } });
    expect(progress.body).not.toHaveProperty('me.result');

    deps.clock.now += 80_000;
    await post(deps, '/api/chart', solution());
    const done = await get(deps, '/api/cover');
    expect(done.body).toMatchObject({
      me: { loggedIn: true, status: 'solved', result: { elapsedMs: 80_000, rank: 1, total: 1 } },
      stats: { started: 1, charted: 1, cleanPct: 100, medianMs: 80_000 },
    });
  });
});

describe('GET /api/game', () => {
  it('is 404 for a post without a snapshot', async () => {
    const deps = makeDeps({ ctx: { postId: 't3_missing' } });
    expect(await get(deps, '/api/game')).toEqual({ status: 404, body: { error: 'not-found' } });
  });

  it('starts the timer once and returns the puzzle without the solution', async () => {
    const { deps, postId } = await setup();
    const first = await get(deps, '/api/game');
    expect(first).toEqual({
      status: 200,
      body: {
        postId,
        puzzle: toPuzzle({ ...entry, postedAt: FIXTURE_NOW, postId } satisfies Snapshot),
        placements: {},
        history: '',
        corrections: 0,
        startedAt: FIXTURE_NOW,
        serverNow: FIXTURE_NOW,
        status: 'in-progress',
        tutorialSeen: false,
      },
    });
    expect(JSON.stringify(first.body)).not.toContain('solution');
    expect(JSON.stringify(first.body)).not.toContain('postedAt');

    deps.clock.now += 5_000;
    const again = await get(deps, '/api/game');
    expect(again.body).toMatchObject({ startedAt: FIXTURE_NOW, serverNow: FIXTURE_NOW + 5_000 });
    expect(await deps.redis.hGet(keys.stats(postId), 'started')).toBe('1');
  });

  it('restores saved placements and the tutorial flag', async () => {
    const { deps } = await setup();
    await get(deps, '/api/game');
    await post(deps, '/api/place', { placements: { well: { r: 2, c: 1 } }, history: 'PLP', corrections: 1 });
    await post(deps, '/api/tutorial-seen');
    expect((await get(deps, '/api/game')).body).toMatchObject({
      placements: { well: { r: 2, c: 1 } },
      history: 'PLP',
      corrections: 1,
      status: 'in-progress',
      tutorialSeen: true,
    });
  });

  it('includes the result once solved', async () => {
    const { deps } = await setup();
    await get(deps, '/api/game');
    deps.clock.now += 61_000;
    await post(deps, '/api/chart', solution());
    const res = await get(deps, '/api/game');
    expect(res.body).toMatchObject({
      status: 'solved',
      placements: entry.solution,
      result: { elapsedMs: 61_000, corrections: 0, history: 'PPPPPPP', rank: 1, total: 1 },
    });
    expect(JSON.stringify(res.body)).not.toContain('solution');
  });
});

describe('POST /api/place', () => {
  it('is 404 for a post without a snapshot', async () => {
    const deps = makeDeps({ ctx: { postId: 't3_missing' } });
    expect(await post(deps, '/api/place', solution())).toEqual({ status: 404, body: { error: 'not-found' } });
  });

  it('saves a partial board', async () => {
    const { deps, postId } = await setup();
    const res = await post(deps, '/api/place', { placements: { farm: { r: 4, c: 1 } }, history: 'P', corrections: 0 });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(await deps.redis.hGet(keys.user(postId, UID), 'placements')).toBe('{"farm":{"r":4,"c":1}}');
  });

  it.each<[string, unknown]>([
    ['a landmark outside the puzzle', { placements: { mine: { r: 0, c: 2 } }, history: 'P', corrections: 0 }],
    ['an off-grid cell', { placements: { farm: { r: 6, c: 1 } }, history: 'P', corrections: 0 }],
    ['a non-integer cell', { placements: { farm: { r: 1.5, c: 1 } }, history: 'P', corrections: 0 }],
    ['a bad history', { placements: {}, history: 'PXL', corrections: 0 }],
    ['an overlong history', { placements: {}, history: 'P'.repeat(201), corrections: 0 }],
    ['negative corrections', { placements: {}, history: '', corrections: -1 }],
    ['corrections over 999', { placements: {}, history: '', corrections: 1000 }],
    ['a missing placements object', { history: '', corrections: 0 }],
  ])('is 400 invalid for %s', async (_label, body) => {
    const { deps } = await setup();
    expect(await post(deps, '/api/place', body)).toEqual({ status: 400, body: { error: 'invalid' } });
  });

  it('is 400 invalid for a body that is not JSON', async () => {
    const { deps } = await setup();
    expect(await post(deps, '/api/place', undefined, 'not json')).toEqual({
      status: 400,
      body: { error: 'invalid' },
    });
  });

  it('is ignored after the solve', async () => {
    const { deps, postId } = await setup();
    await get(deps, '/api/game');
    await post(deps, '/api/chart', solution());
    const res = await post(deps, '/api/place', { placements: {}, history: 'L', corrections: 9 });
    expect(res.status).toBe(200);
    expect(await deps.redis.hGet(keys.user(postId, UID), 'corrections')).toBeUndefined();
    expect((await get(deps, '/api/game')).body).toMatchObject({ corrections: 0, history: 'PPPPPPP' });
  });

  it('cannot change what GET /api/game returns even when it races past its solved check', async () => {
    const { deps } = await setup();
    await get(deps, '/api/game');
    deps.clock.now += 30_000;
    const realHGet = deps.redis.hGet.bind(deps.redis);
    let raced = false;
    deps.redis.hGet = async (key, field) => {
      const value = await realHGet(key, field);
      if (field === 'solvedAt' && !raced) {
        raced = true;
        // The chart lands between the /place solved check and its write.
        expect((await post(deps, '/api/chart', solution())).status).toBe(200);
      }
      return value;
    };
    const stale = { placements: { lighthouse: entry.solution.lighthouse }, history: 'PPLP', corrections: 1 };
    expect((await post(deps, '/api/place', stale)).status).toBe(200);
    expect(raced).toBe(true);

    const res = await get(deps, '/api/game');
    expect(res.body).toMatchObject({
      status: 'solved',
      placements: entry.solution,
      history: 'PPPPPPP',
      corrections: 0,
      result: { elapsedMs: 30_000, corrections: 0, history: 'PPPPPPP', rank: 1, total: 1 },
    });
  });
});

describe('POST /api/chart', () => {
  it('is 404 for a post without a snapshot', async () => {
    const deps = makeDeps({ ctx: { postId: 't3_missing' } });
    expect(await post(deps, '/api/chart', solution())).toEqual({ status: 404, body: { error: 'not-found' } });
  });

  it('is 200 with the result and stats, ignoring a client-reported time', async () => {
    const { deps } = await setup();
    await get(deps, '/api/game');
    deps.clock.now += 45_000;
    const res = await post(deps, '/api/chart', { ...solution(), elapsedMs: 1, startedAt: 0 });
    expect(res).toEqual({
      status: 200,
      body: {
        result: {
          elapsedMs: 45_000,
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
        stats: { started: 1, charted: 1, cleanPct: 100, medianMs: 45_000 },
      },
    });
  });

  it('is 400 invalid when the game was never opened, and 200 once it was', async () => {
    const { deps } = await setup();
    expect(await post(deps, '/api/chart', solution())).toEqual({ status: 400, body: { error: 'invalid' } });
    await get(deps, '/api/game');
    deps.clock.now += 20_000;
    const res = await post(deps, '/api/chart', solution());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ result: { elapsedMs: 20_000, rank: 1, total: 1 } });
  });

  it('is 409 mismatch for a complete wrong board', async () => {
    const { deps } = await setup();
    expect(await post(deps, '/api/chart', { ...solution(), placements: swapped() })).toEqual({
      status: 409,
      body: { error: 'mismatch' },
    });
  });

  it('is 400 invalid for an incomplete board or a malformed body', async () => {
    const { deps } = await setup();
    const incomplete: Placement = { ...entry.solution };
    delete incomplete.farm;
    expect(await post(deps, '/api/chart', { ...solution(), placements: incomplete })).toEqual({
      status: 400,
      body: { error: 'invalid' },
    });
    expect(await post(deps, '/api/chart', { ...solution(), corrections: 'none' })).toEqual({
      status: 400,
      body: { error: 'invalid' },
    });
    expect(await post(deps, '/api/chart', undefined, '{')).toEqual({ status: 400, body: { error: 'invalid' } });
  });

  it('returns the same result on a double submit', async () => {
    const { deps } = await setup();
    await get(deps, '/api/game');
    deps.clock.now += 30_000;
    const first = await post(deps, '/api/chart', solution());
    deps.clock.now += 30_000;
    const second = await post(deps, '/api/chart', solution());
    expect(second).toEqual(first);
  });
});

describe('POST /api/comment', () => {
  it('is 400 invalid before the solve', async () => {
    const { deps } = await setup();
    expect(await post(deps, '/api/comment')).toEqual({ status: 400, body: { error: 'invalid' } });
  });

  it('is 200 with the comment id, then 409 already', async () => {
    const { deps } = await setup();
    await get(deps, '/api/game');
    deps.clock.now += 75_000;
    await post(deps, '/api/chart', solution());
    const res = await post(deps, '/api/comment');
    const reply = deps.reddit.comments.at(-1);
    expect(res).toEqual({ status: 200, body: { ok: true, commentId: reply?.id } });
    expect(reply).toMatchObject({
      runAs: 'USER',
      text: 'Cartographer #1 · Thistle Reach\n📍📍📍📍📍📍📍  1:15\nClean chart',
    });
    expect(await post(deps, '/api/comment')).toEqual({ status: 409, body: { error: 'already' } });
    expect((await get(deps, '/api/game')).body).toMatchObject({ result: { commented: true } });
  });

  it('is 500 server when Reddit rejects the comment', async () => {
    const { deps } = await setup();
    await get(deps, '/api/game');
    await post(deps, '/api/chart', solution());
    deps.reddit.failSubmitComment = true;
    expect(await post(deps, '/api/comment')).toEqual({ status: 500, body: { error: 'server' } });
  });
});

describe('POST /api/subscribe', () => {
  it('subscribes and remembers that the prompt was seen', async () => {
    const { deps, postId } = await setup();
    expect(await post(deps, '/api/subscribe')).toEqual({ status: 200, body: { ok: true } });
    expect(deps.reddit.subscribeCalls).toBe(1);
    expect(await deps.redis.hGet(keys.user(postId, UID), 'subscribePromptSeen')).toBe('1');
    await get(deps, '/api/game');
    await post(deps, '/api/chart', solution());
    expect((await get(deps, '/api/cover')).body).toMatchObject({ me: { result: { subscribePromptSeen: true } } });
  });
});

describe('POST /api/tutorial-seen', () => {
  it('stores the flag on the user streak hash', async () => {
    const { deps } = await setup();
    expect(await post(deps, '/api/tutorial-seen')).toEqual({ status: 200, body: { ok: true } });
    expect(await deps.redis.hGet(keys.streak(UID), 'tutorialSeen')).toBe('1');
  });
});

describe('GET /api/reveal', () => {
  it('works logged out, returning only the count', async () => {
    const { deps } = await setup();
    await get(deps, '/api/game');
    await post(deps, '/api/chart', solution());
    logOut(deps);
    expect(await get(deps, '/api/reveal')).toEqual({ status: 200, body: { settlers: [], more: 1 } });
  });

  it('places the solved caller first', async () => {
    const { deps } = await setup();
    await get(deps, '/api/game');
    await post(deps, '/api/chart', solution());
    const res = await get(deps, '/api/reveal');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ settlers: [{ userId: UID, isMe: true, snoovatar: null }], more: 0 });
  });
});
