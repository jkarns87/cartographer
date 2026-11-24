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

/**
 * The solve's authoritative board, written once by `chart` right after it
 * claims the solve, and never by `savePlacements`.
 *
 * Why: `savePlacements` checks `solvedAt` and then writes, which is not atomic.
 * A `/place` that passes the check just before a chart claims the solve can
 * land its in-progress `placements`/`history`/`corrections` after the chart.
 * Instead of trying to make that write atomic, the chart stores its values in
 * these separate fields and `readProgress` prefers them whenever present, so a
 * late in-progress write can only change fields that readers ignore once the
 * solve is final. The plain fields stay the in-progress board.
 */
export const FINAL = {
  placements: 'finalPlacements',
  history: 'finalHistory',
  corrections: 'finalCorrections',
} as const;

/** `P` place, `L` lift, `H` hint (see `shared/puzzle/hints`). */
export const HISTORY_RE = /^[PLH]{0,200}$/;
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

/**
 * Parsed user hash. The `FINAL` fields written by `chart` win over the
 * in-progress fields, so a solved board reads back exactly as it was charted.
 */
export const readProgress = async (deps: Deps, postId: string, uid: string): Promise<UserProgress> => {
  const h = await deps.redis.hGetAll(keys.user(postId, uid));
  return {
    startedAt: num(h[F.startedAt]),
    placements: parseStoredPlacements(h[FINAL.placements] ?? h[F.placements]),
    history: h[FINAL.history] ?? h[F.history] ?? '',
    corrections: num(h[FINAL.corrections] ?? h[F.corrections]) ?? 0,
    solvedAt: num(h[F.solvedAt]),
    elapsedMs: num(h[F.elapsedMs]),
    commented: h[F.commented] === '1',
    subscribePromptSeen: h[F.subscribePromptSeen] === '1',
  };
};

/** The stored `startedAt`, or null when the user never opened the game (no GET /api/game). */
export const readStartedAt = async (deps: Deps, postId: string, uid: string): Promise<number | null> =>
  num(await deps.redis.hGet(keys.user(postId, uid), F.startedAt));

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

/**
 * Soft save of the in-progress board. Ignored once the user has solved. The
 * check-then-write is not atomic; a write that slips past a concurrent chart is
 * harmless because readers prefer the chart's `FINAL` fields (see `FINAL`).
 */
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
 * `solvedAt - startedAt` (the same value) for the window between claiming a
 * solve and `chart` writing `elapsedMs`, which it does last.
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
