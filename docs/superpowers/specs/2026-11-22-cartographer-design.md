# Cartographer: design spec

Date: 2026-11-22. Status: approved in conversation (sections 1 to 5 approved verbatim, section 6 compressed at the owner's request to start building immediately).

Cartographer is a daily deduction game for Reddit, built on Devvit Web for the Reddit Game of the Day 2026 hackathon (submissions close Tuesday 2026-12-08 18:00 PT; judging 2026-12-09 to 12-16). Each day a hidden island is posted. Players read a surveyor's clue sheet and place a set of landmark icons on a 6x6 grid until every clue is satisfied. The solution is unique, so lighting every clue means the island is charted.

## 1. Non-negotiable constraints

- Devvit Web only (`@devvit/web` 0.15.4, Node >= 24). No Blocks, no `@devvit/public-api`, no `devvit.yaml`.
- Never run `devvit publish` or `npm run launch` before 2026-12-17. `devvit upload` and `devvit playtest` are fine.
- Git commits carry no `Co-Authored-By` trailers of any kind.
- The client webview can only `fetch('/api/*')`. No third-party origins. All assets vendored.
- `postData` is limited to 2 KB. Server requests have a 30 s limit. Redis: no lists, sets, or scan; hashes, sorted sets, strings, `hSetNX`, `hIncrBy`, `zAdd`, `zRange`, `zCard`, `zRank`, `expire` are available.
- The client never receives the solution. Server-side verification is the source of truth for a solve.
- User-authored comments are posted only via an explicit button, only as replies under a single stickied app comment, with a fixed template and no free text. Nothing is gated on commenting or subscribing. Comment and subscribe are separate buttons.
- The Snoo mascot is never used as a character. Open-licensed icons only (CC0 or CC BY with attribution in README).
- Art: open-licensed icon pack, recolored to one palette, shipped as one inline SVG sprite. No designer dependency.

## 2. Puzzle model

### 2.1 Board

- 6x6 grid, row 0 is north, column 0 is west. `Cell = { r: number; c: number }`.
- The island is a connected set of 18 to 22 land cells. Every other cell is water. Off-grid counts as sea, so edge land cells are coastal. Rendering adds a thin water margin around the grid.
- Coast cell: a land cell with at least one of its four orthogonal neighbors water or off-grid.
- Inland cell: a land cell whose four orthogonal neighbors are all in-grid land.
- Shore direction: a coast cell is on the northern shore when its northern neighbor is water or off-grid. A cell may be on several shores.
- `LandMask`: a 36-character string, row-major, `'1'` land and `'0'` water.

### 2.2 Landmarks

Pool of 14: `lighthouse, windmill, harbor, fort, temple, well, cave, shipwreck, farm, watchtower, camp, mine, ruins, beacon`. Display names are the capitalized words (Lighthouse, Windmill, Harbor, Fort, Temple, Well, Cave, Shipwreck, Farm, Watchtower, Camp, Mine, Ruin, Beacon; the id `ruins` stays plural but the display name is singular so clue sentences read "The Ruin stands..."). Each puzzle draws 7 to 9. Each occupies exactly one land cell, one landmark per cell. The remaining land stays empty. The legend lists only the day's draw.

### 2.3 Clue grammar

Every clue is a typed predicate plus a text template. One shared module renders the sentence, evaluates the predicate for the client's live ticks, and verifies on the server.

| Type      | Shape                                               | Holds when                                                               | Sentence                                                                                  |
| --------- | --------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| shore     | `{type:'shore', a, dir}`                            | a's neighbor in `dir` is water or off-grid                               | The Lighthouse stands on the northern shore.                                              |
| inland    | `{type:'inland', a}`                                | all four neighbors of a are in-grid land                                 | The Temple is inland.                                                                     |
| due       | `{type:'due', a, dir, b}`                           | same row (E/W) or same column (N/S), a strictly in `dir` of b            | The Windmill is due east of the Well.                                                     |
| somewhere | `{type:'somewhere', a, dir, b}`                     | a strictly in `dir` of b on that axis, other axis unconstrained          | The Farm lies somewhere south of the Temple.                                              |
| touches   | `{type:'touches', a, b, not?}`                      | a and b are orthogonal neighbors (negated when `not`)                    | The Fort touches the Windmill. / The Fort does not touch the Windmill.                    |
| shares    | `{type:'shares', a, axis:'row'\|'column', b, not?}` | a and b share that row or column (negated when `not`)                    | The Shipwreck shares a column with the Lighthouse. / ... does not share a column with ... |
| between   | `{type:'between', a, b, c}`                         | a, b, c on one row or one column with a strictly between b and c         | The Well lies between the Mine and the Farm.                                              |
| extreme   | `{type:'extreme', a, dir}`                          | no other landmark in the puzzle lies strictly in `dir` of a on that axis | No landmark stands west of the Well.                                                      |

Direction words: N north, E east, S south, W west. Negatives exist only for touches and shares, capped at two per puzzle. Every clue names at most three landmarks. A sheet holds 7 to 11 clues. Between and extreme are capped at two each.

### 2.4 Clue states on a partial placement

`evaluateClue(clue, placement, land, landmarks)` returns `'pending' | 'lit' | 'contradicted'`.

- For every type except extreme: if any named landmark is unplaced, `pending`; else `lit` when the predicate holds, `contradicted` otherwise.
- For extreme: if a is unplaced, `pending`; else if any placed landmark violates it, `contradicted`; else if every landmark in the puzzle is placed, `lit`; else `pending`.

All landmarks placed and every clue `lit` is equivalent to the unique solution.

### 2.5 Difficulty

Graded by the human solver (section 3.2), not by clue count. Weekly ramp by UTC weekday: Monday to Wednesday 7 landmarks, Thursday to Saturday 8, Sunday 9 labeled "Expedition": a dated 9-landmark island gets ` · Expedition` appended to its post title, and the cover and the game header meta line show an Expedition tag (practice islands never do). Difficulty labels: `easy`, `medium`, `hard`.

### 2.6 Names

Seeded two-word names from fixed lists, for example "Thistle Reach", "Gull Hollow". No free text anywhere in the game.

### 2.7 Shared contract

`src/shared/puzzle/` holds types, grid helpers, predicates, templates, and both solvers. Client imports only types, grid, predicates, and templates. Server imports those plus the schedule loader. The generator imports everything.

```ts
export type LandmarkId =
  | 'lighthouse'
  | 'windmill'
  | 'harbor'
  | 'fort'
  | 'temple'
  | 'well'
  | 'cave'
  | 'shipwreck'
  | 'farm'
  | 'watchtower'
  | 'camp'
  | 'mine'
  | 'ruins'
  | 'beacon';
export type Dir = 'N' | 'E' | 'S' | 'W';
export type Axis = 'row' | 'column';
export type Cell = { r: number; c: number };
export type LandMask = string;
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Clue =
  | { type: 'shore'; a: LandmarkId; dir: Dir }
  | { type: 'inland'; a: LandmarkId }
  | { type: 'due'; a: LandmarkId; dir: Dir; b: LandmarkId }
  | { type: 'somewhere'; a: LandmarkId; dir: Dir; b: LandmarkId }
  | { type: 'touches'; a: LandmarkId; b: LandmarkId; not?: boolean }
  | { type: 'shares'; a: LandmarkId; axis: Axis; b: LandmarkId; not?: boolean }
  | { type: 'between'; a: LandmarkId; b: LandmarkId; c: LandmarkId }
  | { type: 'extreme'; a: LandmarkId; dir: Dir };
export type Placement = Partial<Record<LandmarkId, Cell>>;
export type ClueState = 'pending' | 'lit' | 'contradicted';
export type Puzzle = {
  id: string;
  number: number;
  name: string;
  difficulty: Difficulty;
  land: LandMask;
  landmarks: LandmarkId[];
  clues: Clue[];
};
export type ScheduleEntry = Puzzle & {
  date: string | null;
  seed: number;
  solution: Placement;
};
export type Schedule = {
  version: 1;
  masterSeed: number;
  entries: ScheduleEntry[];
};
```

## 3. Generator and schedule

### 3.1 Where it runs

`tools/generate.ts`, run locally with Node. It shares `src/shared/puzzle`. It never runs inside Devvit.

### 3.2 Two solvers

- Uniqueness solver: backtracking over landmarks, most-constrained-first, forward checking with clue predicates on partial placements (a `contradicted` clue prunes). Stops at the second solution. Node cap 200,000, beyond which the puzzle is rejected.
- Human solver: a candidate set of land cells per landmark. Applies only propagation until fixpoint: unary filtering (shore, inland); pairwise support elimination for due, somewhere, touches, shares, their negations, and for extreme decomposed into "x is not strictly in dir of a" for every other x; ternary support for between; all-different via naked singles. Never guesses. Output: solved or stuck, plus the number of propagation rounds (every removal in a round is computed from the candidate sets as they stood when the round began and applied together at its end, so the count is the depth of the deduction chain and independent of clue order). Difficulty: easy when rounds <= 6 (`easyMax`), medium 7 to 10 (`mediumMax`), hard >= 11, all in the one constant `DIFFICULTY_THRESHOLDS` (calibrated 2026-11-23 on the 200 generated islands).

### 3.3 Pipeline per island

Seed for day i is `hash(masterSeed, i)`. A small deterministic PRNG (mulberry32) seeded from it drives every random choice.

1. Grow the silhouette from a random cell in the inner 4x4 by random frontier expansion until 18 to 22 cells. Reject if the bounding box is under 4x4 or there is no inland cell.
2. Draw the day's landmark count from the pool and assign distinct random land cells. This is the hidden solution.
3. Enumerate every true clue of the eight types over the solution.
4. Add clues in weighted random order (weights: due 3, somewhere 2, touches 2, shares 2, shore 2, between 2, inland 1, extreme 1, negatives 0.5) until the uniqueness solver reports exactly one solution. Then try removing each clue in shuffled order, keeping the removal when the puzzle stays unique.
5. Run the human solver. If stuck, add back the candidate clue that most shrinks the largest remaining candidate set, re-minimize, retry up to three times, then reject.
6. Enforce caps (7 to 11 clues, <= 2 negatives, <= 2 between, <= 2 extreme, every landmark named at least once). Name the island. Emit the entry. On any rejection, bump a sub-seed and retry; give up on a day after 50 attempts and fail loudly.

### 3.4 Files and commands

- `src/server/puzzles/schedule.json`: server-only, holds solutions. ~180 dated entries from 2026-12-01. Dated entries are numbered from 1 in date order.
- `src/server/puzzles/practice.json`: 20 entries with `date: null` and `number: 0` for playtest and the mod "post a practice island" action.
- `npm run gen` regenerates both files deterministically from `masterSeed`. `npm run gen -- --day 2026-12-14` regenerates one day with a new sub-seed. `npm run gen:review` prints every clue sheet as plain text. `npm run gen:verify` re-solves both files and asserts uniqueness, human-solvability, and the caps; it also runs as part of `npm run test:unit`.

### 3.5 Post-time snapshot

When the cron posts a day, the server copies the full entry into Redis under the post ID and serves every later request from that copy. A redeploy that changes the schedule never alters a live post.

### 3.6 Cron

Static schedule in `devvit.json`: task `daily` at `0 12 * * *` and task `daily-retry` at `15 12 * * *`, both hitting `/internal/cron/daily`. 12:00 UTC is 7 am Eastern. The day key is the UTC date at post time. Cron time zone is undocumented; the first playtest verifies it and README records the finding.

## 4. Client

### 4.1 Entries

`devvit.json` declares two entrypoints: `default` is `splash.html` (the inline cover, tiny, paints under a second, height `regular`) and `game` is `game.html` (the board). The cover opens the board with `requestExpandedMode(e.nativeEvent, 'game')` from a trusted click.

### 4.2 Cover (inline)

Island number, name, difficulty, landmark count, and the silhouette, all read from `context.postData` so nothing waits on the network. Community stats load after paint from `GET /api/cover`. One button: "Chart this island". Once solved, the cover shows the stamped result and the populated island instead. Tap-only, no scrolling.

### 4.3 Board (expanded)

Phone portrait, top to bottom: header (island name, timer, corrections), 6x6 board full width and square, legend strip of icon chips, clue sheet, and a "Chart it" button that appears when every clue is lit. Landscape and desktop move the legend and clue sheet into a right sidebar beside the board. Breakpoint only, same components.

Interaction rules:

- Tap a legend chip to select it. Tap a land cell to place the selected landmark. The chip goes grayscale with a check and selection auto-advances to the next unplaced landmark.
- Tap a placed icon on the board to lift it: it becomes the selection, its chip regains color, corrections increase by one. Tap a land cell to set it down again.
- Water cells reject taps with a short shake. Tapping an occupied cell always lifts that landmark, never stacks or swaps.
- Tap a clue to pulse the landmarks it names on the board and in the legend.
- Every placement or lift appends to a history string (`P` place, `L` lift) and saves to the server.

Clue states use shape and color: pending is a hollow circle, lit is a green check, contradicted is an amber mark.

The interaction logic lives in a pure reducer (`src/client/game/reducer.ts`) with state `{ selected, placements, history, corrections }` and actions `select`, `tapCell`, `lift`, so it is unit-tested without the DOM.

### 4.4 Finish and result screen

"Chart it" calls `POST /api/chart`. On success the result screen shows: the island with your placements, a "Charted" stamp, time, corrections, community stats (charted count, clean percentage, median time), your rank, your streak and tier, and the snoovatar settling animation with yours landing first. Buttons: "Post my chart", "Share", "Join for tomorrow's island" (once per user), and "Results thread" (navigates to the sticky comment).

### 4.5 State and timing

The timer starts the first time `GET /api/game` is called for that post by that user; the server records `startedAt`. Reloads do not reset it. Placements save on every change. Corrections and history are client-reported soft stats. Solve time is server-measured.

### 4.6 Polish baseline

Tap targets >= 44 px. Dark mode via `prefers-color-scheme`. `prefers-reduced-motion` respected. A three-step first-run overlay dismissed once per user (stored server-side). No third-party UI libraries. SVG sprite inlined. Tailwind 4 as shipped by the template.

## 5. Server

### 5.1 Stack

One Hono app on `@devvit/web/server`. Request-scoped. Services take a `Deps` object `{ redis, reddit, settings, now }` typed as minimal interfaces so tests pass in-memory fakes without module mocking. Production wires the real clients in `src/server/index.ts`.

### 5.2 Routes

Client-facing under `/api` (user and post IDs come from `context`):

- `GET /api/cover` -> `CoverResponse`. Works logged out.
- `GET /api/game` -> `GameResponse`. 401 `{ error: 'login' }` when there is no user.
- `POST /api/place` body `{ placements, history, corrections }` -> `{ ok: true }`.
- `POST /api/chart` body `{ placements, history, corrections }` -> `{ result, stats }`, 409 `{ error: 'mismatch' }`, 400 `{ error: 'invalid' }`.
- `POST /api/comment` -> `{ ok: true, commentId }`, 409 `{ error: 'already' }`.
- `POST /api/subscribe` -> `{ ok: true }`.
- `POST /api/tutorial-seen` -> `{ ok: true }`.
- `GET /api/reveal` -> `{ settlers: Settler[], more: number }`.

Reddit-invoked under `/internal`:

- `POST /internal/cron/daily` (tasks `daily` and `daily-retry`).
- `POST /internal/menu/post-today`, `POST /internal/menu/post-practice` (subreddit menu, moderator only).
- `POST /internal/triggers/on-app-install`, `POST /internal/triggers/on-app-upgrade` (ensure flair templates), `POST /internal/triggers/on-post-delete` (delete the post's keys).

Shared response types live in `src/shared/api.ts`:

```ts
export type Stats = {
  started: number;
  charted: number;
  cleanPct: number;
  medianMs: number | null;
};
export type Tier = 'deckhand' | 'navigator' | 'cartographer' | 'master';
export type StreakInfo = {
  current: number;
  best: number;
  cleanRun: number;
  total: number;
  tier: Tier | null;
  steadyHand: boolean;
  counted: boolean;
};
export type Result = {
  elapsedMs: number;
  corrections: number;
  history: string;
  rank: number;
  total: number;
  streak: StreakInfo;
  commented: boolean;
  subscribePromptSeen: boolean;
};
export type IslandSummary = {
  number: number;
  name: string;
  difficulty: Difficulty;
  land: LandMask;
  landmarkCount: number;
  date: string | null;
};
export type CoverResponse = {
  postId: string;
  island: IslandSummary;
  stats: Stats;
  me: {
    loggedIn: boolean;
    status: 'unsolved' | 'in-progress' | 'solved';
    result?: Result;
  };
};
export type GameResponse = {
  postId: string;
  puzzle: Puzzle;
  placements: Placement;
  history: string;
  corrections: number;
  startedAt: number;
  serverNow: number;
  status: 'unsolved' | 'in-progress' | 'solved';
  result?: Result;
  tutorialSeen: boolean;
};
export type ChartRequest = {
  placements: Placement;
  history: string;
  corrections: number;
};
export type ChartResponse = { result: Result; stats: Stats };
export type Settler = {
  userId: string;
  snoovatar: string | null;
  cell: Cell;
  isMe: boolean;
};
export type RevealResponse = { settlers: Settler[]; more: number };
```

### 5.3 Chart verification

Load the post's puzzle snapshot. Reject (400) unless every landmark of the puzzle is placed on a distinct in-grid land cell. Compare to the solution and recompute every clue predicate; a mismatch returns 409. Claim the solve with `hSetNX(userKey, 'solvedAt', now)`; if it returns 0 the solve already exists and the stored result is returned unchanged. A user with no `startedAt` (never opened the game with `GET /api/game`) is rejected with 400 before the claim. Elapsed = now - startedAt (server values). Then: `hIncrBy stats charted` (and `clean` when corrections is 0), `zAdd times`, `zAdd settlers`, update streak, apply flair, return result. Flair and comment failures are logged and never fail the response. Solve times under 10 s are stored but excluded from the median.

### 5.4 Redis keys

| Key                    | Type   | Purpose                                                                                                                                                                                                                                                                   | TTL     |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `posted:<YYYY-MM-DD>`  | string | Cron idempotency, value is post ID                                                                                                                                                                                                                                        | none    |
| `post:<id>:puzzle`     | string | JSON `ScheduleEntry` snapshot incl. solution                                                                                                                                                                                                                              | none    |
| `post:<id>:user:<uid>` | hash   | startedAt, placements (JSON), history, corrections (the in-progress board), solvedAt, elapsedMs, finalPlacements (JSON), finalHistory, finalCorrections (the charted board, written once by chart and preferred by readers), commented, commentClaim, subscribePromptSeen | 90 days |
| `post:<id>:times`      | zset   | member uid, score elapsedMs                                                                                                                                                                                                                                               | none    |
| `post:<id>:stats`      | hash   | started, charted, clean, fast (count of times under 10 s, excluded from the median)                                                                                                                                                                                       | none    |
| `post:<id>:settlers`   | zset   | member uid, score solvedAt                                                                                                                                                                                                                                                | none    |
| `post:<id>:results`    | string | ID of the stickied results comment                                                                                                                                                                                                                                        | none    |
| `user:<uid>:streak`    | hash   | current, best, lastDate, cleanRun, total, tutorialSeen                                                                                                                                                                                                                    | none    |
| `user:<uid>:flair`     | string | last flair text this app wrote                                                                                                                                                                                                                                            | none    |
| `snoo:<uid>`           | string | snoovatar URL, empty string when none                                                                                                                                                                                                                                     | 7 days  |
| `flair:templates`      | hash   | tier -> flair template ID                                                                                                                                                                                                                                                 | none    |
| `practice:next`        | string | counter for the next practice island to post                                                                                                                                                                                                                              | none    |

### 5.5 Streak rule

A solve is counted when `solvedAt` is within 24 hours of the island's `postedAt` (stored in the snapshot). A counted solve on the day after `lastDate` (by island date) increments `current`; a counted solve on an island dated more than one day after `lastDate` resets `current` to 1; an uncounted solve leaves `current` and `lastDate` alone but still increments `total`. `best = max(best, current)`. `cleanRun` increments on a counted solve with zero corrections and resets to 0 on any counted solve with corrections. Practice islands (`date: null`) never affect streaks. A counted solve on an island dated on or before `lastDate` (possible only when one date is posted twice) increments `total` alone: the streak is keyed by island date and never moves backwards.

The stored streak is rewritten only by solves, so it is decayed on read. Once the island after `lastDate` can no longer be charted inside its window (that island is assumed to post at 12:00 UTC, the cron hour), the streak is broken: `StreakInfo.current` reads 0 and the tier falls back to Deckhand until the next counted solve starts a new streak at 1. `best`, `cleanRun` and `total` are unaffected. Flair is written only on counted solves, so a lapsed player's flair changes on their next counted solve.

Tiers: deckhand when total >= 1, navigator when current >= 3, cartographer when current >= 7, master when current >= 30; highest wins. Steady Hand is a badge when cleanRun >= 7.

### 5.6 Flair

On install and upgrade, ensure four user flair templates exist (Deckhand, Navigator, Cartographer, Master Cartographer) via `reddit.createUserFlairTemplate`, storing IDs in `flair:templates`. After a counted solve, when the subreddit setting `flairEnabled` is true: read the user's current flair with `user.getUserFlairBySubreddit`; only write when it is empty or equals the last text this app wrote (`user:<uid>:flair`). Text format: `Navigator · 5d`, with a trailing ` ✦` when Steady Hand. Write with `reddit.setUserFlair({ subredditName, username, flairTemplateId, text })`.

### 5.7 Posting

`reddit.submitCustomPost({ subredditName, title, entry: 'default', postData, textFallback: { text }, flairText: 'Daily Island' })` where title is `Cartographer #<number> · <name> · <Difficulty>`, plus ` · Expedition` for a 9-landmark island (section 2.5) (practice: `Cartographer practice · <name>`), `postData = { number, name, difficulty, land, landmarkCount, date }`, and the fallback text explains the post needs the Reddit app. `flairText` is attempted; if the call fails because of flair, retry once without it. After posting: store snapshot with `postedAt`, set `posted:<date>`, then `reddit.submitComment({ id: post.id, text: RESULTS_HEADER, runAs: 'APP' })` and `comment.distinguish(true)`, storing the comment ID. `RESULTS_HEADER` = "Results thread. Finish the island and tap Post my chart in the game to add yours."

### 5.8 Post my chart

Server builds the fixed body and calls `reddit.submitComment({ id: resultsCommentId, text, runAs: 'USER' })`, then sets `commented = 1`. Body:

```
Cartographer #12 · Thistle Reach
📍📍📍↩📍📍📍📍📍  04:12
7-day streak
```

The pin line maps history `P` to 📍 and `L` to ↩, showing at most 24 symbols followed by `…` when longer. Time is `m:ss`. The third line is `N-day streak`, or `Clean chart` when corrections is 0 and the streak is 1, or omitted for practice islands. No grid, ever.

### 5.9 Snoovatars

At chart time, resolve `reddit.getSnoovatarUrl(username)` and cache in `snoo:<uid>` (empty string when undefined). `GET /api/reveal` returns the first 40 members of `settlers` by score plus the caller if not among them, each mapped to an empty land cell (not holding a landmark) by `hash(userId) % emptyCells.length`, at most three per cell and `more` counting the overflow. Users without a snoovatar render a tent icon from the sprite.

### 5.10 Share and subscribe

`showShareSheet({ text })` with the same card text as the comment plus the post URL. Subscribe calls `reddit.subscribeToCurrentSubreddit()`; the prompt is shown once per user (`subscribePromptSeen` field).

### 5.11 Settings and permissions

`devvit.json`: `permissions.redis: true`, `permissions.reddit: { enable: true, asUser: ['SUBMIT_COMMENT', 'SUBSCRIBE_TO_SUBREDDIT'] }`, `settings.subreddit.flairEnabled` boolean default true. No HTTP fetch, no realtime, no media, no payments, no comment triggers.

### 5.12 Error handling

- Cron: no-op (200) when `posted:<date>` exists. The idempotency key is written only after the post succeeds, so the retry task recovers a transient failure. A missing schedule entry logs an error and posts nothing.
- Chart mismatch returns 409; the client re-evaluates ticks and shows "The survey does not match your chart."
- Logged-out `GET /api/game` returns 401; the board shows a login prompt via `showLoginPrompt`.
- Post delete trigger removes `post:<id>:*` keys it knows about.

## 6. Testing

- Vitest. `npm run test:unit` runs everything, including `gen:verify` over the committed schedule.
- Shared: table-driven tests per clue type (including off-grid water, every shore direction, between on rows and columns, extreme with partial placements), template rendering, solver fixtures with known solution counts and known pass counts.
- Generator: a property test over 100 seeds asserts every produced puzzle passes verify and reports the clue-count distribution and reject rate.
- Server: route tests through `app.request` with an in-memory Redis fake and a stubbed Reddit client. Chart: correct, wrong, double submit, logged out, invalid cell. Cron: fresh day, already posted, missing entry, submit failure then retry. Streak rule: table-driven dates.
- Client: reducer tests for select, place, lift, auto-advance, corrections, history; one render test per component for the three clue states.
- Live playtest in a private test subreddit under 200 members (requires `devvit login` by the owner).

## 7. Delivery plan (compressed)

Build order: shared puzzle module and solvers, generator and schedule, server, client board and cover, Reddit layer, snoovatar reveal and result screen, icons and polish, README. Cut order if behind: snoovatar animation becomes static, then Steady Hand, then subscribe button, then landscape sidebar, then retry cron. Never cut: generator verify, server-side chart verification, cron idempotency, results sticky with Post my chart.

Submission needs: Devpost text, app listing URL (after `devvit upload`), README.md, demo post in the test subreddit, optional video under one minute, public repo `jkarns87/cartographer`.

## 8. Open verification items

1. Cron time zone (assumed UTC).
2. Whether snoovatar image URLs render inside the sandboxed webview. Fallback: initials badges from the sprite.
3. Whether `flairText` on `submitCustomPost` succeeds when the subreddit has no matching post flair template. Fallback: omit it.
4. Whether `runAs: 'USER'` comments require the asUser permission to be granted at install. Expected yes.
