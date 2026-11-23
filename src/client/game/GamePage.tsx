import { showLoginPrompt } from '@devvit/web/client';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import type { ApiError, Result, Stats } from '../../shared/api';
import { clueLandmarks } from '../../shared/puzzle/predicates';
import { DIFFICULTY_LABEL } from '../../shared/puzzle/types';
import type { LandmarkId, Placement, Puzzle } from '../../shared/puzzle/types';
import { Board } from './components/Board';
import { ChartButton } from './components/ChartButton';
import { ClueSheet } from './components/ClueSheet';
import { Header } from './components/Header';
import { IslandView } from './components/IslandView';
import { Legend } from './components/Legend';
import { formatElapsed } from './format';
import { useGame } from './useGame';

const HIGHLIGHT_MS = 1200;

const CHART_ERROR_TEXT: Record<ApiError['error'], string> = {
  mismatch: 'The survey does not match your chart.',
  invalid: 'Every landmark must sit on its own land cell.',
  already: 'This island is already charted. Loading your result…',
  login: 'Your session expired. Log in and try again.',
  'not-found': 'This island could not be found.',
  server: 'The survey office did not answer. Try again.',
};

const Panel = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-full items-center justify-center bg-paper px-4 py-8 text-ink">
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">{children}</div>
  </div>
);

const LoadingSkeleton = () => (
  <div className="mx-auto flex max-w-md flex-col gap-3 px-4 py-3" aria-busy="true" aria-label="Loading island">
    <div className="h-7 w-2/3 animate-pulse rounded bg-land/60" />
    <div className="aspect-square w-full animate-pulse rounded-xl bg-water/70" />
    <div className="flex gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-11 w-11 animate-pulse rounded-lg bg-land/60" />
      ))}
    </div>
    <div className="h-32 w-full animate-pulse rounded-xl bg-sand/70" />
  </div>
);

const LoginPanel = () => (
  <Panel>
    <h1 className="text-xl font-semibold">Log in to chart this island</h1>
    <p className="text-sm text-ink/70">Your time and streak are kept with your Reddit account.</p>
    <button
      type="button"
      onClick={() => showLoginPrompt()}
      className="h-12 w-full rounded-xl bg-lit px-6 text-base font-semibold text-white"
    >
      Log in
    </button>
  </Panel>
);

const ErrorPanel = ({ onRetry }: { onRetry: () => void }) => (
  <Panel>
    <h1 className="text-xl font-semibold">The island is in fog</h1>
    <p className="text-sm text-ink/70">Could not load today&apos;s survey.</p>
    <button
      type="button"
      onClick={onRetry}
      className="h-12 w-full rounded-xl border border-land bg-sand px-6 text-base font-semibold text-ink"
    >
      Try again
    </button>
  </Panel>
);

type ResultPlaceholderProps = {
  puzzle: Puzzle;
  placements: Placement;
  result: Result;
  stats: Stats | null;
};

/**
 * Minimal "Charted" panel. Task 7 replaces this with `ResultScreen`
 * (reveal animation, comment/share/subscribe/results buttons).
 */
export const ResultPlaceholder = ({ puzzle, placements, result, stats }: ResultPlaceholderProps) => (
  <section aria-label="Charted" className="flex flex-col gap-4">
    <div className="relative">
      <IslandView land={puzzle.land} placements={placements} size="board" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <span className="-rotate-12 rounded-md border-4 border-lit bg-paper/85 px-4 py-1 text-3xl font-black tracking-widest text-lit uppercase">
          Charted
        </span>
      </div>
    </div>
    <dl className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl border border-land bg-sand/60 p-2">
        <dt className="text-xs text-ink/60">Time</dt>
        <dd className="font-mono text-lg font-semibold">{formatElapsed(result.elapsedMs)}</dd>
      </div>
      <div className="rounded-xl border border-land bg-sand/60 p-2">
        <dt className="text-xs text-ink/60">Corrections</dt>
        <dd className="text-lg font-semibold">{result.corrections}</dd>
      </div>
      <div className="rounded-xl border border-land bg-sand/60 p-2">
        <dt className="text-xs text-ink/60">Rank</dt>
        <dd className="text-lg font-semibold">
          #{result.rank} <span className="text-sm font-normal text-ink/60">of {result.total}</span>
        </dd>
      </div>
    </dl>
    <p className="text-sm text-ink/80">
      Streak {result.streak.current}
      {result.streak.tier ? ` · ${result.streak.tier}` : ''}
      {result.streak.steadyHand ? ' · steady hand' : ''}
    </p>
    {stats ? (
      <p className="text-sm text-ink/70">
        {stats.charted} charted · {stats.cleanPct}% clean
        {stats.medianMs !== null ? ` · median ${formatElapsed(stats.medianMs)}` : ''}
      </p>
    ) : null}
  </section>
);

export const GamePage = () => {
  const g = useGame();
  const [highlight, setHighlight] = useState<LandmarkId[]>([]);

  useEffect(() => {
    if (highlight.length === 0) return;
    const id = setTimeout(() => setHighlight([]), HIGHLIGHT_MS);
    return () => clearTimeout(id);
  }, [highlight]);

  if (g.phase === 'loading') return <LoadingSkeleton />;
  if (g.phase === 'login') return <LoginPanel />;
  if (g.phase === 'error' || !g.game) return <ErrorPanel onRetry={g.reload} />;

  const { game, state, clueStates } = g;
  const { puzzle } = game;
  const result = g.chartResult?.result ?? game.result ?? null;
  const solved = g.chartResult !== null || game.status === 'solved';
  const showResult = solved && result !== null;
  const serverNowForHeader = showResult ? game.startedAt + result.elapsedMs : game.serverNow;
  const chartVisible = g.canChart && !solved;
  const locked = solved || g.charting;
  // Task 7: mount <Tutorial /> here when `game.tutorialSeen` is false.

  return (
    <main
      className={[
        'min-h-full bg-paper text-ink',
        chartVisible ? 'pb-24 lg:pb-0' : '',
      ].join(' ')}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-3 lg:max-w-5xl lg:flex-row lg:items-start lg:gap-8 lg:py-6">
        <div className="flex flex-col gap-3 lg:w-[30rem] lg:shrink-0">
          <Header
            name={puzzle.name}
            startedAt={game.startedAt}
            serverNow={serverNowForHeader}
            corrections={result?.corrections ?? state.corrections}
            solved={solved}
          />
          <p className="-mt-2 text-xs text-ink/60">
            Island {puzzle.number > 0 ? `#${puzzle.number}` : '(practice)'} ·{' '}
            {DIFFICULTY_LABEL[puzzle.difficulty]} · {puzzle.landmarks.length} landmarks
          </p>
          {showResult ? (
            <ResultPlaceholder
              puzzle={puzzle}
              placements={state.placements}
              result={result}
              stats={g.chartResult?.stats ?? null}
            />
          ) : (
            <Board
              land={puzzle.land}
              placements={state.placements}
              highlight={highlight}
              disabled={locked}
              onTapCell={(cell) => g.dispatch({ type: 'tapCell', cell })}
            />
          )}
        </div>

        {showResult ? null : (
          <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:min-w-0 lg:flex-1">
            <Legend
              landmarks={puzzle.landmarks}
              placements={state.placements}
              selected={state.selected}
              highlight={highlight}
              onSelect={(id) => {
                if (!locked) g.dispatch({ type: 'select', id });
              }}
              onLift={(id) => {
                if (!locked) g.dispatch({ type: 'lift', id });
              }}
            />
            {g.chartError ? (
              <p
                role="alert"
                className="rounded-lg border border-warn/60 bg-warn/10 px-3 py-2 text-sm text-ink"
              >
                {CHART_ERROR_TEXT[g.chartError]}{' '}
                {g.chartError === 'login' ? (
                  <button type="button" className="underline" onClick={() => showLoginPrompt()}>
                    Log in
                  </button>
                ) : null}
              </p>
            ) : null}
            <ClueSheet
              clues={puzzle.clues}
              states={clueStates}
              highlighted={highlight}
              onTapClue={(i) => {
                const clue = puzzle.clues[i];
                if (clue) setHighlight(clueLandmarks(clue));
              }}
            />
            <ChartButton
              visible={chartVisible}
              busy={g.charting}
              onChart={() => {
                void g.chart();
              }}
            />
          </aside>
        )}
      </div>
    </main>
  );
};
