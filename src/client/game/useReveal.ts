import { useEffect, useRef, useState } from 'react';

import type { RevealResponse, Settler } from '../../shared/api';
import { getReveal } from './api';

export type Reveal = {
  settlers: Settler[];
  /** Solvers beyond the ones returned (overflow past three per cell or the first 40). */
  more: number;
  /** True once `/api/reveal` has answered (an error counts as an empty answer). */
  done: boolean;
};

const PENDING: Reveal = { settlers: [], more: 0, done: false };

/**
 * Fetches `/api/reveal` once per mount, when `enabled`. The request is kept in a
 * ref so React StrictMode's effect replay reuses it instead of fetching twice.
 * `IslandView` animates settlers as they mount, so rendering `settlers` as soon
 * as they arrive is the reveal.
 */
export const useReveal = (enabled = true): Reveal => {
  const [reveal, setReveal] = useState<Reveal>(PENDING);
  const requestRef = useRef<Promise<RevealResponse> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    requestRef.current ??= getReveal();
    void requestRef.current.then((res) => {
      if (!cancelled) setReveal({ settlers: res.settlers, more: res.more, done: true });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return reveal;
};
