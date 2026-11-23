import type { Tier } from './api';

/** Streak tier display names (spec 5.5), shared by the flair text and the result screen. */
export const TIER_LABEL: Record<Tier, string> = {
  deckhand: 'Deckhand',
  navigator: 'Navigator',
  cartographer: 'Cartographer',
  master: 'Master Cartographer',
};
