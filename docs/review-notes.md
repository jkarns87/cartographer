# Review notes

Final whole-branch review, fix wave of 2026-11-23. Item numbers follow the review's findings
(5, 12 and 13 were not part of this wave).

## Fixed in this wave

1. Chart writes the final board, time, stats, settler and streak before any Reddit call; snoovatar and flair come after, so a slow `getSnoovatarUrl` can no longer strand a claimed solve.
2. `Ctx.subredditName` is `string | undefined`; `resolveSubredditName` falls back to `reddit.getCurrentSubreddit()` for posting, flair and menu navigation, so a cron without the header still posts.
3. A chart with no `startedAt` (no prior GET /api/game) is rejected as invalid (400) instead of recording a 0 ms rank-1 time.
4. Settler avatars fall back to the tent icon on image error (`SettlerAvatar`), and no longer load lazily.
5. Every `text-ink/60` on small text is now `text-muted` (12 sites; a theme test guards against regressions).
6. The `ruins` landmark displays as "Ruin", so clue sentences read "The Ruin stands...".
7. Dated 9-landmark islands are labeled Expedition in the post title, on the cover and in the game header meta line.
8. Moderator menu failures answer 200 with a toast (Devvit expects a 2xx `UiResponse`); the cron keeps its 500.
9. A losing concurrent submit waits (up to three re-reads) for the winner's `elapsedMs`, now written last, so both responses carry the same complete result with a real rank.
10. Chart stores the solved board in `finalPlacements`/`finalHistory`/`finalCorrections`, which readers prefer, so a `/place` that races past its solved check cannot change what GET /api/game returns.
11. A failed claim release in `postChart` is logged and the original Reddit error is rethrown.
12. The dead `already` branch in `useGame.chart` is removed (/api/chart never answers 409 already; the code stays in `ApiError` because /api/comment still returns it).
13. The inline "Log in" button in the chart error alert has a 44 px touch target (`min-h-11 px-2`).
14. `TIER_LABEL` lives in `src/shared/tiers.ts` for both server and client; the client uses `cardTime` from `src/shared/card.ts` and `format.ts` is gone.
15. `ERROR_CODES` derives from an object checked with `satisfies Record<ApiError['error'], true>`.
16. AGENTS.md rewritten to match the real layout, scripts, code rules, publish embargo, spec and plan locations.
17. README "Daily content" now says the puzzle files are server-only at runtime, that the repo is public and the generator deterministic, and that production can regenerate from a private seed.
18. Spec drift fixed: 2.2 Ruin, 2.5 Expedition, 3.2 rounds with easyMax 6 / mediumMax 10, 5.3 the startedAt check, 5.4 real hash fields (`subscribePromptSeen`, `commentClaim`, `fast`, the final board fields, `practice:next`), 5.7 the Expedition title, 5.10 `subscribePromptSeen`.

## After playtest

- concurrent-submit observation on two devices
- /place vs /chart race hardening if observed
- flair retry narrowing (posting.ts retry only when the error mentions flair)
- card streak line reads current streak at comment time (store streakCurrent at chart time if wanted)
- no flush on pagehide
- chartError clearing
- ERROR_CODES follow-ups
- tutorial focus trap
- useReveal StrictMode test
- share-failure toast test
- Header and api.ts direct tests
- timing assertions on CI
- bestFix unit test coverage
- exhaustive solver test on unsatisfiable sheets
- in-flight lock for concurrent cron and menu
- confirm `devvit upload` does not ship dist/server/index.cjs.map
- screenshots docs/screenshots/cover.png and board.png to capture during playtest

## Residual notes from the fix-wave re-review (2026-11-23, all minor, parked)

- `src/server/routes/internal.ts` post-today handler resolves the subreddit name after `postToday` has already posted; if the header is missing and `getCurrentSubreddit` throws, the moderator sees "Posting failed" although the post is live (a retry answers "already"). Resolve the name once before posting.
- `src/client/game/GamePage.tsx` `CHART_ERROR_TEXT.invalid` wording also covers the missing-`startedAt` 400, which the normal client flow cannot reach.
- `src/server/services/flair.ts` has a double blank line where `TIER_LABEL` was removed (prettier is not in the gate).
- Double-submit residual by design: if the winning chart's Redis writes take longer than the loser's three short waits, the loser returns a derived result (correct time, possibly stale streak or rank 0) that the next GET corrects.
- A future test combining `vi.useFakeTimers()` with a losing concurrent chart must advance timers, because the fake `sleep` resolves through `setTimeout(0)`.

## Follow-up 2026-11-23: streaks regress

Owner correction to ruling 9 of the overnight build. The stored streak was only ever rewritten by
a solve, so a player who stopped playing kept seeing their peak streak and tier on every result
screen until their next counted solve. Now the streak is decayed on read: `isBroken` and
`displayStreak` in `streaks.ts`, and `toStreakInfo` takes `now`. Once the island after `lastDate`
can no longer be charted inside its window (that island is assumed to post at 12:00 UTC), the
streak reads 0 and the tier falls back to Deckhand; the next counted solve resets the stored
streak to 1 as before. `best`, `cleanRun` and `total` are untouched. Result-screen copy reads
`Streak ended · best N` for a lapsed streak, and the late-solve note now says the chart did not
count toward a streak. Flair still changes only on a counted solve. The 12:00 UTC assumption is
only used for display; the stored rule keeps using each post's real `postedAt`.
