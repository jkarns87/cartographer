import type { Deps } from '../deps';

/**
 * The subreddit this request runs in. Devvit fills `context.subredditName`
 * from an optional request header that scheduler invocations may omit, so a
 * missing (or empty) header falls back to `reddit.getCurrentSubreddit()`.
 * Every service that needs the name reads it here, never from `ctx()`.
 */
export const resolveSubredditName = async (deps: Deps): Promise<string> => {
  const { subredditName } = deps.ctx();
  if (subredditName !== undefined && subredditName !== '') return subredditName;
  return (await deps.reddit.getCurrentSubreddit()).name;
};
