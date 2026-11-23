# Review notes

Final whole-branch review, fix wave of 2026-11-23. Item numbers follow the review's findings
(5, 12 and 13 were not part of this wave).

## Fixed in this wave

1. Chart writes the final board, time, stats, settler and streak before any Reddit call; snoovatar and flair come after, so a slow `getSnoovatarUrl` can no longer strand a claimed solve.
2. `Ctx.subredditName` is `string | undefined`; `resolveSubredditName` falls back to `reddit.getCurrentSubreddit()` for posting, flair and menu navigation, so a cron without the header still posts.
3. A chart with no `startedAt` (no prior GET /api/game) is rejected as invalid (400) instead of recording a 0 ms rank-1 time.
4. Settler avatars fall back to the tent icon on image error (`SettlerAvatar`), and no longer load lazily.
6. Every `text-ink/60` on small text is now `text-muted` (12 sites; a theme test guards against regressions).
7. The `ruins` landmark displays as "Ruin", so clue sentences read "The Ruin stands...".
8. Dated 9-landmark islands are labeled Expedition in the post title, on the cover and in the game header meta line.
9. Moderator menu failures answer 200 with a toast (Devvit expects a 2xx `UiResponse`); the cron keeps its 500.
10. A losing concurrent submit waits (up to three re-reads) for the winner's `elapsedMs`, now written last, so both responses carry the same complete result with a real rank.
11. Chart stores the solved board in `finalPlacements`/`finalHistory`/`finalCorrections`, which readers prefer, so a `/place` that races past its solved check cannot change what GET /api/game returns.
14. A failed claim release in `postChart` is logged and the original Reddit error is rethrown.
15. The dead `already` branch in `useGame.chart` is removed (/api/chart never answers 409 already; the code stays in `ApiError` because /api/comment still returns it).
16. The inline "Log in" button in the chart error alert has a 44 px touch target (`min-h-11 px-2`).
17. `TIER_LABEL` lives in `src/shared/tiers.ts` for both server and client; the client uses `cardTime` from `src/shared/card.ts` and `format.ts` is gone.
18. `ERROR_CODES` derives from an object checked with `satisfies Record<ApiError['error'], true>`.
19. AGENTS.md rewritten to match the real layout, scripts, code rules, publish embargo, spec and plan locations.
20. README "Daily content" now says the puzzle files are server-only at runtime, that the repo is public and the generator deterministic, and that production can regenerate from a private seed.
21. Spec drift fixed: 2.2 Ruin, 2.5 Expedition, 3.2 rounds with easyMax 6 / mediumMax 10, 5.3 the startedAt check, 5.4 real hash fields (`subscribePromptSeen`, `commentClaim`, `fast`, the final board fields, `practice:next`), 5.7 the Expedition title, 5.10 `subscribePromptSeen`.

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
