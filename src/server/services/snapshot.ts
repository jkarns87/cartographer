import type { IslandPostData, IslandSummary } from '../../shared/api';
import type { Puzzle, ScheduleEntry } from '../../shared/puzzle/types';
import type { Deps } from '../deps';
import { keys, postKeys } from '../keys';
import { parseEntry } from './schedule';

/** The full schedule entry copied into Redis at post time (spec section 3.5). */
export type Snapshot = ScheduleEntry & { postedAt: number; postId: string };

export const saveSnapshot = async (deps: Deps, snap: Snapshot): Promise<void> => {
  await deps.redis.set(keys.puzzle(snap.postId), JSON.stringify(snap));
};

const parseSnapshot = (raw: unknown, where: string): Snapshot => {
  const entry = parseEntry(raw, where);
  if (typeof raw !== 'object' || raw === null) throw new Error(`${where}: not an object`);
  const postedAt = 'postedAt' in raw ? raw.postedAt : undefined;
  const postId = 'postId' in raw ? raw.postId : undefined;
  if (typeof postedAt !== 'number') throw new Error(`${where}: postedAt must be a number`);
  if (typeof postId !== 'string') throw new Error(`${where}: postId must be a string`);
  return { ...entry, postedAt, postId };
};

export const loadSnapshot = async (deps: Deps, postId: string): Promise<Snapshot | undefined> => {
  const raw = await deps.redis.get(keys.puzzle(postId));
  if (raw === undefined) return undefined;
  const parsed: unknown = JSON.parse(raw);
  return parseSnapshot(parsed, `snapshot ${postId}`);
};

/** Removes the post-scoped keys and the day marker when it still points at this post. */
export const deletePostKeys = async (deps: Deps, postId: string): Promise<void> => {
  let snap: Snapshot | undefined;
  try {
    snap = await loadSnapshot(deps, postId);
  } catch (err) {
    console.error(`deletePostKeys: unreadable snapshot for ${postId}`, err);
  }
  if (snap?.date) {
    const marker = keys.posted(snap.date);
    if ((await deps.redis.get(marker)) === postId) await deps.redis.del(marker);
  }
  await deps.redis.del(...postKeys(postId));
};

/** The client-safe puzzle: never the solution, never the posting fields. */
export const toPuzzle = (snap: Snapshot): Puzzle => ({
  id: snap.id,
  number: snap.number,
  name: snap.name,
  difficulty: snap.difficulty,
  land: snap.land,
  landmarks: snap.landmarks,
  clues: snap.clues,
});

export const toPostData = (entry: ScheduleEntry): IslandPostData => ({
  number: entry.number,
  name: entry.name,
  difficulty: entry.difficulty,
  land: entry.land,
  landmarkCount: entry.landmarks.length,
  date: entry.date,
});

export const toSummary = (snap: Snapshot): IslandSummary => toPostData(snap);
