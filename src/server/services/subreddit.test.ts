import { describe, expect, it } from 'vitest';
import { makeDeps } from '../fakes';
import { resolveSubredditName } from './subreddit';

describe('resolveSubredditName', () => {
  it('uses the request header when present and never calls Reddit', async () => {
    const deps = makeDeps();
    expect(await resolveSubredditName(deps)).toBe('cartographer_test');
    expect(deps.reddit.callsTo('getCurrentSubreddit')).toHaveLength(0);
  });

  it('falls back to getCurrentSubreddit when the header is missing', async () => {
    const deps = makeDeps();
    deps.ctxState.subredditName = undefined;
    expect(await resolveSubredditName(deps)).toBe('testsub');
    expect(deps.reddit.callsTo('getCurrentSubreddit')).toHaveLength(1);
  });

  it('treats an empty header as missing', async () => {
    const deps = makeDeps({ ctx: { subredditName: '' } });
    deps.reddit.currentSubredditName = 'from_api';
    expect(await resolveSubredditName(deps)).toBe('from_api');
  });
});
