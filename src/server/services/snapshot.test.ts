import { describe, expect, it } from 'vitest';
import { makeDeps } from '../fakes';
import { keys } from '../keys';
import { FIXTURE_PRACTICE, FIXTURE_SCHEDULE } from '../puzzles/fixture';
import {
  deletePostKeys,
  loadSnapshot,
  saveSnapshot,
  toPostData,
  toPuzzle,
  toSummary,
} from './snapshot';
import type { Snapshot } from './snapshot';

const entry = FIXTURE_SCHEDULE.entries[0];
if (!entry) throw new Error('fixture missing');
const snap: Snapshot = { ...entry, postedAt: 1_700_000_000_000, postId: 't3_abc' };

describe('saveSnapshot / loadSnapshot', () => {
  it('round trips through redis', async () => {
    const deps = makeDeps();
    await saveSnapshot(deps, snap);
    expect(await loadSnapshot(deps, 't3_abc')).toEqual(snap);
    expect(await loadSnapshot(deps, 't3_nope')).toBeUndefined();
  });

  it('rejects a corrupted snapshot loudly', async () => {
    const deps = makeDeps();
    await deps.redis.set(keys.puzzle('t3_bad'), '{"nope":1}');
    await expect(loadSnapshot(deps, 't3_bad')).rejects.toThrow();
  });
});

describe('projections', () => {
  it('toPuzzle never carries the solution or posting fields', () => {
    const puzzle = toPuzzle(snap);
    expect(Object.keys(puzzle).sort()).toEqual(
      ['clues', 'difficulty', 'id', 'land', 'landmarks', 'name', 'number'].sort()
    );
    expect(puzzle).toEqual({
      id: entry.id,
      number: entry.number,
      name: entry.name,
      difficulty: entry.difficulty,
      land: entry.land,
      landmarks: entry.landmarks,
      clues: entry.clues,
    });
    expect(JSON.stringify(puzzle)).not.toContain('solution');
  });

  it('toPostData stays well under 2 KB and carries only the summary', () => {
    for (const e of [...FIXTURE_SCHEDULE.entries, ...FIXTURE_PRACTICE.entries]) {
      const data = toPostData(e);
      expect(data).toEqual({
        number: e.number,
        name: e.name,
        difficulty: e.difficulty,
        land: e.land,
        landmarkCount: 7,
        date: e.date,
      });
      expect(JSON.stringify(data).length).toBeLessThan(2048);
    }
  });

  it('toSummary mirrors toPostData from a snapshot', () => {
    expect(toSummary(snap)).toEqual(toPostData(entry));
  });
});

describe('deletePostKeys', () => {
  it('removes every post-scoped key and the matching posted marker', async () => {
    const deps = makeDeps();
    await saveSnapshot(deps, snap);
    await deps.redis.set(keys.posted('2026-12-01'), 't3_abc');
    await deps.redis.hSet(keys.stats('t3_abc'), { started: '3' });
    await deps.redis.zAdd(keys.times('t3_abc'), { member: 'u', score: 1 });
    await deps.redis.zAdd(keys.settlers('t3_abc'), { member: 'u', score: 1 });
    await deps.redis.set(keys.results('t3_abc'), 't1_x');
    await deps.redis.hSet(keys.user('t3_abc', 'u'), { startedAt: '1' });
    await deps.redis.set(keys.posted('2026-12-02'), 't3_other');

    await deletePostKeys(deps, 't3_abc');

    for (const key of [
      keys.puzzle('t3_abc'),
      keys.stats('t3_abc'),
      keys.times('t3_abc'),
      keys.settlers('t3_abc'),
      keys.results('t3_abc'),
      keys.posted('2026-12-01'),
    ]) {
      expect(await deps.redis.exists(key)).toBe(0);
    }
    expect(await deps.redis.get(keys.posted('2026-12-02'))).toBe('t3_other');
  });

  it('keeps the posted marker when it points at a different post', async () => {
    const deps = makeDeps();
    await saveSnapshot(deps, snap);
    await deps.redis.set(keys.posted('2026-12-01'), 't3_replacement');
    await deletePostKeys(deps, 't3_abc');
    expect(await deps.redis.get(keys.posted('2026-12-01'))).toBe('t3_replacement');
  });

  it('is a no-op for an unknown post', async () => {
    const deps = makeDeps();
    await expect(deletePostKeys(deps, 't3_unknown')).resolves.toBeUndefined();
  });
});
