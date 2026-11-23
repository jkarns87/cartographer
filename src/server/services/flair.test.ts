import { describe, expect, it } from 'vitest';
import type { StreakInfo } from '../../shared/api';
import { makeDeps } from '../fakes';
import { keys } from '../keys';
import { TIER_LABEL } from '../../shared/tiers';
import { TIER_COLOR, TIERS, applyFlair, ensureFlairTemplates, flairTextFor } from './flair';

const info = (over: Partial<StreakInfo> = {}): StreakInfo => ({
  current: 3,
  best: 3,
  cleanRun: 1,
  total: 3,
  tier: 'navigator',
  steadyHand: false,
  counted: true,
  ...over,
});

describe('flairTextFor', () => {
  it.each<[Partial<StreakInfo>, string | null]>([
    [{ tier: null }, null],
    [{}, 'Navigator · 3d'],
    [{ steadyHand: true }, 'Navigator · 3d ✦'],
    [{ tier: 'deckhand', current: 1 }, 'Deckhand · 1d'],
    [{ tier: 'cartographer', current: 7 }, 'Cartographer · 7d'],
    [{ tier: 'master', current: 30, steadyHand: true }, 'Master Cartographer · 30d ✦'],
  ])('%o -> %s', (over, expected) => {
    expect(flairTextFor(info(over))).toBe(expected);
  });
});

describe('ensureFlairTemplates', () => {
  it('creates the four templates once and reuses them', async () => {
    const deps = makeDeps();
    const first = await ensureFlairTemplates(deps);
    const creates = deps.reddit.callsTo('createUserFlairTemplate');
    expect(creates).toHaveLength(4);
    expect(creates.map((c) => c.args[0])).toEqual(
      TIERS.map((tier) => ({
        subredditName: 'cartographer_test',
        text: TIER_LABEL[tier],
        backgroundColor: TIER_COLOR[tier],
        textColor: 'dark',
        allowUserEdits: false,
      }))
    );
    expect(Object.keys(first).sort()).toEqual([...TIERS].sort());
    expect(await deps.redis.hGetAll(keys.flairTemplates())).toEqual(first);

    const second = await ensureFlairTemplates(deps);
    expect(second).toEqual(first);
    expect(deps.reddit.callsTo('createUserFlairTemplate')).toHaveLength(4);
    expect(deps.reddit.callsTo('getUserFlairTemplates')).toHaveLength(1);
  });

  it('adopts templates that already exist in the subreddit by text', async () => {
    const deps = makeDeps();
    deps.reddit.flairTemplates.push({ id: 'existing-nav', text: 'Navigator' });
    const templates = await ensureFlairTemplates(deps);
    expect(templates.navigator).toBe('existing-nav');
    expect(deps.reddit.callsTo('createUserFlairTemplate')).toHaveLength(3);
  });

  it('fills in only the tiers missing from redis', async () => {
    const deps = makeDeps();
    await deps.redis.hSet(keys.flairTemplates(), { deckhand: 'd1', master: 'm1' });
    const templates = await ensureFlairTemplates(deps);
    expect(templates.deckhand).toBe('d1');
    expect(templates.master).toBe('m1');
    expect(deps.reddit.callsTo('createUserFlairTemplate').map((c) => c.args[0])).toMatchObject([
      { text: 'Navigator' },
      { text: 'Cartographer' },
    ]);
  });

  it('resolves the subreddit from Reddit when the context header is missing', async () => {
    const deps = makeDeps({ ctx: { subredditName: undefined } });
    await ensureFlairTemplates(deps);
    expect(deps.reddit.callsTo('getUserFlairTemplates')[0]?.args).toEqual(['testsub']);
    expect(deps.reddit.callsTo('createUserFlairTemplate').map((c) => c.args[0])).toMatchObject(
      TIERS.map(() => ({ subredditName: 'testsub' }))
    );
  });
});

describe('applyFlair', () => {
  it('sets flair when the user has none', async () => {
    const deps = makeDeps();
    expect(await applyFlair(deps, 't2_u1', 'tester', info())).toBe('set');
    const templates = await deps.redis.hGetAll(keys.flairTemplates());
    expect(deps.reddit.setFlairs).toEqual([
      {
        subredditName: 'cartographer_test',
        username: 'tester',
        flairTemplateId: templates.navigator,
        text: 'Navigator · 3d',
      },
    ]);
    expect(await deps.redis.get(keys.flair('t2_u1'))).toBe('Navigator · 3d');
  });

  it('skips when the user wears flair this app did not write', async () => {
    const deps = makeDeps();
    deps.reddit.userFlair.tester = 'Verified Human';
    expect(await applyFlair(deps, 't2_u1', 'tester', info())).toBe('skipped');
    expect(deps.reddit.setFlairs).toHaveLength(0);
    expect(await deps.redis.exists(keys.flair('t2_u1'))).toBe(0);
  });

  it('overwrites flair that equals the last text this app wrote', async () => {
    const deps = makeDeps();
    expect(await applyFlair(deps, 't2_u1', 'tester', info())).toBe('set');
    expect(await applyFlair(deps, 't2_u1', 'tester', info({ current: 4 }))).toBe('set');
    expect(deps.reddit.setFlairs.map((f) => f.text)).toEqual(['Navigator · 3d', 'Navigator · 4d']);
    expect(await deps.redis.get(keys.flair('t2_u1'))).toBe('Navigator · 4d');
  });

  it('skips when the user changed their flair after we wrote it', async () => {
    const deps = makeDeps();
    await applyFlair(deps, 't2_u1', 'tester', info());
    deps.reddit.userFlair.tester = 'Something else';
    expect(await applyFlair(deps, 't2_u1', 'tester', info({ current: 4 }))).toBe('skipped');
    expect(deps.reddit.setFlairs).toHaveLength(1);
  });

  it('is disabled by the subreddit setting', async () => {
    const deps = makeDeps({ settings: { flairEnabled: false } });
    expect(await applyFlair(deps, 't2_u1', 'tester', info())).toBe('disabled');
    expect(deps.reddit.calls).toHaveLength(0);
  });

  it('treats a missing setting as enabled', async () => {
    const deps = makeDeps({ settings: {} });
    expect(await applyFlair(deps, 't2_u1', 'tester', info())).toBe('set');
  });

  it('skips when there is no tier yet', async () => {
    const deps = makeDeps();
    expect(await applyFlair(deps, 't2_u1', 'tester', info({ tier: null }))).toBe('skipped');
    expect(deps.reddit.calls).toHaveLength(0);
  });

  it('skips when the current user cannot be resolved', async () => {
    const deps = makeDeps();
    deps.reddit.currentUsername = undefined;
    expect(await applyFlair(deps, 't2_u1', 'tester', info())).toBe('skipped');
    expect(deps.reddit.setFlairs).toHaveLength(0);
  });

  it('resolves the subreddit from Reddit when the context header is missing', async () => {
    const deps = makeDeps({ ctx: { subredditName: undefined } });
    expect(await applyFlair(deps, 't2_u1', 'tester', info())).toBe('set');
    expect(deps.reddit.callsTo('getUserFlairBySubreddit')[0]?.args).toEqual(['tester', 'testsub']);
    expect(deps.reddit.setFlairs[0]?.subredditName).toBe('testsub');
  });
});
