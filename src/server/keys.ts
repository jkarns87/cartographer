/** Redis key builders. See spec section 5.4. */
export const keys = {
  posted: (date: string) => `posted:${date}`,
  puzzle: (postId: string) => `post:${postId}:puzzle`,
  user: (postId: string, uid: string) => `post:${postId}:user:${uid}`,
  times: (postId: string) => `post:${postId}:times`,
  stats: (postId: string) => `post:${postId}:stats`,
  settlers: (postId: string) => `post:${postId}:settlers`,
  results: (postId: string) => `post:${postId}:results`,
  streak: (uid: string) => `user:${uid}:streak`,
  flair: (uid: string) => `user:${uid}:flair`,
  snoo: (uid: string) => `snoo:${uid}`,
  flairTemplates: () => 'flair:templates',
  /** ID of the "Daily Island" post flair template. */
  postFlair: () => 'flair:post',
  /** Counter for the next practice island to post. */
  practiceNext: () => 'practice:next',
};

/** Post-scoped keys that can be enumerated without scan (per-user hashes expire on their own). */
export const postKeys = (postId: string): string[] => [
  keys.puzzle(postId),
  keys.times(postId),
  keys.stats(postId),
  keys.settlers(postId),
  keys.results(postId),
];

export const USER_TTL_SECONDS = 90 * 24 * 3600;
export const SNOO_TTL_SECONDS = 7 * 24 * 3600;
