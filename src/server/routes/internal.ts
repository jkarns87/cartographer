import { Hono } from 'hono';
import type { TriggerResponse, UiResponse } from '@devvit/web/shared';
import type { Deps } from '../deps';
import {
  ensureFlairTemplates,
  ensurePostFlairTemplate,
} from '../services/flair';
import { postPractice, postToday, postUrl } from '../services/posting';
import { deletePostKeys } from '../services/snapshot';
import { resolveSubredditName } from '../services/subreddit';

type CronResponse = {
  status: 'posted' | 'already' | 'missing' | 'error';
  postId?: string;
  date: string;
};

const bodyPostId = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null || !('postId' in body))
    return undefined;
  return typeof body.postId === 'string' ? body.postId : undefined;
};

/**
 * Reddit-invoked endpoints: scheduler, moderator menu, and triggers. All receive and return JSON.
 * Menu endpoints always answer 200 with a `UiResponse` (Devvit's menu protocol expects a 2xx);
 * failures are reported as a toast. The cron answers 500 on an uncaught posting error.
 */
export const createInternalRoutes = (deps: Deps): Hono => {
  const internal = new Hono();

  internal.post('/cron/daily', async (c) => {
    try {
      const result = await postToday(deps);
      return c.json<CronResponse>(result, 200);
    } catch (err) {
      console.error('cron/daily failed', err);
      return c.json<CronResponse>(
        { status: 'error', date: utcDateOf(deps) },
        500
      );
    }
  });

  internal.post('/menu/post-today', async (c) => {
    try {
      const result = await postToday(deps);
      switch (result.status) {
        case 'posted':
          return c.json<UiResponse>(
            {
              navigateTo: postUrl(
                await resolveSubredditName(deps),
                result.postId ?? ''
              ),
            },
            200
          );
        case 'already':
          return c.json<UiResponse>(
            { showToast: `Today's island (${result.date}) is already posted.` },
            200
          );
        case 'missing':
          return c.json<UiResponse>(
            { showToast: `No island is scheduled for ${result.date}.` },
            200
          );
      }
    } catch (err) {
      console.error('menu/post-today failed', err);
      return c.json<UiResponse>(
        { showToast: 'Posting failed. Check the app logs.' },
        200
      );
    }
  });

  internal.post('/menu/post-practice', async (c) => {
    try {
      const { postId } = await postPractice(deps);
      return c.json<UiResponse>(
        { navigateTo: postUrl(await resolveSubredditName(deps), postId) },
        200
      );
    } catch (err) {
      console.error('menu/post-practice failed', err);
      return c.json<UiResponse>(
        { showToast: 'Posting a practice island failed. Check the app logs.' },
        200
      );
    }
  });

  const onInstallOrUpgrade = async (): Promise<TriggerResponse> => {
    try {
      await ensureFlairTemplates(deps);
    } catch (err) {
      // Flair setup is retried lazily by applyFlair; never block the install.
      console.error('ensureFlairTemplates failed', err);
    }
    try {
      await ensurePostFlairTemplate(deps);
    } catch (err) {
      // Posting falls back to no flair while the template is missing.
      console.error('ensurePostFlairTemplate failed', err);
    }
    return {};
  };
  internal.post('/triggers/on-app-install', async (c) =>
    c.json<TriggerResponse>(await onInstallOrUpgrade(), 200)
  );
  internal.post('/triggers/on-app-upgrade', async (c) =>
    c.json<TriggerResponse>(await onInstallOrUpgrade(), 200)
  );

  internal.post('/triggers/on-post-delete', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }
    const postId = bodyPostId(body) ?? deps.ctx().postId;
    if (postId === undefined) {
      console.error('on-post-delete: no postId in body or context', body);
      return c.json<TriggerResponse>({}, 200);
    }
    try {
      await deletePostKeys(deps, postId);
    } catch (err) {
      console.error(`on-post-delete: cleanup failed for ${postId}`, err);
    }
    return c.json<TriggerResponse>({}, 200);
  });

  return internal;
};

const utcDateOf = (deps: Deps): string =>
  new Date(deps.now()).toISOString().slice(0, 10);
