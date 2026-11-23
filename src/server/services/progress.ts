import type { PlaceRequest, PlayStatus } from '../../shared/api';
import { LANDMARKS, SIZE } from '../../shared/puzzle/types';
import type { Cell, LandmarkId, Placement } from '../../shared/puzzle/types';
import type { Deps } from '../deps';
import { keys, USER_TTL_SECONDS } from '../keys';

/** Parsed `post:<id>:user:<uid>` hash (spec section 5.4). */
export type UserProgress = {
  startedAt: number | null;
  placements: Placement;
  history: string;
  corrections: number;
  solvedAt: number | null;
  elapsedMs: number | null;
  commented: boolean;
  subscribePromptSeen: boolean;
};

export const EMPTY_PROGRESS: UserProgress = {
  startedAt: null,
  placements: {},
  history: '',
  corrections: 0,
  solvedAt: null,
  elapsedMs: null,
  commented: false,
  subscribePromptSeen: false,
};

/** Field names in the per-user hash. */
export const F = {
  startedAt: 'startedAt',
  placements: 'placements',
  history: 'history',
  corrections: 'corrections',
  solvedAt: 'solvedAt',
  elapsedMs: 'elapsedMs',
  commented: 'commented',
  subscribePromptSeen: 'subscribePromptSeen',
} satisfies Record<keyof UserProgress, string>;

export const HISTORY_RE = /^[PL]{0,200}$/;
export const MAX_CORRECTIONS = 999;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isCoord = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < SIZE;

const parseCell = (v: unknown): Cell | undefined => {
  if (!isRecord(v)) return undefined;
  const { r, c } = v;
  return isCoord(r) && isCoord(c) ? { r, c } : undefined;
};

const landmarkIn = (landmarks: readonly LandmarkId[], key: string): LandmarkId | undefined =>
  landmarks.find((id) => id === key);

/**
 * Validates an untrusted `{ placements, history, corrections }` body. Placement
 * keys must belong to `landmarks` and cells must be integer coordinates on the
 * grid; anything else returns undefined. Extra fields (such as a client-reported
 * time) are ignored.
 */
export const parsePlaceRequest = (
  raw: unknown,
  landmarks: readonly LandmarkId[]
): PlaceRequest | undefined => {
  if (!isRecord(raw)) return undefined;
  const { placements, history, corrections } = raw;
  if (typeof history !== 'string' || !HISTORY_RE.test(history)) return undefined;
  if (
    typeof corrections !== 'number' ||
    !Number.isInteger(corrections) ||
    corrections < 0 ||
    corrections > MAX_CORRECTIONS
  ) {
    return undefined;
  }
  if (!isRecord(placements)) return undefined;
  const out: Placement = {};
  for (const [key, value] of Object.entries(placements)) {
    const id = landmarkIn(landmarks, key);
    const cell = parseCell(value);
    if (id === undefined || cell === undefined) return undefined;
    out[id] = cell;
  }
  return { placements: out, history, corrections };
};

/** Lenient parse of the stored placements JSON: unreadable entries are dropped. */
const parseStoredPlacements = (raw: string | undefined): Placement => {
  if (raw === undefined || raw === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  const out: Placement = {};
  for (const [key, value] of Object.entries(parsed)) {
    const id = landmarkIn(LANDMARKS, key);
    const cell = parseCell(value);
    if (id !== undefined && cell !== undefined) out[id] = cell;
  }
  return out;
};

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const readProgress = async (deps: Deps, postId: string, uid: string): Promise<UserProgress> => {
  const h = await deps.redis.hGetAll(keys.user(postId, uid));
  return {
    startedAt: num(h[F.startedAt]),
    placements: parseStoredPlacements(h[F.placements]),
    history: h[F.history] ?? '',
    corrections: num(h[F.corrections]) ?? 0,
    solvedAt: num(h[F.solvedAt]),
    elapsedMs: num(h[F.elapsedMs]),
    commented: h[F.commented] === '1',
    subscribePromptSeen: h[F.subscribePromptSeen] === '1',
  };
};

/**
 * Starts the user's timer on first contact with the post (spec 4.5). Atomic via
 * `hSetNX`; only the call that claims `startedAt` counts toward `stats.started`.
 * Refreshes the 90-day TTL on every call. Returns the stored `startedAt`.
 */
export const ensureStarted = async (deps: Deps, postId: string, uid: string): Promise<number> => {
  const key = keys.user(postId, uid);
  const now = deps.now();
  const claimed = await deps.redis.hSetNX(key, F.startedAt, String(now));
  await deps.redis.expire(key, USER_TTL_SECONDS);
  if (claimed === 1) {
    await deps.redis.hIncrBy(keys.stats(postId), 'started', 1);
    return now;
  }
  return num(await deps.redis.hGet(key, F.startedAt)) ?? now;
};

/** Soft save of the in-progress board. Ignored once the user has solved. */
export const savePlacements = async (
  deps: Deps,
  postId: string,
  uid: string,
  req: PlaceRequest
): Promise<void> => {
  const key = keys.user(postId, uid);
  if ((await deps.redis.hGet(key, F.solvedAt)) !== undefined) return;
  await deps.redis.hSet(key, {
    [F.placements]: JSON.stringify(req.placements),
    [F.history]: req.history,
    [F.corrections]: String(req.corrections),
  });
  await deps.redis.expire(key, USER_TTL_SECONDS);
};

export const statusOf = (p: UserProgress): PlayStatus => {
  if (p.solvedAt !== null) return 'solved';
  if (p.startedAt !== null || Object.keys(p.placements).length > 0) return 'in-progress';
  return 'unsolved';
};

/**
 * Server-measured solve time. Prefers the stored `elapsedMs`; falls back to
 * `solvedAt - startedAt` for the instant between claiming a solve and writing
 * its fields (a concurrent double submit can observe that window).
 */
export const elapsedOf = (p: UserProgress): number => {
  if (p.elapsedMs !== null) return p.elapsedMs;
  if (p.solvedAt === null || p.startedAt === null) return 0;
  return Math.max(0, p.solvedAt - p.startedAt);
};

/** Set only by POST /api/subscribe; the result screen hides the Join button once true. */
export const markSubscribePromptSeen = async (deps: Deps, postId: string, uid: string): Promise<void> => {
  const key = keys.user(postId, uid);
  await deps.redis.hSet(key, { [F.subscribePromptSeen]: '1' });
  await deps.redis.expire(key, USER_TTL_SECONDS);
};

/** The first-run overlay flag lives on the user's streak hash, so it is per user across posts. */
export const readTutorialSeen = async (deps: Deps, uid: string): Promise<boolean> =>
  (await deps.redis.hGet(keys.streak(uid), 'tutorialSeen')) === '1';

export const markTutorialSeen = async (deps: Deps, uid: string): Promise<void> => {
  await deps.redis.hSet(keys.streak(uid), { tutorialSeen: '1' });
};
