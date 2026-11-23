import { describe, expect, it } from 'vitest';
import { FakeReddit, FakeRedis, FakeSettings, ZRANGE_DEFAULT_COUNT, makeDeps } from './fakes';

describe('FakeRedis', () => {
  it('handles strings, nx/xx, del and exists', async () => {
    const r = new FakeRedis();
    expect(await r.get('a')).toBeUndefined();
    expect(await r.set('a', '1')).toBe('OK');
    expect(await r.set('a', '2', { nx: true })).toBe('');
    expect(await r.get('a')).toBe('1');
    expect(await r.set('b', '2', { xx: true })).toBe('');
    expect(await r.get('b')).toBeUndefined();
    expect(await r.exists('a', 'b')).toBe(1);
    await r.del('a');
    expect(await r.exists('a')).toBe(0);
  });

  it('increments strings', async () => {
    const r = new FakeRedis();
    expect(await r.incrBy('n', 1)).toBe(1);
    expect(await r.incrBy('n', 2)).toBe(3);
    expect(await r.get('n')).toBe('3');
  });

  it('handles hashes', async () => {
    const r = new FakeRedis();
    expect(await r.hSet('h', { a: '1', b: '2' })).toBe(2);
    expect(await r.hSet('h', { a: '9' })).toBe(0);
    expect(await r.hGet('h', 'a')).toBe('9');
    expect(await r.hSetNX('h', 'a', 'x')).toBe(0);
    expect(await r.hSetNX('h', 'c', 'x')).toBe(1);
    expect(await r.hIncrBy('h', 'n', 5)).toBe(5);
    expect(await r.hIncrBy('h', 'n', -2)).toBe(3);
    expect(await r.hGetAll('h')).toEqual({ a: '9', b: '2', c: 'x', n: '3' });
    expect(await r.hGetAll('missing')).toEqual({});
    expect(await r.exists('h')).toBe(1);
  });

  it('orders sorted sets by score then member', async () => {
    const r = new FakeRedis();
    expect(await r.zAdd('z', { member: 'b', score: 2 }, { member: 'a', score: 2 })).toBe(2);
    expect(await r.zAdd('z', { member: 'c', score: 1 }, { member: 'a', score: 5 })).toBe(1);
    expect(await r.zCard('z')).toBe(3);
    expect(await r.zScore('z', 'a')).toBe(5);
    expect(await r.zScore('z', 'zz')).toBeUndefined();
    expect(await r.zRank('z', 'c')).toBe(0);
    expect(await r.zRank('z', 'a')).toBe(2);
    expect(await r.zRank('z', 'zz')).toBeUndefined();
    expect(await r.zRange('z', 0, -1)).toEqual([
      { member: 'c', score: 1 },
      { member: 'b', score: 2 },
      { member: 'a', score: 5 },
    ]);
    expect(await r.zRange('z', 0, 1, { by: 'rank' })).toEqual([
      { member: 'c', score: 1 },
      { member: 'b', score: 2 },
    ]);
    expect(await r.zRange('z', 5, 9)).toEqual([]);
    expect(await r.zRange('z', 1, 99)).toEqual([
      { member: 'b', score: 2 },
      { member: 'a', score: 5 },
    ]);
    expect(await r.zRange('z', -2, -1)).toEqual([
      { member: 'b', score: 2 },
      { member: 'a', score: 5 },
    ]);
    expect(await r.zRange('z', 2, '+inf', { by: 'score' })).toEqual([
      { member: 'b', score: 2 },
      { member: 'a', score: 5 },
    ]);
    expect(await r.zRange('z', '(2', '+inf', { by: 'score' })).toEqual([{ member: 'a', score: 5 }]);
    expect(await r.zRange('none', 0, -1)).toEqual([]);
  });

  it('applies Redis index rules for rank ranges', async () => {
    const r = new FakeRedis();
    await r.zAdd('z', { member: 'c', score: 1 }, { member: 'b', score: 2 }, { member: 'a', score: 5 });
    // stop before start after negative conversion -> [] (Redis compares before clamping)
    expect(await r.zRange('z', 0, -10)).toEqual([]);
    expect(await r.zRange('z', 1, 0)).toEqual([]);
    // start before the beginning clamps to 0, stop past the end clamps to the last element
    expect(await r.zRange('z', -10, -1)).toEqual([
      { member: 'c', score: 1 },
      { member: 'b', score: 2 },
      { member: 'a', score: 5 },
    ]);
    expect(await r.zRange('z', 1, 99)).toEqual([
      { member: 'b', score: 2 },
      { member: 'a', score: 5 },
    ]);
    // REV with rank addresses the reversed set
    expect(await r.zRange('z', 0, 0, { by: 'rank', reverse: true })).toEqual([{ member: 'a', score: 5 }]);
    expect(await r.zRange('z', 0, -1, { reverse: true, by: 'rank' })).toEqual([
      { member: 'a', score: 5 },
      { member: 'b', score: 2 },
      { member: 'c', score: 1 },
    ]);
  });

  it('rejects limit unless by is score or lex, like RedisClient.js', async () => {
    const r = new FakeRedis();
    await r.zAdd('z', { member: 'c', score: 1 }, { member: 'b', score: 2 }, { member: 'a', score: 5 });
    await expect(r.zRange('z', 0, -1, { by: 'rank', limit: { offset: 1, count: 1 } })).rejects.toThrow(
      /'limit' only allowed when 'options.by' is 'lex' or 'score'/
    );
    expect(await r.zRange('z', '-inf', '+inf', { by: 'score', limit: { offset: 1, count: 1 } })).toEqual([
      { member: 'b', score: 2 },
    ]);
  });

  it('treats start as the maximum for reversed score ranges', async () => {
    const r = new FakeRedis();
    await r.zAdd('z', { member: 'c', score: 1 }, { member: 'b', score: 2 }, { member: 'a', score: 5 });
    // start/stop go to Redis unchanged with REV, so a min..max pair matches nothing
    expect(await r.zRange('z', '-inf', '+inf', { by: 'score', reverse: true })).toEqual([]);
    expect(await r.zRange('z', '+inf', '-inf', { by: 'score', reverse: true })).toEqual([
      { member: 'a', score: 5 },
      { member: 'b', score: 2 },
      { member: 'c', score: 1 },
    ]);
    expect(await r.zRange('z', 4, 2, { by: 'score', reverse: true })).toEqual([{ member: 'b', score: 2 }]);
  });

  it('caps score ranges at 1,000 results unless a limit is given, and never caps rank ranges', async () => {
    const r = new FakeRedis();
    const members = Array.from({ length: ZRANGE_DEFAULT_COUNT + 5 }, (_, i) => ({
      member: `m${String(i).padStart(4, '0')}`,
      score: i,
    }));
    await r.zAdd('big', ...members);
    expect(await r.zCard('big')).toBe(ZRANGE_DEFAULT_COUNT + 5);
    expect(await r.zRange('big', '-inf', '+inf', { by: 'score' })).toHaveLength(ZRANGE_DEFAULT_COUNT);
    expect(
      await r.zRange('big', '-inf', '+inf', { by: 'score', limit: { offset: 0, count: 2000 } })
    ).toHaveLength(ZRANGE_DEFAULT_COUNT + 5);
    expect(await r.zRange('big', 0, -1)).toHaveLength(ZRANGE_DEFAULT_COUNT + 5);
    expect(await r.zRange('big', 0, -1, { by: 'rank' })).toHaveLength(ZRANGE_DEFAULT_COUNT + 5);
  });

  it('records ttls only for existing keys', async () => {
    const r = new FakeRedis();
    await r.expire('missing', 10);
    expect(r.ttls.has('missing')).toBe(false);
    await r.hSet('h', { a: '1' });
    await r.expire('h', 10);
    expect(r.ttls.get('h')).toBe(10);
  });
});

describe('FakeReddit', () => {
  it('returns incrementing thing ids and records calls', async () => {
    const r = new FakeReddit();
    const p1 = await r.submitCustomPost({ subredditName: 's', title: 'one' });
    const p2 = await r.submitCustomPost({ subredditName: 's', title: 'two' });
    expect(p1.id).toBe('t3_1');
    expect(p2.id).toBe('t3_2');
    const c = await r.submitComment({ id: p1.id, text: 'hi', runAs: 'APP' });
    expect(c.id).toBe('t1_3');
    await c.distinguish(true);
    expect(r.comments[0]).toMatchObject({ parentId: 't3_1', sticky: true, distinguished: true });
    expect(r.callsTo('submitCustomPost')).toHaveLength(2);
    expect(r.callsTo('distinguish')).toHaveLength(1);
  });

  it('simulates outages and flair rejection', async () => {
    const r = new FakeReddit();
    r.failSubmitPost = true;
    await expect(r.submitCustomPost({ subredditName: 's', title: 't' })).rejects.toThrow();
    r.failSubmitPost = false;
    r.rejectFlairText = true;
    await expect(
      r.submitCustomPost({ subredditName: 's', title: 't', flairText: 'x' })
    ).rejects.toThrow();
    // Failed submits never consume an id, so the first successful post is still t3_1.
    await expect(r.submitCustomPost({ subredditName: 's', title: 't' })).resolves.toEqual({
      id: 't3_1',
    });
  });

  it('reports user flair as set', async () => {
    const r = new FakeReddit();
    r.currentUsername = 'joe';
    const user = await r.getCurrentUser();
    expect(user?.username).toBe('joe');
    expect(await user?.getUserFlairBySubreddit('s')).toEqual({ flairText: undefined });
    await r.setUserFlair({ subredditName: 's', username: 'joe', text: 'Navigator · 3d' });
    expect(await user?.getUserFlairBySubreddit('s')).toEqual({ flairText: 'Navigator · 3d' });
    r.currentUsername = undefined;
    expect(await r.getCurrentUser()).toBeUndefined();
  });
});

describe('FakeSettings and makeDeps', () => {
  it('reads configured settings', async () => {
    const s = new FakeSettings({ flairEnabled: false });
    expect(await s.get('flairEnabled')).toBe(false);
    expect(await s.get('other')).toBeUndefined();
  });

  it('wires a mutable clock and identity', () => {
    const deps = makeDeps({ now: 5, ctx: { username: 'zed' } });
    expect(deps.now()).toBe(5);
    deps.clock.now = 6;
    expect(deps.now()).toBe(6);
    expect(deps.ctx().username).toBe('zed');
    expect(deps.reddit.currentUsername).toBe('zed');
    deps.ctxState.postId = 't3_9';
    expect(deps.ctx().postId).toBe('t3_9');
    expect(deps.schedule.entries).toHaveLength(2);
    expect(deps.practice.entries).toHaveLength(1);
  });
});
