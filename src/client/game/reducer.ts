import { isLand, landmarkAt } from '../../shared/puzzle/grid';
import { countHints, MAX_HINTS } from '../../shared/puzzle/hints';
import { LANDMARKS } from '../../shared/puzzle/types';
import type { Cell, LandmarkId, Placement, Puzzle } from '../../shared/puzzle/types';

export type GameState = {
  selected: LandmarkId | null;
  placements: Placement;
  history: string;
  corrections: number;
  /** Hints taken on this island; always `countHints(history)`. */
  hints: number;
};

export type GameAction =
  | { type: 'select'; id: LandmarkId }
  | { type: 'tapCell'; cell: Cell }
  | { type: 'lift'; id: LandmarkId }
  | { type: 'hint' }
  | { type: 'hydrate'; placements: Placement; history: string; corrections: number };

type PuzzleShape = Pick<Puzzle, 'land' | 'landmarks'>;

/** Lives in shared/puzzle/grid so IslandView (and the cover) need not import the reducer. */
export { landmarkAt };

/**
 * The next landmark in `landmarks` order that is not placed, starting after
 * `after` and wrapping around. Starts from the beginning when `after` is
 * omitted or not in the list. Null when everything is placed.
 */
export const nextUnplaced = (
  landmarks: LandmarkId[],
  placements: Placement,
  after?: LandmarkId
): LandmarkId | null => {
  const n = landmarks.length;
  if (n === 0) return null;
  const anchor = after === undefined ? -1 : landmarks.indexOf(after);
  for (let step = 1; step <= n; step++) {
    const id = landmarks[(anchor + step) % n];
    if (id !== undefined && placements[id] === undefined) return id;
  }
  return null;
};

export const initialState = (
  landmarks: LandmarkId[],
  placements: Placement = {},
  history = '',
  corrections = 0
): GameState => ({
  selected: nextUnplaced(landmarks, placements),
  placements,
  history,
  corrections,
  hints: countHints(history),
});

const without = (placements: Placement, id: LandmarkId): Placement => {
  const next: Placement = {};
  for (const key of LANDMARKS) {
    const cell = placements[key];
    if (key !== id && cell) next[key] = cell;
  }
  return next;
};

const lift = (state: GameState, id: LandmarkId): GameState => ({
  selected: id,
  placements: without(state.placements, id),
  history: state.history + 'L',
  corrections: state.corrections + 1,
  hints: state.hints,
});

const place = (state: GameState, id: LandmarkId, cell: Cell, puzzle: PuzzleShape): GameState => {
  const placements: Placement = { ...state.placements, [id]: cell };
  return {
    selected: nextUnplaced(puzzle.landmarks, placements, id),
    placements,
    history: state.history + 'P',
    corrections: state.corrections,
    hints: state.hints,
  };
};

/**
 * Pure interaction reducer (spec 4.3). Returns the same state object when an
 * action changes nothing so callers can bail out cheaply.
 */
export const reduce = (state: GameState, action: GameAction, puzzle: PuzzleShape): GameState => {
  switch (action.type) {
    case 'select': {
      if (!puzzle.landmarks.includes(action.id)) return state;
      if (state.placements[action.id] !== undefined) return state;
      if (state.selected === action.id) return state;
      return { ...state, selected: action.id };
    }
    case 'tapCell': {
      if (!isLand(puzzle.land, action.cell)) return state;
      const occupant = landmarkAt(state.placements, action.cell);
      if (occupant !== undefined) return lift(state, occupant);
      if (state.selected === null) return state;
      return place(state, state.selected, action.cell, puzzle);
    }
    case 'lift': {
      if (state.placements[action.id] === undefined) return state;
      return lift(state, action.id);
    }
    case 'hint': {
      if (state.hints >= MAX_HINTS) return state;
      return { ...state, history: state.history + 'H', hints: state.hints + 1 };
    }
    case 'hydrate':
      return {
        selected: nextUnplaced(puzzle.landmarks, action.placements),
        placements: action.placements,
        history: action.history,
        corrections: action.corrections,
        hints: countHints(action.history),
      };
  }
};
