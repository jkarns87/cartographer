import { Hono } from 'hono';
import type { AppEnv } from '../deps';

/**
 * Client-facing routes under `/api`. Task 5 fills this router.
 *
 * Handlers read the request-scoped dependencies with `c.get('deps')` (set by
 * `createApp` in `app.ts`) and pass them to services. Identity comes from
 * `deps.ctx()` and time from `deps.now()`; never import `context`, `redis`
 * or `reddit` from `@devvit/web/server` here.
 */
export const api = new Hono<AppEnv>();
