import type { Cell, Difficulty, LandMask, Placement, Puzzle } from './puzzle/types';

export type Stats = {
  started: number;
  charted: number;
  /** 0 to 100, rounded. */
  cleanPct: number;
  medianMs: number | null;
};

export type Tier = 'deckhand' | 'navigator' | 'cartographer' | 'master';

export type StreakInfo = {
  current: number;
  best: number;
  cleanRun: number;
  total: number;
  tier: Tier | null;
  steadyHand: boolean;
  /** Whether this solve counted toward the streak (within 24h of posting, dated island). */
  counted: boolean;
};

export type Result = {
  elapsedMs: number;
  corrections: number;
  /** 'P' = place, 'L' = lift, in order. */
  history: string;
  /** 1-based rank by elapsed time among solvers. */
  rank: number;
  total: number;
  streak: StreakInfo;
  /** Hints taken; each added `HINT_PENALTY_MS` to `elapsedMs`. */
  hints: number;
  commented: boolean;
  subscribePromptSeen: boolean;
};

export type IslandSummary = {
  number: number;
  name: string;
  difficulty: Difficulty;
  land: LandMask;
  landmarkCount: number;
  date: string | null;
};

export type PlayStatus = 'unsolved' | 'in-progress' | 'solved';

export type CoverResponse = {
  postId: string;
  island: IslandSummary;
  stats: Stats;
  me: { loggedIn: boolean; status: PlayStatus; result?: Result };
};

export type GameResponse = {
  postId: string;
  puzzle: Puzzle;
  placements: Placement;
  history: string;
  corrections: number;
  startedAt: number;
  serverNow: number;
  status: PlayStatus;
  result?: Result;
  tutorialSeen: boolean;
};

export type PlaceRequest = { placements: Placement; history: string; corrections: number };

export type ChartRequest = PlaceRequest;

export type ChartResponse = { result: Result; stats: Stats };

export type Settler = { userId: string; snoovatar: string | null; cell: Cell; isMe: boolean };

export type RevealResponse = { settlers: Settler[]; more: number };

/** `forbidden`: Reddit refused to act as the player (an app not yet approved for user actions). */
export type ApiError = {
  error: 'login' | 'mismatch' | 'invalid' | 'already' | 'not-found' | 'forbidden' | 'server';
};

/** Shape stored in postData at post time. Must stay well under 2 KB. */
export type IslandPostData = {
  number: number;
  name: string;
  difficulty: Difficulty;
  land: LandMask;
  landmarkCount: number;
  date: string | null;
};
