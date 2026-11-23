import type { Schedule } from '../shared/puzzle/types';
import type {
  CommentId,
  CommentLike,
  CreateFlairTemplateLike,
  Ctx,
  Deps,
  FlairTemplateLike,
  PostId,
  PostLike,
  RedditLike,
  RedisLike,
  SetOptionsLike,
  SettingValue,
  SettingsLike,
  SetUserFlairLike,
  SubmitCommentLike,
  SubmitCustomPostLike,
  SubredditLike,
  UserLike,
  ZMember,
  ZRangeOptionsLike,
} from './deps';
import { FIXTURE_PRACTICE, FIXTURE_SCHEDULE } from './puzzles/fixture';

/** In-memory Redis covering the subset of commands the app uses. */
export class FakeRedis implements RedisLike {
  strings = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  zsets = new Map<string, Map<string, number>>();
  /** Seconds, as last requested by `expire`. */
  ttls = new Map<string, number>();

  private has(key: string): boolean {
    return this.strings.has(key) || this.hashes.has(key) || this.zsets.has(key);
  }

  private hash(key: string): Map<string, string> {
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    return h;
  }

  private zset(key: string): Map<string, number> {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    return z;
  }

  private sorted(key: string): ZMember[] {
    const z = this.zsets.get(key);
    if (!z) return [];
    return [...z.entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : 1));
  }

  async get(key: string): Promise<string | undefined> {
    return this.strings.get(key);
  }

  async set(key: string, value: string, options?: SetOptionsLike): Promise<string> {
    if (options?.nx && this.strings.has(key)) return '';
    if (options?.xx && !this.strings.has(key)) return '';
    this.strings.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.strings.delete(key);
      this.hashes.delete(key);
      this.zsets.delete(key);
      this.ttls.delete(key);
    }
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.filter((k) => this.has(k)).length;
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (this.has(key)) this.ttls.set(key, seconds);
  }

  async incrBy(key: string, value: number): Promise<number> {
    const next = Number(this.strings.get(key) ?? '0') + value;
    this.strings.set(key, String(next));
    return next;
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    return this.hashes.get(key)?.get(field);
  }

  async hSet(key: string, fieldValues: Record<string, string>): Promise<number> {
    const h = this.hash(key);
    let added = 0;
    for (const [field, value] of Object.entries(fieldValues)) {
      if (!h.has(field)) added++;
      h.set(field, value);
    }
    return added;
  }

  async hSetNX(key: string, field: string, value: string): Promise<number> {
    const h = this.hash(key);
    if (h.has(field)) return 0;
    h.set(field, value);
    return 1;
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }

  async hIncrBy(key: string, field: string, value: number): Promise<number> {
    const h = this.hash(key);
    const next = Number(h.get(field) ?? '0') + value;
    h.set(field, String(next));
    return next;
  }

  async zAdd(key: string, ...members: ZMember[]): Promise<number> {
    const z = this.zset(key);
    let added = 0;
    for (const { member, score } of members) {
      if (!z.has(member)) added++;
      z.set(member, score);
    }
    return added;
  }

  async zCard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  async zRank(key: string, member: string): Promise<number | undefined> {
    const i = this.sorted(key).findIndex((m) => m.member === member);
    return i === -1 ? undefined : i;
  }

  async zScore(key: string, member: string): Promise<number | undefined> {
    return this.zsets.get(key)?.get(member);
  }

  /**
   * Mirrors `@devvit/redis` RedisClient.js `zRange` (lines 366-392): `limit`
   * is only legal with `by: 'score' | 'lex'` (throws otherwise); score and lex
   * queries default to `offset 0, count 1000` (so results cap at 1,000) while
   * rank queries are uncapped; `start`/`stop` are passed to Redis unchanged
   * with the REV flag, so with `reverse` and `by: 'score'` `start` is the
   * maximum and `stop` the minimum. Lex ranges are not supported here.
   */
  async zRange(
    key: string,
    start: number | string,
    stop: number | string,
    options?: ZRangeOptionsLike
  ): Promise<ZMember[]> {
    const by = options?.by ?? 'rank';
    const reverse = options?.reverse === true;
    if (by === 'lex') throw new Error('FakeRedis: zRange by lex is not supported');
    if (options?.limit && by !== 'score') {
      throw new Error(
        `zRange parsing error: 'limit' only allowed when 'options.by' is 'lex' or 'score'`
      );
    }
    const ordered = this.sorted(key);
    const all = reverse ? [...ordered].reverse() : ordered;
    if (by === 'rank') {
      // Redis index rules: negatives count from the end, start clamps to 0 only
      // after the comparison, start past stop or past the end yields [], stop
      // clamps to the last element. With REV the indices address the reversed set.
      const n = all.length;
      const lo = Math.max(0, rankIndex(start, n));
      const hi = rankIndex(stop, n);
      if (lo > hi || lo >= n) return [];
      return all.slice(lo, Math.min(hi, n - 1) + 1);
    }
    const lower = scoreBound(reverse ? stop : start);
    const upper = scoreBound(reverse ? start : stop);
    const matched = all.filter((m) => atLeast(m.score, lower) && atMost(m.score, upper));
    const offset = options?.limit?.offset ?? 0;
    const count = options?.limit?.count ?? ZRANGE_DEFAULT_COUNT;
    return matched.slice(offset, count < 0 ? undefined : offset + count);
  }
}

/** RedisClient.js line 368: score and lex queries send `count: 1000` unless a limit is given. */
export const ZRANGE_DEFAULT_COUNT = 1000;

/** Converts a Redis rank index: negatives count from the end. No clamping here. */
const rankIndex = (v: number | string, n: number): number => {
  const i = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(i)) throw new Error(`FakeRedis: bad rank ${v}`);
  return i < 0 ? n + i : i;
};

type ScoreBound = { value: number; exclusive: boolean };

/** Parses a Redis score bound: number, '-inf', '+inf', or an exclusive '(' prefix. */
const scoreBound = (v: number | string): ScoreBound => {
  if (typeof v === 'number') return { value: v, exclusive: false };
  const exclusive = v.startsWith('(');
  const raw = exclusive ? v.slice(1) : v;
  if (raw === '-inf') return { value: -Infinity, exclusive };
  if (raw === '+inf' || raw === 'inf') return { value: Infinity, exclusive };
  const n = Number(raw);
  if (raw === '' || !Number.isFinite(n)) throw new Error(`FakeRedis: bad score bound ${v}`);
  return { value: n, exclusive };
};

const atLeast = (score: number, b: ScoreBound): boolean =>
  b.exclusive ? score > b.value : score >= b.value;
const atMost = (score: number, b: ScoreBound): boolean =>
  b.exclusive ? score < b.value : score <= b.value;

export type FakeCall = { method: string; args: unknown[] };
export type FakeComment = {
  id: CommentId;
  parentId: string;
  text: string;
  runAs: 'USER' | 'APP' | undefined;
  sticky: boolean;
  distinguished: boolean;
};

/** Records every call; returns incrementing `t3_<n>` / `t1_<n>` IDs. */
export class FakeReddit implements RedditLike {
  calls: FakeCall[] = [];
  posts: Array<SubmitCustomPostLike & { id: PostId }> = [];
  comments: FakeComment[] = [];
  flairTemplates: FlairTemplateLike[] = [];
  setFlairs: SetUserFlairLike[] = [];
  /** Current user flair text by username, as the subreddit would report it. */
  userFlair: Record<string, string | undefined> = {};
  snoovatars: Record<string, string> = {};
  currentUsername: string | undefined = 'tester';
  /** What `getCurrentSubreddit` reports (used when the context header is missing). */
  currentSubredditName = 'testsub';
  subscribeCalls = 0;
  /** While true every `submitCustomPost` rejects (simulates a Reddit outage). */
  failSubmitPost = false;
  /** While true `submitCustomPost` rejects only when `flairText` is present. */
  rejectFlairText = false;
  /** While true every `submitComment` rejects. */
  failSubmitComment = false;
  private nextId = 1;

  private record(method: string, args: unknown[]): void {
    this.calls.push({ method, args });
  }

  callsTo(method: string): FakeCall[] {
    return this.calls.filter((c) => c.method === method);
  }

  async submitCustomPost(opts: SubmitCustomPostLike): Promise<PostLike> {
    this.record('submitCustomPost', [opts]);
    if (this.failSubmitPost) throw new Error('FakeReddit: submitCustomPost failed');
    if (this.rejectFlairText && opts.flairText !== undefined) {
      throw new Error('FakeReddit: flair not allowed');
    }
    const post = { ...opts, id: postId(this.nextId++) };
    this.posts.push(post);
    return { id: post.id };
  }

  async submitComment(opts: SubmitCommentLike): Promise<CommentLike> {
    this.record('submitComment', [opts]);
    if (this.failSubmitComment) throw new Error('FakeReddit: submitComment failed');
    const comment: FakeComment = {
      id: commentId(this.nextId++),
      parentId: opts.id,
      text: opts.text,
      runAs: opts.runAs,
      sticky: false,
      distinguished: false,
    };
    this.comments.push(comment);
    return {
      id: comment.id,
      distinguish: async (makeSticky?: boolean) => {
        this.record('distinguish', [comment.id, makeSticky]);
        comment.distinguished = true;
        comment.sticky = Boolean(makeSticky);
      },
    };
  }

  async getUserFlairTemplates(subredditName: string): Promise<FlairTemplateLike[]> {
    this.record('getUserFlairTemplates', [subredditName]);
    return [...this.flairTemplates];
  }

  async createUserFlairTemplate(opts: CreateFlairTemplateLike): Promise<FlairTemplateLike> {
    this.record('createUserFlairTemplate', [opts]);
    const template = { id: `tpl_${this.nextId++}`, text: opts.text };
    this.flairTemplates.push(template);
    return template;
  }

  async setUserFlair(opts: SetUserFlairLike): Promise<void> {
    this.record('setUserFlair', [opts]);
    this.setFlairs.push(opts);
    this.userFlair[opts.username] = opts.text;
  }

  async getCurrentUser(): Promise<UserLike | undefined> {
    this.record('getCurrentUser', []);
    const username = this.currentUsername;
    if (username === undefined) return undefined;
    return {
      username,
      getUserFlairBySubreddit: async (subreddit: string) => {
        this.record('getUserFlairBySubreddit', [username, subreddit]);
        return { flairText: this.userFlair[username] };
      },
    };
  }

  async getSnoovatarUrl(username: string): Promise<string | undefined> {
    this.record('getSnoovatarUrl', [username]);
    return this.snoovatars[username];
  }

  async subscribeToCurrentSubreddit(): Promise<void> {
    this.record('subscribeToCurrentSubreddit', []);
    this.subscribeCalls++;
  }

  async getCurrentSubreddit(): Promise<SubredditLike> {
    this.record('getCurrentSubreddit', []);
    return { name: this.currentSubredditName };
  }
}

const postId = (n: number): PostId => `t3_${n.toString(36)}`;
const commentId = (n: number): CommentId => `t1_${n.toString(36)}`;

export class FakeSettings implements SettingsLike {
  values = new Map<string, SettingValue>();

  constructor(initial: Record<string, SettingValue> = {}) {
    for (const [k, v] of Object.entries(initial)) this.values.set(k, v);
  }

  async get(name: string): Promise<SettingValue | undefined> {
    return this.values.get(name);
  }
}

export type TestDeps = Omit<Deps, 'redis' | 'reddit' | 'settings'> & {
  redis: FakeRedis;
  reddit: FakeReddit;
  settings: FakeSettings;
  /** Mutable clock; `deps.now()` reads `clock.now`. */
  clock: { now: number };
  /** Mutable identity; `deps.ctx()` returns this object. */
  ctxState: Ctx;
  /** Every `deps.sleep(ms)` request, in order. */
  sleeps: number[];
};

export type DepsOverrides = {
  now?: number;
  ctx?: Partial<Ctx>;
  settings?: Record<string, SettingValue>;
  schedule?: Schedule;
  practice?: Schedule;
};

/** 2026-12-01T12:00:00Z, the posting time of the first fixture island. */
export const FIXTURE_NOW = Date.UTC(2026, 11, 1, 12, 0, 0);

export const makeDeps = (overrides: DepsOverrides = {}): TestDeps => {
  const clock = { now: overrides.now ?? FIXTURE_NOW };
  const ctxState: Ctx = {
    userId: 't2_u1',
    username: 'tester',
    postId: undefined,
    subredditName: 'cartographer_test',
    ...overrides.ctx,
  };
  const reddit = new FakeReddit();
  reddit.currentUsername = ctxState.username;
  const sleeps: number[] = [];
  return {
    redis: new FakeRedis(),
    reddit,
    settings: new FakeSettings(overrides.settings),
    now: () => clock.now,
    ctx: () => ctxState,
    schedule: overrides.schedule ?? FIXTURE_SCHEDULE,
    practice: overrides.practice ?? FIXTURE_PRACTICE,
    // Records the request and yields one macrotask instead of waiting, so a
    // concurrent request running on the in-memory fakes can finish meanwhile.
    sleep: (ms: number) => {
      sleeps.push(ms);
      return new Promise<void>((resolve) => setTimeout(resolve, 0));
    },
    clock,
    ctxState,
    sleeps,
  };
};
