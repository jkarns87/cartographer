import type { Schedule } from '../shared/puzzle/types';

/**
 * Minimal structural interfaces over the Devvit clients. Services depend on
 * these so tests can pass in-memory fakes without module mocking. The real
 * `redis`, `reddit` and `settings` exports of `@devvit/web/server` satisfy them
 * structurally (checked by `src/server/index.ts` under `tsc`).
 */

/** Request identity, read lazily per request from the Devvit `context`. */
export type Ctx = {
  userId: string | undefined;
  username: string | undefined;
  postId: string | undefined;
  /**
   * From the optional `devvit-subreddit-name` header, which scheduler
   * invocations may omit. Read it through `resolveSubredditName`
   * (services/subreddit.ts), never directly.
   */
  subredditName: string | undefined;
};

export type PostId = `t3_${string}`;
export type CommentId = `t1_${string}`;

export const isPostId = (id: string): id is PostId => id.startsWith('t3_');
export const isCommentId = (id: string): id is CommentId =>
  id.startsWith('t1_');

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ZMember = { member: string; score: number };
export type SetOptionsLike = { nx?: boolean; xx?: boolean; expiration?: Date };
export type ZRangeOptionsLike = {
  by: 'rank' | 'score' | 'lex';
  reverse?: boolean;
  limit?: { offset: number; count: number };
};

export type RedisLike = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: SetOptionsLike): Promise<string>;
  del(...keys: string[]): Promise<void>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  incrBy(key: string, value: number): Promise<number>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<number>;
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  zAdd(key: string, ...members: ZMember[]): Promise<number>;
  zCard(key: string): Promise<number>;
  zRank(key: string, member: string): Promise<number | undefined>;
  zScore(key: string, member: string): Promise<number | undefined>;
  zRange(
    key: string,
    start: number | string,
    stop: number | string,
    options?: ZRangeOptionsLike
  ): Promise<ZMember[]>;
};

export type PostLike = { id: PostId };
export type CommentLike = {
  id: CommentId;
  distinguish(makeSticky?: boolean): Promise<void>;
};
export type UserFlairLike = { flairText?: string | undefined };
export type UserLike = {
  username: string;
  getUserFlairBySubreddit(
    subreddit: string
  ): Promise<UserFlairLike | undefined>;
};
export type FlairTemplateLike = { id: string; text: string };
/** The real `Subreddit` exposes `name` as a getter, which satisfies this structurally. */
export type SubredditLike = { name: string };

export type SubmitCustomPostLike = {
  subredditName: string;
  title: string;
  entry?: string;
  postData?: JsonObject;
  textFallback?: { text: string };
  /** Reddit rejects `flairText` unless `flairId` names a post flair template. */
  flairId?: string;
  flairText?: string;
};
export type SubmitCommentLike = {
  id: PostId | CommentId;
  text: string;
  runAs?: 'USER' | 'APP';
};
export type CreateFlairTemplateLike = {
  subredditName: string;
  text: string;
  backgroundColor?: string;
  textColor?: 'light' | 'dark';
  allowUserEdits?: boolean;
};
export type SetUserFlairLike = {
  subredditName: string;
  username: string;
  flairTemplateId?: string;
  text?: string;
};

export type RedditLike = {
  submitCustomPost(opts: SubmitCustomPostLike): Promise<PostLike>;
  submitComment(opts: SubmitCommentLike): Promise<CommentLike>;
  getUserFlairTemplates(subredditName: string): Promise<FlairTemplateLike[]>;
  createUserFlairTemplate(
    opts: CreateFlairTemplateLike
  ): Promise<FlairTemplateLike>;
  getPostFlairTemplates(subredditName: string): Promise<FlairTemplateLike[]>;
  createPostFlairTemplate(
    opts: CreateFlairTemplateLike
  ): Promise<FlairTemplateLike>;
  setUserFlair(opts: SetUserFlairLike): Promise<void>;
  getCurrentUser(): Promise<UserLike | undefined>;
  getSnoovatarUrl(username: string): Promise<string | undefined>;
  subscribeToCurrentSubreddit(): Promise<void>;
  getCurrentSubreddit(): Promise<SubredditLike>;
};

export type SettingValue = string | number | boolean | string[];
export type SettingsLike = {
  get(name: string): Promise<SettingValue | undefined>;
};

export type Deps = {
  redis: RedisLike;
  reddit: RedditLike;
  settings: SettingsLike;
  /** Milliseconds since the epoch. Every read of the clock goes through here. */
  now: () => number;
  /** Request identity. Every read of the Devvit context goes through here. */
  ctx: () => Ctx;
  schedule: Schedule;
  practice: Schedule;
  /** Waits `ms` milliseconds. Optional; services default to `setTimeout`. Tests pass a fake. */
  sleep?: (ms: number) => Promise<void>;
};

/** Hono environment: `createApp` stores `deps` on the request context for route handlers. */
export type AppEnv = { Variables: { deps: Deps } };
