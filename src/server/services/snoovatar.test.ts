import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cellAt, isLand, landCells, sameCell } from '../../shared/puzzle/grid';
import type { Cell } from '../../shared/puzzle/types';
import { makeDeps } from '../fakes';
import type { TestDeps } from '../fakes';
import { keys, SNOO_TTL_SECONDS } from '../keys';
import { FIXTURE_SCHEDULE } from '../puzzles/fixture';
import { postIsland } from './posting';
import { loadSnapshot } from './snapshot';
import type { Snapshot } from './snapshot';
import {
  MAX_PER_CELL,
  REVEAL_LIMIT,
  emptyCellsOf,
  fnv1a,
  resolveSnoovatar,
  reveal,
  settlerCell,
} from './snoovatar';

const entry = FIXTURE_SCHEDULE.entries[0];
if (!entry) throw new Error('fixture missing');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const posted = async (deps: TestDeps): Promise<Snapshot> => {
  const { postId } = await postIsland(deps, entry);
  const snap = await loadSnapshot(deps, postId);
  if (!snap) throw new Error('snapshot missing');
  return snap;
};

const settle = async (deps: TestDeps, postId: string, uids: string[]): Promise<void> => {
  for (const [i, uid] of uids.entries()) {
    await deps.redis.zAdd(keys.settlers(postId), { member: uid, score: 1000 + i });
  }
};

describe('resolveSnoovatar', () => {
  it('caches the URL for 7 days and serves later calls from the cache', async () => {
    const deps = makeDeps();
    deps.reddit.snoovatars.tester = 'https://i.redd.it/snoo.png';
    expect(await resolveSnoovatar(deps, 't2_u1', 'tester')).toBe('https://i.redd.it/snoo.png');
    expect(await deps.redis.get(keys.snoo('t2_u1'))).toBe('https://i.redd.it/snoo.png');
    expect(deps.redis.ttls.get(keys.snoo('t2_u1'))).toBe(SNOO_TTL_SECONDS);
    expect(await resolveSnoovatar(deps, 't2_u1', 'tester')).toBe('https://i.redd.it/snoo.png');
    expect(deps.reddit.callsTo('getSnoovatarUrl')).toHaveLength(1);
  });

  it('caches an empty string when the user has no snoovatar', async () => {
    const deps = makeDeps();
    expect(await resolveSnoovatar(deps, 't2_u1', 'tester')).toBeNull();
    expect(await deps.redis.get(keys.snoo('t2_u1'))).toBe('');
    expect(await resolveSnoovatar(deps, 't2_u1', 'tester')).toBeNull();
    expect(deps.reddit.callsTo('getSnoovatarUrl')).toHaveLength(1);
  });
});

describe('fnv1a', () => {
  it('matches the published 32-bit FNV-1a test vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });
});

describe('settlerCell', () => {
  const cells: Cell[] = Array.from({ length: 13 }, (_, i) => cellAt(i));

  it('is deterministic and indexes by hash modulo the cell count', () => {
    expect(settlerCell('t2_abc', cells)).toEqual(settlerCell('t2_abc', cells));
    expect(settlerCell('a', cells)).toEqual(cells[0xe40c292c % 13]);
    expect(settlerCell('t2_abc', [{ r: 4, c: 4 }])).toEqual({ r: 4, c: 4 });
  });

  it('spreads realistic user IDs across every cell', () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 1300; i++) {
      const cell = settlerCell(`t2_${(i * 7919 + 104729).toString(36)}`, cells);
      const at = cells.findIndex((c) => sameCell(c, cell));
      counts.set(at, (counts.get(at) ?? 0) + 1);
    }
    expect(counts.size).toBe(13);
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(50);
      expect(n).toBeLessThan(150);
    }
  });

  it('throws when there are no cells', () => {
    expect(() => settlerCell('t2_abc', [])).toThrow();
  });
});

describe('emptyCellsOf', () => {
  it('is the land cells not holding a landmark in the solution', async () => {
    const deps = makeDeps();
    const snap = await posted(deps);
    const empty = emptyCellsOf(snap);
    expect(empty).toHaveLength(landCells(snap.land).length - snap.landmarks.length);
    for (const cell of empty) {
      expect(isLand(snap.land, cell)).toBe(true);
      expect(Object.values(snap.solution).some((s) => sameCell(s, cell))).toBe(false);
    }
  });
});

describe('reveal', () => {
  it('returns nothing for a post without a snapshot', async () => {
    expect(await reveal(makeDeps(), 't3_missing', 't2_u1')).toEqual({ settlers: [], more: 0 });
  });

  it('maps a small crowd to empty cells with cached snoovatars, caller first', async () => {
    const deps = makeDeps();
    const snap = await posted(deps);
    await settle(deps, snap.postId, ['t2_a', 't2_me', 't2_b']);
    await deps.redis.set(keys.snoo('t2_a'), 'https://i.redd.it/a.png');
    await deps.redis.set(keys.snoo('t2_me'), '');

    const res = await reveal(deps, snap.postId, 't2_me');
    const empty = emptyCellsOf(snap);
    expect(res.more).toBe(0);
    expect(res.settlers).toEqual([
      { userId: 't2_me', snoovatar: null, cell: settlerCell('t2_me', empty), isMe: true },
      { userId: 't2_a', snoovatar: 'https://i.redd.it/a.png', cell: settlerCell('t2_a', empty), isMe: false },
      { userId: 't2_b', snoovatar: null, cell: settlerCell('t2_b', empty), isMe: false },
    ]);
  });

  it('caps at the first 40 by solve order plus the caller, at most three per cell, counting the rest in more', async () => {
    const deps = makeDeps();
    const snap = await posted(deps);
    const uids = Array.from({ length: 60 }, (_, i) => `t2_s${i}`);
    await settle(deps, snap.postId, uids);
    const me = 't2_s55';

    const spy = vi.spyOn(deps.redis, 'zRange');
    const res = await reveal(deps, snap.postId, me);
    expect(spy.mock.calls).toEqual([[keys.settlers(snap.postId), 0, REVEAL_LIMIT - 1, { by: 'rank' }]]);
    const first40 = new Set(uids.slice(0, REVEAL_LIMIT));
    const empty = emptyCellsOf(snap);

    expect(res.settlers[0]).toMatchObject({ userId: me, isMe: true });
    expect(res.settlers.filter((s) => s.isMe)).toHaveLength(1);
    for (const s of res.settlers.slice(1)) {
      expect(first40.has(s.userId)).toBe(true);
      expect(s.isMe).toBe(false);
      expect(s.cell).toEqual(settlerCell(s.userId, empty));
    }
    const perCell = new Map<string, number>();
    for (const s of res.settlers) {
      const k = `${s.cell.r},${s.cell.c}`;
      perCell.set(k, (perCell.get(k) ?? 0) + 1);
    }
    for (const n of perCell.values()) expect(n).toBeLessThanOrEqual(MAX_PER_CELL);
    expect(res.settlers.length).toBeLessThanOrEqual(empty.length * MAX_PER_CELL);
    expect(res.more).toBe(60 - res.settlers.length);

    // Settlers keep solve order after the caller, and only overflow drops one.
    const shown = res.settlers.slice(1).map((s) => s.userId);
    expect(shown).toEqual(uids.slice(0, REVEAL_LIMIT).filter((u) => shown.includes(u)));
  });

  it('does not duplicate a caller who is already among the first 40', async () => {
    const deps = makeDeps();
    const snap = await posted(deps);
    await settle(deps, snap.postId, ['t2_a', 't2_b', 't2_c']);
    const res = await reveal(deps, snap.postId, 't2_b');
    expect(res.settlers.map((s) => s.userId)).toEqual(['t2_b', 't2_a', 't2_c']);
    expect(res.settlers.map((s) => s.isMe)).toEqual([true, false, false]);
  });

  it('reveals no cells to a logged-out or unsolved caller, only the count', async () => {
    const deps = makeDeps();
    const snap = await posted(deps);
    await settle(deps, snap.postId, ['t2_a', 't2_b']);
    expect(await reveal(deps, snap.postId, undefined)).toEqual({ settlers: [], more: 2 });
    expect(await reveal(deps, snap.postId, 't2_unsolved')).toEqual({ settlers: [], more: 2 });
  });
});
