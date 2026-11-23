import type { StreakInfo, Tier } from '../../shared/api';
import { TIER_LABEL } from '../../shared/tiers';
import type { Deps } from '../deps';
import { keys } from '../keys';
import { resolveSubredditName } from './subreddit';

export const TIERS: readonly Tier[] = [
  'deckhand',
  'navigator',
  'cartographer',
  'master',
];

export const TIER_COLOR: Record<Tier, string> = {
  deckhand: '#C8B49A',
  navigator: '#6FA8DC',
  cartographer: '#5B8C5A',
  master: '#B8860B',
};

/** `Navigator · 5d`, with a trailing ` ✦` for Steady Hand; null before the first tier. */
export const flairTextFor = (info: StreakInfo): string | null => {
  if (info.tier === null) return null;
  return `${TIER_LABEL[info.tier]} · ${info.current}d${info.steadyHand ? ' ✦' : ''}`;
};

const byTier = (f: (tier: Tier) => string): Record<Tier, string> => ({
  deckhand: f('deckhand'),
  navigator: f('navigator'),
  cartographer: f('cartographer'),
  master: f('master'),
});

/**
 * Ensures the four user flair templates exist and their IDs are stored in
 * `flair:templates`. Reuses templates already present in the subreddit by text.
 */
export const ensureFlairTemplates = async (
  deps: Deps
): Promise<Record<Tier, string>> => {
  const stored = await deps.redis.hGetAll(keys.flairTemplates());
  const missing = TIERS.filter((tier) => !stored[tier]);
  if (missing.length === 0) return byTier((tier) => stored[tier] ?? '');

  const subredditName = await resolveSubredditName(deps);
  const existing = await deps.reddit.getUserFlairTemplates(subredditName);
  const ids: Record<string, string> = { ...stored };
  for (const tier of missing) {
    const label = TIER_LABEL[tier];
    const found = existing.find((t) => t.text === label);
    if (found) {
      ids[tier] = found.id;
      continue;
    }
    const created = await deps.reddit.createUserFlairTemplate({
      subredditName,
      text: label,
      backgroundColor: TIER_COLOR[tier],
      textColor: 'dark',
      allowUserEdits: false,
    });
    ids[tier] = created.id;
  }
  const templates = byTier((tier) => ids[tier] ?? '');
  await deps.redis.hSet(keys.flairTemplates(), templates);
  return templates;
};

export const POST_FLAIR_TEXT = 'Daily Island';
export const POST_FLAIR_COLOR = '#5B93BA';

/**
 * Ensures the "Daily Island" post flair template exists and its ID is stored in
 * `flair:post`. Reddit rejects `flairText` on a submit that carries no template
 * ID (seen in playtest on 2026-11-23), so posting reads this first.
 */
export const ensurePostFlairTemplate = async (
  deps: Deps,
  knownSubredditName?: string
): Promise<string> => {
  const stored = await deps.redis.get(keys.postFlair());
  if (stored) return stored;
  const subredditName =
    knownSubredditName ?? (await resolveSubredditName(deps));
  const existing = await deps.reddit.getPostFlairTemplates(subredditName);
  const found = existing.find((t) => t.text === POST_FLAIR_TEXT);
  const id =
    found?.id ??
    (
      await deps.reddit.createPostFlairTemplate({
        subredditName,
        text: POST_FLAIR_TEXT,
        backgroundColor: POST_FLAIR_COLOR,
        textColor: 'light',
        allowUserEdits: false,
      })
    ).id;
  await deps.redis.set(keys.postFlair(), id);
  return id;
};

export type FlairOutcome = 'set' | 'skipped' | 'disabled';

/**
 * Writes streak flair after a counted solve. Only overwrites flair that is
 * empty or that this app wrote last, so user-chosen flair is never clobbered.
 */
export const applyFlair = async (
  deps: Deps,
  uid: string,
  username: string,
  info: StreakInfo
): Promise<FlairOutcome> => {
  if ((await deps.settings.get('flairEnabled')) === false) return 'disabled';
  const text = flairTextFor(info);
  if (text === null || info.tier === null) return 'skipped';

  const subredditName = await resolveSubredditName(deps);
  const user = await deps.reddit.getCurrentUser();
  if (!user) return 'skipped';
  const current =
    (await user.getUserFlairBySubreddit(subredditName))?.flairText ?? '';
  const last = await deps.redis.get(keys.flair(uid));
  if (current !== '' && current !== last) return 'skipped';

  const templates = await ensureFlairTemplates(deps);
  await deps.reddit.setUserFlair({
    subredditName,
    username,
    flairTemplateId: templates[info.tier],
    text,
  });
  await deps.redis.set(keys.flair(uid), text);
  return 'set';
};
