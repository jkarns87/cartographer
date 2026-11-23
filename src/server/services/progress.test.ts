import { describe, expect, it } from 'vitest';
import type { LandmarkId } from '../../shared/puzzle/types';
import { makeDeps } from '../fakes';
import { keys, USER_TTL_SECONDS } from '../keys';
import {
  EMPTY_PROGRESS,
  ensureStarted,
  parsePlaceRequest,
  readProgress,
  savePlacements,
  statusOf,
} from './progress';
import type { UserProgress } from './progress';

const POST = 't3_p';
const UID = 't2_u1';
const userKey = keys.user(POST, UID);

describe('readProgress', () => {
  it('returns empty progress for an unknown user', async () => {
    const deps = makeDeps();
    expect(await readProgress(deps, POST, UID)).toEqual(EMPTY_PROGRESS);
  });

  it('parses every stored field', async () => {
    const deps = makeDeps();
    await deps.redis.hSet(userKey, {
      startedAt: '1000',
      placements: JSON.stringify({ well: { r: 2, c: 1 }, farm: { r: 4, c: 1 } }),
      history: 'PPL',
      corrections: '1',
      solvedAt: '5000',
      elapsedMs: '4000',
      commented: '1',
      subscribePromptSeen: '1',
    });
    expect(await readProgress(deps, POST, UID)).toEqual({
      startedAt: 1000,
      placements: { well: { r: 2, c: 1 }, farm: { r: 4, c: 1 } },
      history: 'PPL',
      corrections: 1,
      solvedAt: 5000,
      elapsedMs: 4000,
      commented: true,
      subscribePromptSeen: true,
    });
  });

  it('tolerates corrupt stored values', async () => {
    const deps = makeDeps();
    await deps.redis.hSet(userKey, {
      startedAt: 'nope',
      placements: '{not json',
      corrections: 'x',
      commented: '0',
    });
    const p = await readProgress(deps, POST, UID);
    expect(p.startedAt).toBeNull();
    expect(p.placements).toEqual({});
    expect(p.corrections).toBe(0);
    expect(p.commented).toBe(false);
  });

  it('drops stored placement entries that are not landmarks or cells', async () => {
    const deps = makeDeps();
    await deps.redis.hSet(userKey, {
      placements: JSON.stringify({ well: { r: 2, c: 1 }, dragon: { r: 0, c: 0 }, farm: { r: 9, c: 0 } }),
    });
    expect((await readProgress(deps, POST, UID)).placements).toEqual({ well: { r: 2, c: 1 } });
  });
});

describe('ensureStarted', () => {
  it('records startedAt once, counts started once, and sets the TTL', async () => {
    const deps = makeDeps({ now: 1000 });
    expect(await ensureStarted(deps, POST, UID)).toBe(1000);
    deps.clock.now = 9000;
    expect(await ensureStarted(deps, POST, UID)).toBe(1000);
    expect(await deps.redis.hGet(userKey, 'startedAt')).toBe('1000');
    expect(await deps.redis.hGet(keys.stats(POST), 'started')).toBe('1');
    expect(deps.redis.ttls.get(userKey)).toBe(USER_TTL_SECONDS);
  });

  it('counts each user separately', async () => {
    const deps = makeDeps();
    await ensureStarted(deps, POST, 't2_a');
    await ensureStarted(deps, POST, 't2_b');
    await ensureStarted(deps, POST, 't2_a');
    expect(await deps.redis.hGet(keys.stats(POST), 'started')).toBe('2');
  });
});

describe('savePlacements', () => {
  const req = { placements: { well: { r: 2, c: 1 } }, history: 'P', corrections: 0 };

  it('stores placements, history and corrections', async () => {
    const deps = makeDeps();
    await savePlacements(deps, POST, UID, req);
    const p = await readProgress(deps, POST, UID);
    expect(p.placements).toEqual({ well: { r: 2, c: 1 } });
    expect(p.history).toBe('P');
    expect(p.corrections).toBe(0);
    expect(deps.redis.ttls.get(userKey)).toBe(USER_TTL_SECONDS);
  });

  it('is ignored once the user has solved', async () => {
    const deps = makeDeps();
    await deps.redis.hSet(userKey, { solvedAt: '5', history: 'PPPPPPP', corrections: '0' });
    await savePlacements(deps, POST, UID, { placements: {}, history: 'PL', corrections: 4 });
    const p = await readProgress(deps, POST, UID);
    expect(p.history).toBe('PPPPPPP');
    expect(p.corrections).toBe(0);
  });
});

describe('statusOf', () => {
  const p = (over: Partial<UserProgress>): UserProgress => ({ ...EMPTY_PROGRESS, ...over });

  it.each<[Partial<UserProgress>, string]>([
    [{}, 'unsolved'],
    [{ startedAt: 1 }, 'in-progress'],
    [{ placements: { well: { r: 0, c: 0 } } }, 'in-progress'],
    [{ startedAt: 1, solvedAt: 2 }, 'solved'],
  ])('%o -> %s', (over, expected) => {
    expect(statusOf(p(over))).toBe(expected);
  });
});

describe('parsePlaceRequest', () => {
  const landmarks: LandmarkId[] = ['well', 'farm'];
  const ok = { placements: { well: { r: 0, c: 5 } }, history: 'PLP', corrections: 1 };

  it('accepts a well-formed partial request and rebuilds the cells', () => {
    expect(parsePlaceRequest(ok, landmarks)).toEqual(ok);
    expect(
      parsePlaceRequest({ ...ok, placements: { well: { r: 1, c: 2, extra: true } }, elapsedMs: 1 }, landmarks)
    ).toEqual({ ...ok, placements: { well: { r: 1, c: 2 } } });
    expect(parsePlaceRequest({ placements: {}, history: '', corrections: 0 }, landmarks)).toEqual({
      placements: {},
      history: '',
      corrections: 0,
    });
  });

  it.each<[string, unknown]>([
    ['not an object', 'x'],
    ['null', null],
    ['an array', []],
    ['placements missing', { history: '', corrections: 0 }],
    ['placements an array', { ...ok, placements: [] }],
    ['a landmark outside the puzzle', { ...ok, placements: { temple: { r: 0, c: 0 } } }],
    ['a prototype key', JSON.parse('{"placements":{"__proto__":{"r":0,"c":0}},"history":"","corrections":0}')],
    ['a cell off the grid', { ...ok, placements: { well: { r: 6, c: 0 } } }],
    ['a negative cell', { ...ok, placements: { well: { r: 0, c: -1 } } }],
    ['a fractional cell', { ...ok, placements: { well: { r: 0.5, c: 0 } } }],
    ['a string cell', { ...ok, placements: { well: { r: '0', c: 0 } } }],
    ['a null cell', { ...ok, placements: { well: null } }],
    ['history with other letters', { ...ok, history: 'PXP' }],
    ['history too long', { ...ok, history: 'P'.repeat(201) }],
    ['history missing', { placements: {}, corrections: 0 }],
    ['corrections negative', { ...ok, corrections: -1 }],
    ['corrections too large', { ...ok, corrections: 1000 }],
    ['corrections fractional', { ...ok, corrections: 1.5 }],
    ['corrections a string', { ...ok, corrections: '1' }],
  ])('rejects %s', (_label, body) => {
    expect(parsePlaceRequest(body, landmarks)).toBeUndefined();
  });

  it('accepts the boundary values', () => {
    expect(
      parsePlaceRequest({ placements: {}, history: 'L'.repeat(200), corrections: 999 }, landmarks)
    ).toBeDefined();
  });
});
