import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { makeDeps } from '../fakes';
import { keys } from '../keys';
import { saveSnapshot } from '../services/snapshot';
import { FIXTURE_SCHEDULE } from '../puzzles/fixture';
import type { TestDeps } from '../fakes';

const post = (deps: TestDeps, path: string, body: unknown = {}) =>
  createApp(deps).request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('createApp', () => {
  it('exposes deps to /api handlers through the request context', async () => {
    const deps = makeDeps();
    const app = createApp(deps);
    app.get('/api/probe', (c) => c.json({ sub: c.get('deps').ctx().subredditName }));
    const res = await app.request('/api/probe');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sub: 'cartographer_test' });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await createApp(makeDeps()).request('/api/nope');
    expect(res.status).toBe(404);
  });
});

describe('POST /internal/cron/daily', () => {
  it('posts a fresh day and then reports already', async () => {
    const deps = makeDeps();
    const first = await post(deps, '/internal/cron/daily');
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ status: 'posted', postId: 't3_1', date: '2026-12-01' });

    const second = await post(deps, '/internal/cron/daily');
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ status: 'already', postId: 't3_1', date: '2026-12-01' });
    expect(deps.reddit.posts).toHaveLength(1);
  });

  it('reports a missing entry with 200', async () => {
    const deps = makeDeps({ now: Date.UTC(2026, 11, 9, 12) });
    const res = await post(deps, '/internal/cron/daily');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'missing', date: '2026-12-09' });
  });

  it('reports a submit failure with 500 and no day marker', async () => {
    const deps = makeDeps();
    deps.reddit.failSubmitPost = true;
    const res = await post(deps, '/internal/cron/daily');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ status: 'error', date: '2026-12-01' });
    expect(await deps.redis.exists(keys.posted('2026-12-01'))).toBe(0);
  });

  it('tolerates an empty body', async () => {
    const deps = makeDeps();
    const res = await createApp(deps).request('/internal/cron/daily', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('still posts when the scheduler omits the subreddit-name header', async () => {
    const deps = makeDeps();
    deps.ctxState.subredditName = undefined;
    const res = await post(deps, '/internal/cron/daily');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'posted', postId: 't3_1', date: '2026-12-01' });
    expect(deps.reddit.posts[0]?.subredditName).toBe('testsub');
    expect(deps.reddit.callsTo('getCurrentSubreddit')).toHaveLength(1);
  });

  it('uses the subreddit-name header without asking Reddit when it is present', async () => {
    const deps = makeDeps();
    const res = await post(deps, '/internal/cron/daily');
    expect(res.status).toBe(200);
    expect(deps.reddit.posts[0]?.subredditName).toBe('cartographer_test');
    expect(deps.reddit.callsTo('getCurrentSubreddit')).toHaveLength(0);
  });
});

describe('POST /internal/menu/post-today', () => {
  const menuBody = { location: 'subreddit', targetId: 't5_abc' };

  it('navigates to the new post', async () => {
    const deps = makeDeps();
    const res = await post(deps, '/internal/menu/post-today', menuBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      navigateTo: 'https://www.reddit.com/r/cartographer_test/comments/1',
    });
  });

  it('toasts when the day is already posted', async () => {
    const deps = makeDeps();
    await post(deps, '/internal/menu/post-today', menuBody);
    const res = await post(deps, '/internal/menu/post-today', menuBody);
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toMatchObject({ showToast: expect.stringContaining('already') });
    expect(body).not.toHaveProperty('navigateTo');
  });

  it('toasts when no island is scheduled', async () => {
    const deps = makeDeps({ now: Date.UTC(2026, 11, 9, 12) });
    const res = await post(deps, '/internal/menu/post-today', menuBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ showToast: expect.stringContaining('2026-12-09') });
  });

  it('toasts with 200 when posting fails (menu responses must be a 2xx UiResponse)', async () => {
    const deps = makeDeps();
    deps.reddit.failSubmitPost = true;
    const res = await post(deps, '/internal/menu/post-today', menuBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ showToast: expect.any(String) });
  });

  it('navigates using the resolved subreddit when the header is missing', async () => {
    const deps = makeDeps();
    deps.ctxState.subredditName = undefined;
    const res = await post(deps, '/internal/menu/post-today', menuBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ navigateTo: 'https://www.reddit.com/r/testsub/comments/1' });
  });
});

describe('POST /internal/menu/post-practice', () => {
  it('navigates to the practice post', async () => {
    const deps = makeDeps();
    const res = await post(deps, '/internal/menu/post-practice', { location: 'subreddit', targetId: 't5_abc' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      navigateTo: 'https://www.reddit.com/r/cartographer_test/comments/1',
    });
    expect(deps.reddit.posts[0]?.title).toBe('Cartographer practice · Ember Shoal');
  });

  it('toasts with 200 when the pool is empty', async () => {
    const deps = makeDeps({ practice: { version: 1, masterSeed: 0, entries: [] } });
    const res = await post(deps, '/internal/menu/post-practice', { location: 'subreddit', targetId: 't5_abc' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ showToast: expect.any(String) });
  });

  it('navigates using the resolved subreddit when the header is missing', async () => {
    const deps = makeDeps({ ctx: { subredditName: undefined } });
    const res = await post(deps, '/internal/menu/post-practice', { location: 'subreddit', targetId: 't5_abc' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ navigateTo: 'https://www.reddit.com/r/testsub/comments/1' });
    expect(deps.reddit.posts[0]?.subredditName).toBe('testsub');
  });
});

describe('triggers', () => {
  it.each(['on-app-install', 'on-app-upgrade'])('%s ensures flair templates', async (name) => {
    const deps = makeDeps();
    const res = await post(deps, `/internal/triggers/${name}`, { type: 'AppInstall' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(deps.reddit.callsTo('createUserFlairTemplate')).toHaveLength(4);
    expect(Object.keys(await deps.redis.hGetAll(keys.flairTemplates()))).toHaveLength(4);
  });

  it('on-app-install still returns 200 when flair setup fails', async () => {
    const deps = makeDeps();
    deps.reddit.createUserFlairTemplate = async () => {
      throw new Error('no flair permission');
    };
    const res = await post(deps, '/internal/triggers/on-app-install', { type: 'AppInstall' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(console.error).toHaveBeenCalled();
  });

  it('on-post-delete removes the post keys named in the body', async () => {
    const deps = makeDeps();
    const entry = FIXTURE_SCHEDULE.entries[0];
    if (!entry) throw new Error('fixture missing');
    await saveSnapshot(deps, { ...entry, postedAt: deps.now(), postId: 't3_abc' });
    await deps.redis.set(keys.posted('2026-12-01'), 't3_abc');
    await deps.redis.hSet(keys.stats('t3_abc'), { started: '1' });
    await deps.redis.set(keys.results('t3_abc'), 't1_x');

    const res = await post(deps, '/internal/triggers/on-post-delete', {
      type: 'PostDelete',
      postId: 't3_abc',
      source: 'USER',
      reason: 'AUTHOR',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(await deps.redis.exists(keys.puzzle('t3_abc'), keys.stats('t3_abc'), keys.results('t3_abc'))).toBe(0);
    expect(await deps.redis.exists(keys.posted('2026-12-01'))).toBe(0);
  });

  it('on-post-delete falls back to the context post id', async () => {
    const deps = makeDeps({ ctx: { postId: 't3_ctx' } });
    await deps.redis.set(keys.puzzle('t3_ctx'), '{}');
    const res = await post(deps, '/internal/triggers/on-post-delete', { type: 'PostDelete' });
    expect(res.status).toBe(200);
    expect(await deps.redis.exists(keys.puzzle('t3_ctx'))).toBe(0);
  });

  it('on-post-delete without any post id is a logged no-op', async () => {
    const deps = makeDeps();
    const res = await createApp(deps).request('/internal/triggers/on-post-delete', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(console.error).toHaveBeenCalled();
  });
});
