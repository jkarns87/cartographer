import { context, requestExpandedMode } from '@devvit/web/client';
import { useEffect, useState } from 'react';

import type { CoverResponse, IslandPostData, Settler, Stats } from '../../shared/api';
import { DIFFICULTY_LABEL } from '../../shared/puzzle/types';
import { getCover, getReveal } from '../game/api';
import { IslandView } from '../game/components/IslandView';
import { formatElapsed } from '../game/format';
import { parsePostData } from './postData';

/**
 * The inline cover (`splash.html`). It must paint without the network, so the
 * island comes from `context.postData`; `/api/cover` then adds community stats
 * and, once the viewer has solved it, the stamped result and the settlers.
 * Keep imports light: this entry must stay small.
 */

// `context` is undefined outside a Devvit web view (local Vite dev).
const readPostData = (): unknown => context?.postData;

const statsText = (stats: Stats): string => {
  if (stats.charted === 0) return 'Nobody has charted it yet. Be the first.';
  const median = stats.medianMs !== null ? ` · median ${formatElapsed(stats.medianMs)}` : '';
  return `${stats.charted} charted · ${stats.cleanPct}% clean${median}`;
};

const ctaLabel = (cover: CoverResponse | null): string => {
  if (cover?.me.status === 'solved') return 'View your chart';
  if (cover?.me.status === 'in-progress') return 'Continue charting';
  return 'Chart this island';
};

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export const Cover = () => {
  const [postIsland] = useState<IslandPostData | null>(() => parsePostData(readPostData()));
  const [cover, setCover] = useState<CoverResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [settlers, setSettlers] = useState<Settler[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const res = await getCover();
      if (cancelled) return;
      if ('error' in res) {
        setFailed(true);
        return;
      }
      setCover(res);
      if (res.me.status !== 'solved') return;
      const reveal = await getReveal();
      if (!cancelled) setSettlers(reveal.settlers);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const island = postIsland ?? cover?.island ?? null;
  const solved = cover?.me.status === 'solved' ? (cover.me.result ?? null) : null;

  return (
    <main className="flex h-full min-h-0 overflow-hidden bg-paper text-ink select-none">
      <div className="mx-auto flex h-full w-full max-w-2xl items-center gap-4 px-4 py-3">
        <div className="relative w-[44%] max-w-72 shrink-0 [&_[data-settler]]:animate-none">
          {island ? (
            <IslandView land={island.land} placements={{}} settlers={settlers} size="cover" />
          ) : (
            <div
              aria-hidden="true"
              className={['aspect-square w-full rounded-xl bg-water/70', failed ? '' : 'animate-pulse'].join(' ')}
            />
          )}
          {solved ? (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="-rotate-12 rounded-md border-[3px] border-lit bg-paper/85 px-2 py-0.5 text-lg font-black tracking-widest text-lit uppercase">
                Charted
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {island ? (
            <>
              <p className="text-xs font-semibold tracking-wider text-ink/60 uppercase">
                {island.date === null ? 'Cartographer practice' : `Cartographer #${island.number}`}
              </p>
              <h1 className="text-xl leading-tight font-bold text-balance sm:text-2xl">{island.name}</h1>
              <p className="text-sm text-ink/70">
                {DIFFICULTY_LABEL[island.difficulty]} · {plural(island.landmarkCount, 'landmark')}
              </p>
            </>
          ) : (
            <h1 className="text-xl font-bold">Cartographer</h1>
          )}

          {solved ? (
            <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm" aria-label="Your result">
              <div className="flex gap-1">
                <dt className="text-ink/60">Time</dt>
                <dd className="font-mono font-semibold tabular-nums">{formatElapsed(solved.elapsedMs)}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-ink/60">Corrections</dt>
                <dd className="font-semibold tabular-nums">{solved.corrections}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-ink/60">Rank</dt>
                <dd className="font-semibold tabular-nums">{`#${solved.rank} of ${solved.total}`}</dd>
              </div>
            </dl>
          ) : null}

          <p aria-live="polite" className="min-h-5 text-sm text-ink/80">
            {cover ? statsText(cover.stats) : null}
          </p>

          <button
            type="button"
            onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
            className="mt-1 h-12 w-full max-w-xs rounded-xl bg-lit px-4 text-base font-semibold text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lit active:brightness-95"
          >
            {ctaLabel(cover)}
          </button>
        </div>
      </div>
    </main>
  );
};
