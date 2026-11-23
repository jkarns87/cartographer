import type {
  ApiError,
  ChartRequest,
  ChartResponse,
  CoverResponse,
  GameResponse,
  PlaceRequest,
  RevealResponse,
} from '../../shared/api';

/**
 * Typed wrappers over the app's own `/api/*` routes. All paths are relative:
 * the webview may only fetch its own origin. Nothing here ever receives the
 * solution; the server returns `GameResponse.puzzle` without it.
 */

/** Every `ApiError` code; `satisfies` fails the build when one is added or removed. */
const KNOWN_ERRORS = {
  login: true,
  mismatch: true,
  invalid: true,
  already: true,
  'not-found': true,
  forbidden: true,
  server: true,
} satisfies Record<ApiError['error'], true>;

const ERROR_CODES: readonly string[] = Object.keys(KNOWN_ERRORS);

const isApiError = (value: unknown): value is ApiError =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof value.error === 'string' &&
  ERROR_CODES.some((code) => code === value.error);

const JSON_HEADERS = { 'content-type': 'application/json' };

const errorFrom = async (res: Response): Promise<ApiError> => {
  try {
    const body: unknown = await res.json();
    if (isApiError(body)) return body;
  } catch {
    // Non-JSON error body; fall through to the status mapping.
  }
  if (res.status === 401) return { error: 'login' };
  if (res.status === 403) return { error: 'forbidden' };
  if (res.status === 404) return { error: 'not-found' };
  return { error: 'server' };
};

const getJson = async <T>(path: string): Promise<T | ApiError> => {
  try {
    const res = await fetch(path, { credentials: 'same-origin' });
    if (!res.ok) return errorFrom(res);
    const body: T = await res.json();
    return body;
  } catch {
    return { error: 'server' };
  }
};

const postJson = async <T>(path: string, body?: unknown): Promise<T | ApiError> => {
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: JSON_HEADERS,
      body: body === undefined ? '{}' : JSON.stringify(body),
    });
    if (!res.ok) return errorFrom(res);
    const parsed: T = await res.json();
    return parsed;
  } catch {
    return { error: 'server' };
  }
};

export const getGame = (): Promise<GameResponse | ApiError> => getJson<GameResponse>('/api/game');

export const getCover = (): Promise<CoverResponse | ApiError> =>
  getJson<CoverResponse>('/api/cover');

/** Soft save. Failures are swallowed: the next change or the chart request carries the state. */
export const postPlace = async (req: PlaceRequest): Promise<void> => {
  await postJson<{ ok: true }>('/api/place', req);
};

export const postChart = (req: ChartRequest): Promise<ChartResponse | ApiError> =>
  postJson<ChartResponse>('/api/chart', req);

export const postComment = (): Promise<{ ok: true; commentId: string } | ApiError> =>
  postJson<{ ok: true; commentId: string }>('/api/comment');

export const postSubscribe = (): Promise<{ ok: true } | ApiError> =>
  postJson<{ ok: true }>('/api/subscribe');

export const postTutorialSeen = async (): Promise<void> => {
  await postJson<{ ok: true }>('/api/tutorial-seen');
};

export const getReveal = async (): Promise<RevealResponse> => {
  const res = await getJson<RevealResponse>('/api/reveal');
  return isApiError(res) ? { settlers: [], more: 0 } : res;
};
