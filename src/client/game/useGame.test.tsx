import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameResponse } from '../../shared/api';
import { maskFromRows } from '../../shared/puzzle/grid';
import type { Placement } from '../../shared/puzzle/types';
import { useGame } from './useGame';

const ISLAND = maskFromRows([
  '..LL..',
  '.LLLL.',
  'LLLLL.',
  '.LLLLL',
  '..LLL.',
  '...L..',
]);

const LAND_A = { r: 2, c: 2 };
const LAND_B = { r: 3, c: 4 };

const game = (placements: Placement, history: string): GameResponse => ({
  postId: 't3_test',
  puzzle: {
    id: 'p1',
    number: 1,
    name: 'Test Isle',
    difficulty: 'easy',
    land: ISLAND,
    landmarks: ['lighthouse', 'windmill'],
    clues: [{ type: 'inland', a: 'windmill' }],
  },
  placements,
  history,
  corrections: 0,
  startedAt: 1_000,
  serverNow: 5_000,
  status: history ? 'in-progress' : 'unsolved',
  tutorialSeen: true,
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = { url: string; body: unknown };

const setup = () => {
  const calls: Call[] = [];
  let nextGame: GameResponse = game({}, '');
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    if (url === '/api/game') return json(nextGame);
    if (url === '/api/place') return json({ ok: true });
    if (url === '/api/chart') return json({ error: 'mismatch' }, 409);
    return json({ error: 'not-found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    setNextGame: (g: GameResponse) => {
      nextGame = g;
    },
  };
};

const settle = () => act(async () => {
  await vi.advanceTimersByTimeAsync(0);
});

describe('useGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads, hydrates, and saves a placement after the 400 ms debounce', async () => {
    const { calls } = setup();
    const { result } = renderHook(() => useGame());
    expect(result.current.phase).toBe('loading');
    await settle();
    expect(result.current.phase).toBe('ready');
    expect(result.current.state.selected).toBe('lighthouse');

    act(() => result.current.dispatch({ type: 'tapCell', cell: LAND_A }));
    expect(calls.filter((c) => c.url === '/api/place')).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(calls.filter((c) => c.url === '/api/place')).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const saves = calls.filter((c) => c.url === '/api/place');
    expect(saves).toHaveLength(1);
    expect(saves[0]?.body).toEqual({ placements: { lighthouse: LAND_A }, history: 'P', corrections: 0 });
  });

  it('drops a pending save when a reload hydrates fresh server state', async () => {
    const { calls, setNextGame } = setup();
    const { result } = renderHook(() => useGame());
    await settle();

    // A local change queues a save that has not flushed yet.
    act(() => result.current.dispatch({ type: 'tapCell', cell: LAND_A }));
    expect(result.current.state.placements).toEqual({ lighthouse: LAND_A });

    // The server now holds a different state (for example after an 'already'
    // response); reloading must replace the local state and discard the
    // queued save instead of letting the next chart() flush it.
    const fresh = game({ windmill: LAND_B }, 'P');
    setNextGame(fresh);
    act(() => result.current.reload());
    await settle();
    expect(result.current.state.placements).toEqual(fresh.placements);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(calls.filter((c) => c.url === '/api/place')).toHaveLength(0);

    await act(async () => {
      await result.current.chart();
    });
    expect(calls.filter((c) => c.url === '/api/place')).toHaveLength(0);
    const chart = calls.find((c) => c.url === '/api/chart');
    expect(chart?.body).toEqual({ placements: fresh.placements, history: 'P', corrections: 0 });
    expect(result.current.chartError).toBe('mismatch');
  });
});
