import { serve } from '@hono/node-server';
import {
  context,
  createServer,
  getServerPort,
  reddit,
  redis,
  settings,
} from '@devvit/web/server';
import { createApp } from './app';
import { loadSchedules } from './services/schedule';

const { schedule, practice } = loadSchedules();

const app = createApp({
  redis,
  reddit,
  settings,
  now: () => Date.now(),
  ctx: () => ({
    userId: context.userId,
    username: context.username,
    postId: context.postId,
    subredditName: context.subredditName,
  }),
  schedule,
  practice,
});

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
