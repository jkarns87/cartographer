import { showLoginPrompt } from '@devvit/web/client';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import type { ApiError } from '../../shared/api';
import { clueLandmarks } from '../../shared/puzzle/predicates';
import { DIFFICULTY_LABEL, EXPEDITION_LANDMARKS } from '../../shared/puzzle/types';
import type { LandmarkId } from '../../shared/puzzle/types';
import { Board } from './components/Board';
import { ChartButton } from './components/ChartButton';
import { ClueSheet } from './components/ClueSheet';
import { Header } from './components/Header';
import { Legend } from './components/Legend';
import { ResultContainer } from './ResultScreen';
import { Tutorial } from './Tutorial';
import { useGame } from './useGame';

const HIGHLIGHT_MS = 1200;

const CHART_ERROR_TEXT: Record<ApiError['error'], string> = {
  mismatch: 'The survey does not match your chart.',
  invalid: 'Every landmark must sit on its own land cell.',
  // Not returned by /api/chart (a repeat chart answers 200 with the stored
  // result); kept because the record must cover every ApiError code.
  already: 'This island is already charted.',
  login: 'Your session expired. Log in and try again.',
  'not-found': 'This island could not be found.',
  // Only /api/subscribe answers this; kept for the same reason as `already`.
  forbidden: 'Reddit did not allow that for your account.',
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
      className="h-12 w-full rounded-xl border border-land bg-sand px-6 text-base font-semibold text-ink-on-sand"
    >
      Try again
    </button>
  </Panel>
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
  const showTutorial = !game.tutorialSeen && !solved;
  // Dated islands are numbered from 1; spec 2.5 labels their 9-landmark draw Expedition.
  const expedition = puzzle.number > 0 && puzzle.landmarks.length === EXPEDITION_LANDMARKS;

  return (
    <main
      className={[
        'min-h-full bg-paper text-ink',
        chartVisible ? 'pb-24 md:pb-0 sm:landscape:pb-0' : '',
      ].join(' ')}
    >
      {/* Spec 4.3: landscape and desktop move the legend and clue sheet into a
          right sidebar. Both `md:` and `sm:landscape:` carry identical values so
          their order in the stylesheet never matters; the board column is capped
          at the viewport height so the square board fits beside the sidebar. */}
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-3 md:max-w-5xl md:flex-row md:items-start md:gap-6 sm:landscape:max-w-5xl sm:landscape:flex-row sm:landscape:items-start sm:landscape:gap-6">
        <div className="flex flex-col gap-3 md:sticky md:top-3 md:w-[min(30rem,max(12rem,calc(100dvh-6rem)))] md:shrink-0 sm:landscape:sticky sm:landscape:top-3 sm:landscape:w-[min(30rem,max(12rem,calc(100dvh-6rem)))] sm:landscape:shrink-0">
          <Header
            name={puzzle.name}
            startedAt={game.startedAt}
            serverNow={serverNowForHeader}
            corrections={result?.corrections ?? state.corrections}
            solved={solved}
          />
          <p className="-mt-2 text-xs text-muted">
            Island {puzzle.number > 0 ? `#${puzzle.number}` : '(practice)'} ·{' '}
            {DIFFICULTY_LABEL[puzzle.difficulty]} · {puzzle.landmarks.length} landmarks
            {expedition ? ' · Expedition' : ''}
          </p>
          {showResult ? (
            <ResultContainer
              postId={game.postId}
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
          <aside className="flex flex-col gap-4 md:min-w-0 md:flex-1 sm:landscape:min-w-0 sm:landscape:flex-1">
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
                  <button
                    type="button"
                    className="min-h-11 px-2 font-semibold underline underline-offset-2"
                    onClick={() => showLoginPrompt()}
                  >
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
      {showTutorial ? <Tutorial /> : null}
    </main>
  );
};
