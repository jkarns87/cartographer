import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type {
  ApiError,
  ChartResponse,
  CoverResponse,
  GameResponse,
  RevealResponse,
} from '../../shared/api';
import type { AppEnv, Deps } from '../deps';
import { buildResult, chart } from '../services/chart';
import { postChart } from '../services/comments';
import {
  ensureStarted,
  markTutorialSeen,
  parsePlaceRequest,
  readProgress,
  readTutorialSeen,
  savePlacements,
  statusOf,
} from '../services/progress';
import { reveal } from '../services/snoovatar';
import { loadSnapshot, toPuzzle, toSummary } from '../services/snapshot';
import { readStats } from '../services/stats';
import { subscribe } from '../services/subscribe';

/**
 * Client-facing routes under `/api` (spec 5.2). Every response is JSON.
 *
 * Handlers read the request-scoped dependencies with `c.get('deps')` (set by
 * `createApp` in `app.ts`) and pass them to services. Identity comes from
 * `deps.ctx()` and time from `deps.now()`; never import `context`, `redis`
 * or `reddit` from `@devvit/web/server` here. No response ever carries the
 * solution, and no client-reported time is ever read.
 */
export const api = new Hono<AppEnv>();

type C = Context<AppEnv>;
type Ok = { ok: true };
type CommentResponse = { ok: true; commentId: string };

const fail = (c: C, error: ApiError['error'], status: ContentfulStatusCode): Response =>
  c.json<ApiError>({ error }, status);

const invalid = (c: C): Response => fail(c, 'invalid', 400);
const login = (c: C): Response => fail(c, 'login', 401);
const notFound = (c: C): Response => fail(c, 'not-found', 404);

/** Request identity. `postId` is required by every route; a missing one is a 400. */
type Scope = { deps: Deps; postId: string; userId: string | undefined; username: string | undefined };
type Authed = Scope & { userId: string };

const scope = (c: C): Scope | undefined => {
  const deps = c.get('deps');
  const { postId, userId, username } = deps.ctx();
  if (postId === undefined || postId === '') return undefined;
  return { deps, postId, userId: userId === '' ? undefined : userId, username };
};

const isAuthed = (s: Scope): s is Authed => s.userId !== undefined;

/** The parsed JSON body, or undefined when it is missing or not JSON. */
const body = async (c: C): Promise<unknown> => {
  try {
    const parsed: unknown = await c.req.json();
    return parsed;
  } catch {
    return undefined;
  }
};

api.onError((err, c) => {
  console.error(`api ${c.req.method} ${c.req.path} failed`, err);
  return c.json<ApiError>({ error: 'server' }, 500);
});

api.get('/cover', async (c) => {
  const s = scope(c);
  if (!s) return invalid(c);
  const { deps, postId } = s;
  const snap = await loadSnapshot(deps, postId);
  if (!snap) return notFound(c);
  const stats = await readStats(deps, postId);
  let me: CoverResponse['me'] = { loggedIn: false, status: 'unsolved' };
  if (isAuthed(s)) {
    const p = await readProgress(deps, postId, s.userId);
    const status = statusOf(p);
    me =
      status === 'solved'
        ? { loggedIn: true, status, result: await buildResult(deps, postId, s.userId, p, snap) }
        : { loggedIn: true, status };
  }
  return c.json<CoverResponse>({ postId, island: toSummary(snap), stats, me }, 200);
});

api.get('/game', async (c) => {
  const s = scope(c);
  if (!s) return invalid(c);
  if (!isAuthed(s)) return login(c);
  const { deps, postId, userId } = s;
  const snap = await loadSnapshot(deps, postId);
  if (!snap) return notFound(c);
  const startedAt = await ensureStarted(deps, postId, userId);
  const p = await readProgress(deps, postId, userId);
  const status = statusOf(p);
  const tutorialSeen = await readTutorialSeen(deps, userId);
  const res: GameResponse = {
    postId,
    puzzle: toPuzzle(snap),
    placements: p.placements,
    history: p.history,
    corrections: p.corrections,
    startedAt,
    serverNow: deps.now(),
    status,
    tutorialSeen,
  };
  if (status === 'solved') res.result = await buildResult(deps, postId, userId, p, snap);
  return c.json<GameResponse>(res, 200);
});

api.post('/place', async (c) => {
  const s = scope(c);
  if (!s) return invalid(c);
  if (!isAuthed(s)) return login(c);
  const { deps, postId, userId } = s;
  const snap = await loadSnapshot(deps, postId);
  if (!snap) return notFound(c);
  const req = parsePlaceRequest(await body(c), snap.landmarks);
  if (!req) return invalid(c);
  await savePlacements(deps, postId, userId, req);
  return c.json<Ok>({ ok: true }, 200);
});

api.post('/chart', async (c) => {
  const s = scope(c);
  if (!s) return invalid(c);
  if (!isAuthed(s)) return login(c);
  const { deps, postId, userId, username } = s;
  const snap = await loadSnapshot(deps, postId);
  if (!snap) return notFound(c);
  const req = parsePlaceRequest(await body(c), snap.landmarks);
  if (!req) return invalid(c);
  const out = await chart(deps, postId, userId, username ?? '', req);
  switch (out.kind) {
    case 'ok':
      return c.json<ChartResponse>({ result: out.result, stats: out.stats }, 200);
    case 'invalid':
      return invalid(c);
    case 'mismatch':
      return fail(c, 'mismatch', 409);
    case 'not-found':
      return notFound(c);
  }
});

api.post('/comment', async (c) => {
  const s = scope(c);
  if (!s) return invalid(c);
  if (!isAuthed(s)) return login(c);
  const out = await postChart(s.deps, s.postId, s.userId);
  switch (out.kind) {
    case 'ok':
      return c.json<CommentResponse>({ ok: true, commentId: out.commentId }, 200);
    case 'already':
      return fail(c, 'already', 409);
    case 'not-ready':
      return invalid(c);
  }
});

api.post('/subscribe', async (c) => {
  const s = scope(c);
  if (!s) return invalid(c);
  if (!isAuthed(s)) return login(c);
  const out = await subscribe(s.deps, s.postId, s.userId);
  if (out.kind === 'forbidden') return fail(c, 'forbidden', 403);
  return c.json<Ok>({ ok: true }, 200);
});

api.post('/tutorial-seen', async (c) => {
  const s = scope(c);
  if (!s) return invalid(c);
  if (!isAuthed(s)) return login(c);
  await markTutorialSeen(s.deps, s.userId);
  return c.json<Ok>({ ok: true }, 200);
});

api.get('/reveal', async (c) => {
  const s = scope(c);
  if (!s) return invalid(c);
  return c.json<RevealResponse>(await reveal(s.deps, s.postId, s.userId), 200);
});
