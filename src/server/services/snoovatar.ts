import type { RevealResponse, Settler } from '../../shared/api';
import { idx, landCells, sameCell } from '../../shared/puzzle/grid';
import type { Cell } from '../../shared/puzzle/types';
import type { Deps } from '../deps';
import { keys, SNOO_TTL_SECONDS } from '../keys';
import { loadSnapshot } from './snapshot';
import type { Snapshot } from './snapshot';

/** First settlers by solve order returned by the reveal (the caller is added when outside). */
export const REVEAL_LIMIT = 40;
/** At most this many settlers share one cell; the rest count toward `more`. */
export const MAX_PER_CELL = 3;

/**
 * The user's snoovatar URL, cached in `snoo:<uid>` for 7 days. An empty string
 * is cached for users without one so the lookup is not repeated.
 */
export const resolveSnoovatar = async (
  deps: Deps,
  uid: string,
  username: string
): Promise<string | null> => {
  const key = keys.snoo(uid);
  const cached = await deps.redis.get(key);
  if (cached !== undefined) return cached === '' ? null : cached;
  const url = (await deps.reddit.getSnoovatarUrl(username)) ?? '';
  await deps.redis.set(key, url);
  await deps.redis.expire(key, SNOO_TTL_SECONDS);
  return url === '' ? null : url;
};

/** 32-bit FNV-1a over the UTF-16 code units of `s` (user IDs are ASCII). */
export const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** Deterministic cell for a settler: `fnv1a(uid) % emptyCells.length`. */
export const settlerCell = (uid: string, emptyCells: Cell[]): Cell => {
  const cell = emptyCells[fnv1a(uid) % emptyCells.length];
  if (cell === undefined) throw new Error('settlerCell: no empty cells');
  return cell;
};

/** Land cells not holding a landmark in the solution (the reveal shows the solved island). */
export const emptyCellsOf = (snap: Snapshot): Cell[] => {
  const occupied = snap.landmarks.flatMap((id) => {
    const cell = snap.solution[id];
    return cell === undefined ? [] : [cell];
  });
  return landCells(snap.land).filter((cell) => !occupied.some((o) => sameCell(o, cell)));
};

const cachedSnoovatar = async (deps: Deps, uid: string): Promise<string | null> => {
  const v = await deps.redis.get(keys.snoo(uid));
  return v === undefined || v === '' ? null : v;
};

/**
 * Settlers for the result screen (spec 5.9): the first 40 solvers by solve order
 * plus the caller when outside them, the caller first so theirs lands first,
 * each on its hashed empty cell with at most three per cell. `more` counts every
 * solver not returned.
 *
 * Settler cells are a subset of the solution's empty cells, so they are only
 * revealed to a caller who has solved; anyone else (including logged out) gets
 * the count alone.
 */
export const reveal = async (
  deps: Deps,
  postId: string,
  me: string | undefined
): Promise<RevealResponse> => {
  const snap = await loadSnapshot(deps, postId);
  if (!snap) return { settlers: [], more: 0 };

  const key = keys.settlers(postId);
  const total = await deps.redis.zCard(key);
  const meSolved = me !== undefined && (await deps.redis.zScore(key, me)) !== undefined;
  const empty = emptyCellsOf(snap);
  if (me === undefined || !meSolved || empty.length === 0) return { settlers: [], more: total };

  const first = await deps.redis.zRange(key, 0, REVEAL_LIMIT - 1, { by: 'rank' });
  const order = [me, ...first.map((m) => m.member).filter((uid) => uid !== me)];

  const perCell = new Map<number, number>();
  const placed: Array<{ uid: string; cell: Cell }> = [];
  for (const uid of order) {
    const cell = settlerCell(uid, empty);
    const n = perCell.get(idx(cell)) ?? 0;
    if (n >= MAX_PER_CELL) continue;
    perCell.set(idx(cell), n + 1);
    placed.push({ uid, cell });
  }

  const settlers = await Promise.all(
    placed.map(
      async ({ uid, cell }): Promise<Settler> => ({
        userId: uid,
        snoovatar: await cachedSnoovatar(deps, uid),
        cell,
        isMe: uid === me,
      })
    )
  );
  return { settlers, more: Math.max(0, total - settlers.length) };
};
