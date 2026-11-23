import { Hono } from 'hono';
import type { AppEnv, Deps } from './deps';
import { api } from './routes/api';
import { createInternalRoutes } from './routes/internal';

/** Builds the Hono app. Production passes the real Devvit clients; tests pass fakes. */
export const createApp = (deps: Deps): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('deps', deps);
    await next();
  });
  app.route('/api', api);
  app.route('/internal', createInternalRoutes(deps));
  return app;
};
