import { navigateTo, showShareSheet, showToast } from '@devvit/web/client';
import { useEffect, useId, useState } from 'react';

import type { Result, Settler, Stats } from '../../shared/api';
import { cardTime, chartCardText } from '../../shared/card';
import type { Placement, Puzzle } from '../../shared/puzzle/types';
import { TIER_LABEL } from '../../shared/tiers';
import { getCover, postComment, postSubscribe } from './api';
import { IslandView } from './components/IslandView';
import { useReveal } from './useReveal';

/** Dated islands are numbered from 1; practice islands are 0. */
const isPractice = (puzzle: Puzzle): boolean => puzzle.number <= 0;

const statsLine = (stats: Stats): string =>
  `${stats.charted} charted · ${stats.cleanPct}% clean` +
  (stats.medianMs !== null ? ` · median ${cardTime(stats.medianMs)}` : '');

const resultsThreadUrl = (postId: string): string =>
  `https://www.reddit.com/comments/${postId.replace(/^t3_/, '')}`;

const settlerCaption = (done: boolean, shown: number, more: number): string => {
  if (!done) return 'Settlers arriving…';
  const total = shown + more;
  if (total === 0) return '';
  if (total === 1) return 'You are the first to settle here.';
  return more > 0 ? `${total} settlers landed (${more} not shown)` : `${total} settlers landed`;
};

export type ResultScreenProps = {
  puzzle: Puzzle;
  placements: Placement;
  result: Result;
  stats: Stats | null;
  settlers: Settler[];
  /** Settlers the reveal did not return. Defaults to 0. */
  more?: number;
  revealDone: boolean;
  /** Resolves true when the chart is posted (or was already), false on failure. */
  onComment: () => Promise<boolean>;
  onShare: () => void;
  /** Resolves true when the subscription went through, false on failure. */
  onSubscribe: () => Promise<boolean>;
  onResults: () => void;
};

type CommentState = 'idle' | 'busy' | 'posted' | 'failed';
type SubscribeState = 'idle' | 'busy' | 'done' | 'failed';

const PRIMARY =
  'flex h-12 items-center justify-center rounded-xl bg-lit px-4 text-base font-semibold text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lit disabled:bg-lit/55 disabled:shadow-none';
const SECONDARY =
  'flex h-12 items-center justify-center rounded-xl border border-land bg-paper px-4 text-base font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

/**
 * The finish screen (spec 4.4). Presentational: every side effect arrives as a
 * callback, so `ResultContainer` below wires the API and Devvit effects.
 */
export const ResultScreen = ({
  puzzle,
  placements,
  result,
  stats,
  settlers,
  more = 0,
  revealDone,
  onComment,
  onShare,
  onSubscribe,
  onResults,
}: ResultScreenProps) => {
  const headingId = useId();
  const [commentState, setCommentState] = useState<CommentState>('idle');
  const [subscribeState, setSubscribeState] = useState<SubscribeState>('idle');

  const practice = isPractice(puzzle);
  const posted = result.commented || commentState === 'posted';
  const showSubscribe = !result.subscribePromptSeen || subscribeState === 'done';
  const { streak } = result;

  const comment = async (): Promise<void> => {
    if (posted || commentState === 'busy') return;
    setCommentState('busy');
    const ok = await onComment().catch(() => false);
    setCommentState(ok ? 'posted' : 'failed');
  };

  const subscribe = async (): Promise<void> => {
    if (subscribeState === 'busy' || subscribeState === 'done') return;
    setSubscribeState('busy');
    const ok = await onSubscribe().catch(() => false);
    setSubscribeState(ok ? 'done' : 'failed');
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="sr-only">
        Island charted
      </h2>

      <div className="relative">
        <IslandView land={puzzle.land} placements={placements} settlers={settlers} size="board" />
        <div aria-hidden="true" className="pointer-events-none absolute top-3 right-2">
          <span
            data-stamp
            className={[
              'block -rotate-12 rounded-md border-4 border-lit bg-paper/85 px-3 py-0.5',
              'text-2xl font-black tracking-widest text-lit uppercase shadow-sm',
              'motion-safe:transition-[scale,opacity] motion-safe:duration-300 motion-safe:ease-out',
              'motion-safe:starting:scale-150 motion-safe:starting:opacity-0',
            ].join(' ')}
          >
            Charted
          </span>
        </div>
      </div>

      <p aria-live="polite" className="min-h-4 text-center text-xs text-muted">
        {settlerCaption(revealDone, settlers.length, more)}
      </p>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-land bg-sand/40 p-2">
          <dt className="text-xs text-muted">Time</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">
            {cardTime(result.elapsedMs)}
          </dd>
        </div>
        <div className="rounded-xl border border-land bg-sand/40 p-2">
          <dt className="text-xs text-muted">Corrections</dt>
          <dd className="text-lg font-semibold tabular-nums">{result.corrections}</dd>
        </div>
        <div className="rounded-xl border border-land bg-sand/40 p-2">
          <dt className="text-xs text-muted">Rank</dt>
          <dd className="text-lg font-semibold tabular-nums">{`#${result.rank} of ${result.total}`}</dd>
        </div>
      </dl>

      {stats ? (
        <p className="text-center text-sm text-ink/80">{statsLine(stats)}</p>
      ) : (
        <p aria-hidden="true" className="mx-auto h-5 w-56 rounded bg-land/50 motion-safe:animate-pulse" />
      )}

      <div className="flex flex-col items-center gap-1.5 text-center">
        {practice ? (
          <p className="text-sm text-ink/70">Practice island. Streaks are unchanged.</p>
        ) : (
          <>
            <p className="text-base font-semibold">
              {streak.current > 0 ? `${streak.current}-day streak` : 'No streak yet'}
              <span className="font-normal text-muted">{` · best ${streak.best}`}</span>
            </p>
            {streak.tier || streak.steadyHand ? (
              <div className="flex flex-wrap justify-center gap-2">
                {streak.tier ? (
                  <span className="rounded-full border border-land bg-paper px-3 py-1 text-xs font-semibold">
                    {TIER_LABEL[streak.tier]}
                  </span>
                ) : null}
                {streak.steadyHand ? (
                  <span className="rounded-full bg-lit px-3 py-1 text-xs font-semibold text-white">
                    Steady Hand ✦
                  </span>
                ) : null}
              </div>
            ) : null}
            {streak.counted ? null : (
              <p className="text-xs text-muted">
                Charted after the 24-hour window, so your streak did not move.
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={PRIMARY}
            disabled={posted || commentState === 'busy'}
            onClick={() => {
              void comment();
            }}
          >
            {posted ? 'Posted' : commentState === 'busy' ? 'Posting…' : 'Post my chart'}
          </button>
          <button type="button" className={SECONDARY} onClick={onShare}>
            Share
          </button>
        </div>
        {commentState === 'failed' ? (
          <p
            role="alert"
            className="rounded-lg border border-warn/60 bg-warn/10 px-3 py-2 text-center text-sm text-ink"
          >
            Could not post your chart. Try again.
          </p>
        ) : (
          <p className="text-center text-xs text-muted">
            Post my chart replies to the results thread with your pins and time.
          </p>
        )}
        {showSubscribe ? (
          subscribeState === 'done' ? (
            <p role="status" className="py-3 text-center text-sm font-medium text-ink">
              Subscribed. See you tomorrow.
            </p>
          ) : (
            <>
              <button
                type="button"
                className={SECONDARY}
                disabled={subscribeState === 'busy'}
                onClick={() => {
                  void subscribe();
                }}
              >
                Join for tomorrow&apos;s island
              </button>
              {subscribeState === 'failed' ? (
                <p
                  role="alert"
                  className="rounded-lg border border-warn/60 bg-warn/10 px-3 py-2 text-center text-sm text-ink"
                >
                  Could not subscribe. Try again.
                </p>
              ) : null}
            </>
          )
        ) : null}
        <button
          type="button"
          onClick={onResults}
          className="h-11 rounded-xl text-sm font-medium text-ink/80 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ink"
        >
          Results thread
        </button>
      </div>
    </section>
  );
};

type ResultContainerProps = {
  postId: string;
  puzzle: Puzzle;
  placements: Placement;
  result: Result;
  /** Stats from the chart response; null on a reload of a solved island, then `/api/cover` supplies them. */
  stats: Stats | null;
};

/** `ResultScreen` wired to the reveal, `/api/*`, and the Devvit share and navigation effects. */
export const ResultContainer = ({ postId, puzzle, placements, result, stats }: ResultContainerProps) => {
  const reveal = useReveal();
  const [coverStats, setCoverStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (stats) return;
    let cancelled = false;
    void getCover().then((res) => {
      if (!cancelled && !('error' in res)) setCoverStats(res.stats);
    });
    return () => {
      cancelled = true;
    };
  }, [stats]);

  const onComment = async (): Promise<boolean> => {
    const res = await postComment();
    return 'error' in res ? res.error === 'already' : true;
  };

  const onSubscribe = async (): Promise<boolean> => {
    const res = await postSubscribe();
    return !('error' in res);
  };

  const onShare = () => {
    const text = chartCardText({
      number: puzzle.number,
      name: puzzle.name,
      history: result.history,
      elapsedMs: result.elapsedMs,
      corrections: result.corrections,
      streakCurrent: result.streak.current,
      practice: isPractice(puzzle),
    });
    // Reddit appends the post link when `post` is omitted.
    void showShareSheet({ text }).catch(() => showToast('Sharing is not available here.'));
  };

  return (
    <ResultScreen
      puzzle={puzzle}
      placements={placements}
      result={result}
      stats={stats ?? coverStats}
      settlers={reveal.settlers}
      more={reveal.more}
      revealDone={reveal.done}
      onComment={onComment}
      onShare={onShare}
      onSubscribe={onSubscribe}
      onResults={() => navigateTo(resultsThreadUrl(postId))}
    />
  );
};
