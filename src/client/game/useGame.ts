import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import type { ApiError, ChartResponse, GameResponse, PlaceRequest } from '../../shared/api';
import { computeHint, MAX_HINTS } from '../../shared/puzzle/hints';
import type { Hint } from '../../shared/puzzle/hints';
import { evaluateClue } from '../../shared/puzzle/predicates';
import type { ClueState } from '../../shared/puzzle/types';
import { getGame, postChart, postPlace } from './api';
import { reduce } from './reducer';
import type { GameAction, GameState } from './reducer';

export type GamePhase = 'loading' | 'login' | 'error' | 'ready';

export type UseGame = {
  phase: GamePhase;
  game: GameResponse | null;
  state: GameState;
  dispatch: (action: GameAction) => void;
  clueStates: ClueState[];
  allPlaced: boolean;
  canChart: boolean;
  chart: () => Promise<void>;
  charting: boolean;
  chartResult: ChartResponse | null;
  chartError: ApiError['error'] | null;
  clearChartError: () => void;
  reload: () => void;
  /**
   * Works out a hint from the clues and charges it (an `H` in the history)
   * unless there is nothing to say. Null once the island's hints are used up.
   */
  hint: () => Hint | null;
  hintsLeft: number;
};

const SAVE_DEBOUNCE_MS = 400;
const EMPTY: GameState = { selected: null, placements: {}, history: '', corrections: 0, hints: 0 };

/**
 * Loads the game, owns the interaction state, debounces saves, and charts.
 *
 * Saves are keyed on `history`: it grows by one character for every place or
 * lift and is untouched by selection, so comparing it to the last saved value
 * is an exact "placements changed" test. The server returns the puzzle without
 * its solution; nothing here could reveal it.
 */
export const useGame = (): UseGame => {
  const [game, setGame] = useState<GameResponse | null>(null);
  const [loadError, setLoadError] = useState<ApiError['error'] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [charting, setCharting] = useState(false);
  const [chartResult, setChartResult] = useState<ChartResponse | null>(null);
  const [chartError, setChartError] = useState<ApiError['error'] | null>(null);

  const puzzle = game?.puzzle ?? null;
  const reducer = useCallback(
    (s: GameState, a: GameAction): GameState => (puzzle ? reduce(s, a, puzzle) : s),
    [puzzle]
  );
  const [state, dispatch] = useReducer(reducer, EMPTY);

  const savedHistoryRef = useRef<string | null>(null);
  const pendingRef = useRef<PlaceRequest | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getGame().then((res) => {
      if (cancelled) return;
      if ('error' in res) {
        setLoadError(res.error);
        return;
      }
      // The server state replaces anything queued locally; a stale pending
      // save must not be flushed over it by the next chart().
      pendingRef.current = null;
      savedHistoryRef.current = res.history;
      setGame(res);
      dispatch({
        type: 'hydrate',
        placements: res.placements,
        history: res.history,
        corrections: res.corrections,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const flush = useCallback(async (): Promise<void> => {
    const req = pendingRef.current;
    if (!req) return;
    pendingRef.current = null;
    savedHistoryRef.current = req.history;
    await postPlace(req);
  }, []);

  useEffect(() => {
    if (!game) return;
    if (state.history === savedHistoryRef.current) {
      pendingRef.current = null;
      return;
    }
    pendingRef.current = {
      placements: state.placements,
      history: state.history,
      corrections: state.corrections,
    };
    const id = setTimeout(() => {
      void flush();
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [game, state, flush]);

  const clueStates = useMemo<ClueState[]>(
    () =>
      puzzle
        ? puzzle.clues.map((clue) =>
            evaluateClue(clue, state.placements, puzzle.land, puzzle.landmarks)
          )
        : [],
    [puzzle, state.placements]
  );

  const allPlaced = puzzle
    ? puzzle.landmarks.every((id) => state.placements[id] !== undefined)
    : false;
  const canChart = allPlaced && clueStates.length > 0 && clueStates.every((s) => s === 'lit');

  const reload = useCallback(() => {
    setLoadError(null);
    setAttempt((n) => n + 1);
  }, []);

  const chart = useCallback(async (): Promise<void> => {
    if (!game || charting) return;
    setCharting(true);
    setChartError(null);
    await flush();
    const res = await postChart({
      placements: state.placements,
      history: state.history,
      corrections: state.corrections,
    });
    if ('error' in res) {
      setChartError(res.error);
    } else {
      // A repeat chart (another device, a double tap) also lands here: the
      // server answers 200 with the stored result, never 409 'already'.
      setChartResult(res);
    }
    setCharting(false);
  }, [game, charting, flush, state]);

  const clearChartError = useCallback(() => setChartError(null), []);

  const hint = useCallback((): Hint | null => {
    if (!puzzle || state.hints >= MAX_HINTS) return null;
    const h = computeHint(puzzle, state.placements);
    if (h.kind !== 'none') dispatch({ type: 'hint' });
    return h;
  }, [puzzle, state.hints, state.placements]);
  const hintsLeft = Math.max(0, MAX_HINTS - state.hints);

  const phase: GamePhase = game
    ? 'ready'
    : loadError === 'login'
      ? 'login'
      : loadError
        ? 'error'
        : 'loading';

  return {
    phase,
    game,
    state,
    dispatch,
    clueStates,
    allPlaced,
    canChart,
    chart,
    charting,
    chartResult,
    chartError,
    clearChartError,
    reload,
    hint,
    hintsLeft,
  };
};
