import { describe, expect, it, vi } from 'vitest';
import { makeDeps } from '../fakes';
import type { TestDeps } from '../fakes';
import { keys } from '../keys';
import { MEDIAN_FLOOR_MS, rankOf, readStats, recordTime } from './stats';

const POST = 't3_p';

const record = async (deps: TestDeps, times: number[], clean = false): Promise<void> => {
  for (const [i, ms] of times.entries()) await recordTime(deps, POST, `t2_${i}`, ms, clean);
};

describe('readStats', () => {
  it('is all zero with a null median for a fresh post', async () => {
    expect(await readStats(makeDeps(), POST)).toEqual({
      started: 0,
      charted: 0,
      cleanPct: 0,
      medianMs: null,
    });
  });

  it('reads the counters and rounds the clean percentage', async () => {
    const deps = makeDeps();
    await deps.redis.hSet(keys.stats(POST), { started: '9', charted: '3', clean: '2' });
    const stats = await readStats(deps, POST);
    expect(stats.started).toBe(9);
    expect(stats.charted).toBe(3);
    expect(stats.cleanPct).toBe(67);
  });

  it('takes the middle time for an odd count', async () => {
    const deps = makeDeps();
    await record(deps, [50_000, 20_000, 90_000]);
    expect((await readStats(deps, POST)).medianMs).toBe(50_000);
  });

  it('averages the two middle times for an even count', async () => {
    const deps = makeDeps();
    await record(deps, [40_000, 20_000, 90_000, 11_001]);
    expect((await readStats(deps, POST)).medianMs).toBe(30_000);
    const pair = makeDeps();
    await record(pair, [10_000, 10_003]);
    expect((await readStats(pair, POST)).medianMs).toBe(10_002);
  });

  it('excludes times under 10 s but keeps exactly 10 s', async () => {
    const deps = makeDeps();
    await record(deps, [1_000, 9_999, 2_000, MEDIAN_FLOOR_MS, 60_000, 70_000]);
    expect((await readStats(deps, POST)).medianMs).toBe(60_000);
  });

  it('reads only rank windows, never score ranges or limit (real-client semantics)', async () => {
    const deps = makeDeps();
    await record(deps, [1_000, 50_000, 20_000, 9_000, 90_000, 30_000]);
    const spy = vi.spyOn(deps.redis, 'zRange');
    expect((await readStats(deps, POST)).medianMs).toBe(40_000);
    expect(spy).toHaveBeenCalled();
    for (const [, start, stop, options] of spy.mock.calls) {
      expect(options).toEqual({ by: 'rank' });
      expect(typeof start).toBe('number');
      expect(typeof stop).toBe('number');
      expect(Number(stop)).toBeGreaterThanOrEqual(Number(start));
    }
    expect(await deps.redis.hGet(keys.stats(POST), 'fast')).toBe('2');
  });

  it('is null when every time is under 10 s', async () => {
    const deps = makeDeps();
    await record(deps, [1_000, 2_000]);
    const stats = await readStats(deps, POST);
    expect(stats.medianMs).toBeNull();
    expect(stats.charted).toBe(2);
  });
});

describe('recordTime', () => {
  it('counts charted and clean and stores the time by uid', async () => {
    const deps = makeDeps();
    await recordTime(deps, POST, 't2_a', 30_000, true);
    await recordTime(deps, POST, 't2_b', 40_000, false);
    expect(await deps.redis.hGetAll(keys.stats(POST))).toEqual({ charted: '2', clean: '1' });
    expect(await deps.redis.zScore(keys.times(POST), 't2_a')).toBe(30_000);
    expect(await deps.redis.zScore(keys.times(POST), 't2_b')).toBe(40_000);
    expect((await readStats(deps, POST)).cleanPct).toBe(50);
  });
});

describe('rankOf', () => {
  it('is 1-based by elapsed among all recorded times, including under 10 s', async () => {
    const deps = makeDeps();
    await recordTime(deps, POST, 't2_slow', 90_000, false);
    await recordTime(deps, POST, 't2_fast', 5_000, false);
    await recordTime(deps, POST, 't2_mid', 30_000, false);
    expect(await rankOf(deps, POST, 't2_fast')).toEqual({ rank: 1, total: 3 });
    expect(await rankOf(deps, POST, 't2_mid')).toEqual({ rank: 2, total: 3 });
    expect(await rankOf(deps, POST, 't2_slow')).toEqual({ rank: 3, total: 3 });
  });

  it('is 0 for a user with no recorded time', async () => {
    const deps = makeDeps();
    await recordTime(deps, POST, 't2_a', 30_000, false);
    expect(await rankOf(deps, POST, 't2_nobody')).toEqual({ rank: 0, total: 1 });
  });
});
