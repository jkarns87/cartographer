# Cartographer

Cartographer is a daily deduction game that runs inside a Reddit post: each day a new hidden island
appears, and you place its landmarks on a 6x6 map by reading a surveyor's clue sheet. Every island
has exactly one solution that can be reached by deduction alone, so when every clue lights up the
island is charted, your result can join the day's results thread, and your snoovatar settles on the
map with everyone else who charted it.

![The inline cover in the feed](docs/screenshots/cover.png)

![The board in expanded mode](docs/screenshots/board.png)

TODO(joey): capture `docs/screenshots/cover.png` (the inline cover in the feed, phone width) and
`docs/screenshots/board.png` (the expanded board with a few clues lit).

- Play: TODO(joey): link to the demo post in the public test subreddit (under 200 members)
- App listing: https://developers.reddit.com/apps/cartographer-isle
- Video (under one minute): TODO(joey): link
- Source: https://github.com/jkarns87/cartographer

## How to play

The goal is to place every landmark so that every clue on the survey sheet is lit. There is exactly
one way to do it.

**The map.** The island sits on a 6x6 grid with north at the top. Sand cells are land and blue
cells are water. The edge of the grid counts as sea, so a land cell on the edge is on the coast.

**Placing landmarks.**

- The legend under the map shows the day's landmarks: 7 on Monday to Wednesday, 8 on Thursday to
  Saturday, 9 on Sunday. The first unplaced landmark starts selected.
- Tap a chip in the legend to select a landmark. Tap a land cell to place it. The chip turns gray
  with a check, and the selection moves to the next unplaced landmark.
- Tap a placed landmark on the map, or its gray chip in the legend, to lift it. It becomes the
  selection again and the corrections counter goes up by one. Tap a land cell to set it down.
- Tapping an occupied cell always lifts that landmark. It never stacks or swaps.
- Water cells refuse a tap with a short shake.
- Tap a clue to pulse the landmarks it names, on the map and in the legend.

**Clue states.** Each clue shows its state with a shape and a color, so color alone never carries
the meaning.

| Mark          | State        | Meaning                                            |
| ------------- | ------------ | -------------------------------------------------- |
| hollow circle | pending      | At least one landmark the clue names is not placed |
| green check   | lit          | The clue is true for your current placements       |
| amber `!`     | contradicted | The clue is false for your current placements      |

"No landmark stands west of the Well" is the one clue that looks at every landmark. It turns amber
as soon as a placed landmark breaks it, and it lights only once every landmark is placed.

**Clue types.** Eight sentence patterns. Each clue names at most three landmarks.

| Example                                                             | True when                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| The Lighthouse stands on the northern shore.                        | The cell north of it is water or off the map              |
| The Temple is inland.                                               | All four of its neighbors are land on the map             |
| The Windmill is due east of the Well.                               | Same row, with the Windmill somewhere to the east         |
| The Farm lies somewhere south of the Temple.                        | The Farm is in a lower row, in any column                 |
| The Fort touches (does not touch) the Windmill.                     | The two share an edge (or do not)                         |
| The Shipwreck shares (does not share) a column with the Lighthouse. | Same column, or same row for the row form (or not)        |
| The Well lies between the Mine and the Farm.                        | All three on one row or column, the Well strictly between |
| No landmark stands west of the Well.                                | No other landmark is in a column further west             |

**Charting.** When every clue is lit, a Chart it button appears. The server checks your chart
against the stored solution and records your time. The result screen shows your time, corrections,
rank, the day's community numbers, your streak and tier, and the settlers.

**Time and saving.** The timer starts the first time you open the board and is measured by the
server, so reloading does not reset it. Every placement and lift is saved, so you can pick up on
another device. A three-step tutorial appears the first time you open a board, and never again
once dismissed.

**Streaks.** A solve counts toward your streak when you chart a dated island within 24 hours of
its post. Miss an island and the streak ends: once that island's window closes, your streak reads 0
and your tier drops back to Deckhand until your next counted solve starts a new one. Your best
streak is kept, and your flair updates on that next solve. Practice islands never count: your
streak, total and tier stay exactly as they were.

## Daily content

A new island is posted every day at 12:00 UTC (7 am Eastern). Islands are not written by hand and
not generated at runtime. An offline generator in `tools/gen` builds them ahead of time from a fixed
master seed and writes two files that ship inside the server bundle:

- `src/server/puzzles/schedule.json`: 188 dated islands, one per day from 2026-11-23 to
  2027-05-29, numbered 1 to 188 in date order.
- `src/server/puzzles/practice.json`: 20 undated practice islands (number 0) for playtests and the
  moderator's "post a practice island" menu item.

Both files contain solutions. At runtime they are read only by the server and never sent to the
client: every response goes through `toPuzzle`, which drops the solution. They are not secret in
the repository, though: the repo is public and the generator is deterministic, so anyone can read
or rebuild the schedule. A production deployment after judging can regenerate both files from a
private master seed (`npm run gen -- --seed <private>`) and keep that seed out of the repo.

**How an island is built** (`tools/gen/build.ts`). A seeded PRNG (mulberry32) drives every choice,
so the same seed always produces the same schedule.

1. Grow an island of 18 to 22 cells from a random cell in the inner 4x4. Reject it if its bounding
   box is smaller than 4x4, it has no inland cell, any row or column is entirely land, it encloses
   a lake, or fewer than three rows (or three columns) carry shoreline.
2. Draw the day's landmarks by UTC weekday (Monday to Wednesday 7, Thursday to Saturday 8,
   Sunday 9) and put each on a distinct random land cell. That placement is the hidden solution.
3. List every clue of the eight types that is true of the solution.
4. Add clues in weighted random order (due 3; somewhere, touches, shares, shore and between 2;
   inland and "no landmark" 1; negated clues 0.5) until the puzzle has exactly one solution. Then
   try removing each clue in shuffled order and keep every removal that leaves the puzzle unique.
5. Run the human solver (below). If it gets stuck, add back the true clue that most shrinks the
   largest remaining candidate set and re-minimize, up to three times.
6. Enforce the caps: 7 to 11 clues, at most 2 negated clues, at most 2 "between" and 2 "no
   landmark" clues, every landmark named by at least one clue, and no clue that another clue on
   the sheet already implies. Name the island from fixed word lists ("Thistle Reach", "Gull
   Hollow").

A rejected attempt moves to the next sub-seed. A day that fails 50 attempts stops the run with an
error rather than shipping a weak island. Across the whole set, no two islands share a silhouette,
names are unique across both files, and dated islands within seven days of each other never share
a name word.

**Uniqueness.** `countSolutions` in `src/shared/puzzle/solver.ts` is a backtracking search. It
branches on the landmark with the fewest candidate cells, runs full propagation as its forward
check, and stops as soon as it finds a second solution. A search that needs more than 200,000
branches counts as a failure, so no island ships on an unproven uniqueness claim.

**Fairness.** `propagate` in the same file is the human solver. It keeps a set of candidate cells
for each landmark and only removes candidates that cannot work: shore and inland filters; pairwise
support checks for due, somewhere, touches, shares, their negations, and the "no landmark" clues
(split into one pairwise rule per other landmark); a three-way support check for between; and the
rule that a landmark fixed to one cell takes that cell away from every other landmark. It never
guesses. An island ships only if this solver places every landmark on its own, so every island can
be finished by deduction without trial and error.

**Difficulty.** The human solver works in rounds. Every removal in a round is computed from the
candidate sets as they stood at the start of the round, and all of them are applied together at
the end, so the round count measures the longest chain of dependent deductions and does not depend
on the order of the clues. That count grades the island: easy at 6 rounds or fewer, medium at 7 to
10, hard at 11 or more. The thresholds live in one constant, `DIFFICULTY_THRESHOLDS` in
`solver.ts`. The label appears on the cover and in the post title.

**Commands.**

| Command                           | What it does                                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run gen`                     | Rebuild both files from the master seed (default 7). Flags: `--seed`, `--start`, `--days`, `--practice`. Prints reject rates and the clue-count and difficulty distribution. |
| `npm run gen -- --day 2026-12-14` | Rebuild one dated island with a fresh sub-seed, keeping its date, number and landmark count.                                                                                 |
| `npm run gen:review`              | Print every clue sheet as plain text with its solution grid, for a human read-through.                                                                                       |
| `npm run gen:verify`              | Re-solve both files and check uniqueness, human solvability, the stored difficulty, the caps, dates, numbering, unique names and silhouettes. Exits non-zero on any problem. |

The same verification runs inside `npm run test:unit` (`tools/gen/verify.test.ts`), so CI fails if
a committed island is ever ambiguous or needs a guess.

**Post-time snapshot.** When an island is posted, the server copies the full entry, with its
solution and the posting time, into Redis under the post ID, and serves every later request for
that post from the copy. Regenerating the schedule and redeploying never changes an island that is
already live.

## Reddit features

**The daily post.** A scheduled task posts the day's island as a custom post titled like
`Cartographer #12 · Thistle Reach · Medium` (practice islands: `Cartographer practice · <name>`;
Sunday's 9-landmark islands end in ` · Expedition`, and the cover and game header tag them too),
with "Daily Island" post flair from a template the app creates. The inline cover paints from the
post's own data (number, name, difficulty, landmark count and the island's silhouette) without
waiting on the network, then loads community numbers. No two islands share a silhouette, so the
daily post never looks like a repost in the feed.

**The results thread.** Right after posting, the app comments on the post as the app account and
distinguishes and stickies the comment: "Results thread. Finish the island and tap Post my chart in
the game to add yours." After charting, the Post my chart button replies to that comment as you,
with a fixed card of up to three lines:

1. `Cartographer #12 · Thistle Reach`
2. one pin symbol per placement and a return arrow per lift (at most 24 symbols, then an ellipsis),
   followed by your time as `m:ss`
3. `7-day streak`, or `Clean chart` when you made no corrections and your streak is at most one
   day; left out on practice islands

The card never contains the grid, so it never gives the solution away. The Results thread button on
the result screen opens the post's comments, where the stickied thread sits on top.

**Streak flair.** After a counted solve, the app sets your user flair in the subreddit.

| Tier                | Earned when                 |
| ------------------- | --------------------------- |
| Deckhand            | At least one solve          |
| Navigator           | A current streak of 3 days  |
| Cartographer        | A current streak of 7 days  |
| Master Cartographer | A current streak of 30 days |

The highest tier wins, and the flair text carries the streak, for example `Navigator · 5d`. Steady
Hand is a badge for seven counted solves in a row with zero corrections; it adds a trailing ✦ to
the flair and shows on the result screen. The app writes flair only when your current flair is
empty or is the text the app wrote last time, so flair you chose yourself is never overwritten.
Moderators can turn flair off.

**Snoovatar settling.** On the result screen the solved island fills with the people who charted
it. Each solver's snoovatar drops onto an empty land cell, yours first and drawn larger. The reveal
shows the first 40 solvers plus you, at most three per cell, and counts the rest. A hash of each
user ID picks the cell, so you land in the same spot every time. Solvers without a snoovatar appear
as a small tent. Once you have solved, the inline cover in the feed shows the stamped island with
its settlers.

**Community numbers.** The cover and the result screen show how many people charted the island,
the share who did it with zero corrections, and the median time. Times under 10 seconds are kept
but left out of the median. The result screen adds your rank by time.

**Share and subscribe.** Share opens Reddit's share sheet with the same card text, and Reddit adds
the post link. "Join for tomorrow's island" subscribes you to the subreddit. After you use it on an
island, it no longer shows on that island's result screen.

**Comment policy.** Cartographer follows Devvit's rules for user-authored comments. A comment is
posted only when you tap Post my chart. It is posted as you (`runAs: 'USER'`), only as a reply under
the single stickied app comment, and only with the fixed card text; there is no free-text input
anywhere in the game. Nothing is gated on commenting, sharing or subscribing: the game, your result
and your streak are the same whether you use those buttons or not. Post my chart, Share and Join
are separate buttons, and no button does two things. The server allows one reply per player per
island, guarded by an atomic claim in Redis so a double tap cannot post twice.

Post my chart and Join act as you on Reddit, so Reddit asks for your permission the first time:
the button hands its click to Devvit's `canRunAsUser` check, which shows Reddit's consent prompt
when needed. If you decline, the game says so and leaves the button enabled; nothing else
changes. Seen in playtest on 2026-11-23: without that consent Reddit rejects the comment with
"refresh token does not exist"; with it, the prompt appears once and the reply shows under the
player's own username, even while the app is unpublished.

## Architecture

**Shared contract (`src/shared`).** `puzzle/types.ts` defines the puzzle model. `puzzle/grid.ts`
holds cell math and the geometry tests (shore, inland, due, between). `puzzle/predicates.ts`
evaluates a clue on a full or partial placement (`evaluateClue` returns pending, lit or
contradicted) and validates placements. `puzzle/templates.ts` renders each clue as a sentence.
`puzzle/solver.ts` holds both solvers. `api.ts` holds the request and response types, `tiers.ts`
the streak tier names, and `card.ts` builds the Post my chart card (and its `m:ss` time format),
used by the server's comment and the client's share sheet alike. One implementation of each rule serves the client's live clue states, the server's
verification and the generator.

**Generator (`tools/gen`).** Plain TypeScript run with `tsx` on a developer machine. It imports
the shared module directly, writes the two JSON files, and never runs inside Devvit.

**Server (`src/server`).** One Hono app on `@devvit/web/server`, built to a single CommonJS file,
`dist/server/index.cjs`. `createApp(deps)` in `app.ts` takes a `Deps` object (`redis`, `reddit`,
`settings`, `now`, `ctx`, `schedule`, `practice`, and an optional `sleep`) typed as minimal structural interfaces in
`deps.ts`; `index.ts` wires in the real Devvit clients. Client routes live under `/api`
(`routes/api.ts`): `GET /api/cover`, `GET /api/game`, `POST /api/place`, `POST /api/chart`,
`POST /api/comment`, `POST /api/subscribe`, `POST /api/tutorial-seen` and `GET /api/reveal`.
Reddit-invoked routes live under `/internal` (`routes/internal.ts`): the daily cron, two moderator
menu actions, and the install, upgrade and post-delete triggers. Logic sits in `services/`
(posting, snapshot, progress, chart, stats, streaks, flair, comments, snoovatar, schedule,
subreddit). User and post identity come only from the Devvit context on the server, never from the
client. The subreddit name header is optional (scheduler calls may omit it), so services read it
through `resolveSubredditName`, which falls back to `reddit.getCurrentSubreddit()`.

**Client (`src/client`).** React 19 and Tailwind 4, with no UI library. `devvit.json` declares two
entry points. `splash.html` is the inline cover (`default`, height `regular`), kept small so it
paints fast: its own script is about 4 KB, plus a chunk shared with the board (React DOM, the icon
sprite and the shared puzzle code, about 83 KB gzipped). `game.html` is the board, opened in
expanded mode by `requestExpandedMode` from the cover's button. The interaction logic is a pure reducer (`game/reducer.ts`: select, tap a cell,
lift) tested without the DOM. `game/useGame.ts` loads the game, saves placements (debounced by
400 ms) and charts. `IslandView` draws the map for the board, the result screen and the cover. On
a phone the board stacks header, map, legend and clue sheet; landscape and desktop move the legend
and clues into a sidebar. The palette is a set of CSS variables with dark-mode overrides, tap
targets are at least 44 px, and motion is turned off under `prefers-reduced-motion`. The client
fetches only its own `/api/*` routes, and every asset is bundled.

**Icons (`src/client/icons`, `tools/icons`).** Fifteen game-icons.net glyphs (the 14 landmarks and
the settler's tent) are compiled once into an inline SVG sprite, `Sprite.tsx`, mounted once in each
entry point and drawn with `<use>` in `currentColor`. `tools/icons/README.md` documents how to
rebuild it.

**Redis keys.** Strings, hashes and sorted sets only, so no key needs a scan.

| Key                    | Type   | Purpose                                                                                                                                                                                                                                           | TTL                       |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `posted:<YYYY-MM-DD>`  | string | Cron idempotency; the value is the day's post ID                                                                                                                                                                                                  | none                      |
| `post:<id>:puzzle`     | string | JSON snapshot of the schedule entry, including the solution, plus `postedAt` and `postId`                                                                                                                                                         | none                      |
| `post:<id>:user:<uid>` | hash   | `startedAt`, in-progress `placements` (JSON), `history`, `corrections`; `solvedAt`, `elapsedMs`, and the charted `finalPlacements`, `finalHistory`, `finalCorrections` (preferred by readers); `commented`, `commentClaim`, `subscribePromptSeen` | 90 days, refreshed on use |
| `post:<id>:times`      | zset   | Member user ID, score elapsed ms                                                                                                                                                                                                                  | none                      |
| `post:<id>:stats`      | hash   | `started`, `charted`, `clean`, and `fast` (stored times under 10 s, skipped by the median)                                                                                                                                                        | none                      |
| `post:<id>:settlers`   | zset   | Member user ID, score `solvedAt`                                                                                                                                                                                                                  | none                      |
| `post:<id>:results`    | string | ID of the stickied results comment                                                                                                                                                                                                                | none                      |
| `user:<uid>:streak`    | hash   | `current`, `best`, `lastDate`, `cleanRun`, `total`, `tutorialSeen`                                                                                                                                                                                | none                      |
| `user:<uid>:flair`     | string | The last flair text this app wrote for the user                                                                                                                                                                                                   | none                      |
| `snoo:<uid>`           | string | Snoovatar URL, or an empty string when the user has none                                                                                                                                                                                          | 7 days                    |
| `flair:templates`      | hash   | Tier to user flair template ID                                                                                                                                                                                                                    | none                      |
| `practice:next`        | string | Counter for the next practice island the moderator menu posts                                                                                                                                                                                     | none                      |

**Trust boundary.** The client never receives the solution.

- `GET /api/game` returns the puzzle through `toPuzzle`, which copies only the id, number, name,
  difficulty, land mask, landmarks and clues. Post data holds only the number, name, difficulty,
  land mask, landmark count and date.
- `POST /api/chart` is the only path that marks a solve. The server rejects a chart (400) unless
  every landmark sits on its own land cell, then compares it to the snapshot's solution and
  recomputes every clue (409 on a mismatch). A chart from a player who never opened the game (no
  `startedAt`) is rejected (400), so a bare request cannot record a 0 ms time. `hSetNX` on
  `solvedAt` makes the solve happen once per player per post; a repeat returns the stored result.
- Solve time is measured by the server. `startedAt` is claimed with `hSetNX` on the first
  `GET /api/game`, and the elapsed time is the server clock at chart time minus that. Corrections
  and the place and lift history are client-reported soft stats, checked for shape (at most 200
  `P` and `L` characters, corrections 0 to 999).
- `GET /api/reveal` returns settler positions only to a player who has already solved, because
  those positions are the solution's empty cells.

## Development

You need Node 24 (`.nvmrc` pins 24.18.0) and a Reddit account connected to Reddit for Developers.

```sh
npm install
npm run login   # devvit login, once per machine
npm run dev     # devvit playtest
```

`npm run dev` runs `devvit playtest` against the subreddit named in `dev.subreddit` of
`devvit.json`, which is `r/cartographer_dev`. Create that subreddit with the account you used for
`devvit login` (you must moderate it, and it must have fewer than 200 members), or point the field
at a different name. The `DEVVIT_SUBREDDIT` environment variable overrides the field for one run.
If the field is removed, the CLI creates a subreddit of its own on the first run and writes the
name back into `devvit.json`. To see a board right away, use the subreddit menu item "Cartographer:
post a practice island".

| Command              | What it runs                                                                          |
| -------------------- | ------------------------------------------------------------------------------------- |
| `npm run test:unit`  | Vitest, every suite once, including the schedule verification                         |
| `npm run test:watch` | Vitest in watch mode                                                                  |
| `npm run lint`       | ESLint over `src` and `tools`                                                         |
| `npm run test:types` | `tsc --build` over the project references in `tools/tsconfig.*.json`                  |
| `npm run build`      | Vite with the Devvit plugin: `dist/client` (both entries) and `dist/server/index.cjs` |
| `npm run deploy`     | Type check, lint, then `devvit upload` (a private upload, not a publish)              |
| `npm run launch`     | Disabled on purpose. The app is not published before judging ends on 2026-12-17.      |

**Tests.** 807 Vitest tests in 35 files: 345 for the shared puzzle module (table-driven tests per
clue type, sentence templates, solver fixtures with known solution and round counts, and a
randomized cross-check of the two solvers), 311 for the server (every service and route), 90 for
the client (the reducer, components, the game hook and the cover), 54 for the generator (including
a property test over 100 seeds for each landmark count and verification of the committed files),
and 7 for the icon pipeline.

Server tests never mock modules. Every service takes the `Deps` object, so tests pass `makeDeps()`
from `src/server/fakes.ts`: an in-memory `FakeRedis` covering the commands the app uses, a
`FakeReddit` that records every call and can be told to fail, `FakeSettings`, a fixed clock and a
small fixture schedule. Route tests go through `app.request` on `createApp(deps)`, so they exercise
the real Hono routing. Client tests run in jsdom with Testing Library: the reducer is tested as a
pure function, `fetch` is stubbed with `vi.stubGlobal`, and `@devvit/web/client` is replaced with
`vi.mock` where a component calls it.

**CI.** `.github/workflows/ci.yaml` runs `npm ci`, the type check, lint, the unit tests and the
build on Node 24.18.0 for pushes and pull requests to `main`.

**Layout.**

```
src/shared/puzzle/   types, grid, predicates, templates, solvers
src/shared/          api.ts (wire types), card.ts (Post my chart card)
src/server/          Hono app, deps and fakes, routes/, services/, puzzles/*.json
src/client/          splash.tsx (cover entry), game.tsx (board entry), cover/, game/, icons/
tools/gen/           generator, review and verify
tools/icons/         icon extraction and sprite builder
tools/brand/         subreddit icon and banner generator (outputs in docs/brand/)
```

## Moderator guide

**Install.** Installing or upgrading the app creates four user flair templates (Deckhand,
Navigator, Cartographer, Master Cartographer), reusing any template that already has that exact
text, and stores their IDs, plus a "Daily Island" post flair template for the daily posts. If that
step fails, the install still succeeds and the templates are
created on the first flair write.

**Menu items.** Both live in the subreddit menu and are visible to moderators only.

- "Cartographer: post today's island" posts the scheduled island for today's UTC date and opens it.
  If today's island is already posted, or nothing is scheduled for today, it shows a toast instead.
- "Cartographer: post a practice island" posts the next island from the 20-island practice pool,
  cycling through it, and opens it. Practice islands never count toward streaks, totals, tiers or
  flair.

**Community appearance.** `docs/brand/icon-1024.png` is the community icon (Reddit crops it to a
circle; the compass sits inside the crop) and `banner-1920x384.png` the banner, with
`banner-1600x480.png` as the taller variant if the mod tools ask for one. The same icon is wired
into `devvit.json` as `marketingAssets.icon` for the app listing. Regenerate everything with
`python3 tools/brand/build.py`; the SVGs next to the PNGs are the sources.

**Community colors.** From the game's palette, so the page matches the banner and the board:

| Setting           | Hex       | In the game                 | Note                                                        |
| ----------------- | --------- | --------------------------- | ----------------------------------------------------------- |
| Key color         | `#3D7AA5` | water-deep, one step darker | 4.6:1 as white text on it; the palette's `#5B93BA` is 3.3:1 |
| Base color        | `#F5EBD4` | sheet (the clue sheet)      | Page background behind the post cards                       |
| Pinned post color | `#1F6E43` | lit-text (a satisfied clue) | 6.2:1 on white, 5.3:1 on the base color                     |

Alternatives: `#2B2A28` (ink) as a neutral key color, `#8A5200` (warn-text) for an amber pinned
color. Reddit ignores the base color in dark mode and keeps the other two.

**Setting.** "Award user flair for streaks" (`flairEnabled`, on by default). When it is off, the
app never writes user flair. When it is on, the app writes flair only after a counted solve, and
only when the user's current flair is empty or is the text the app wrote last.

**Schedule.** The `daily` task runs at `0 12 * * *` and `daily-retry` at `15 12 * * *`; both call
`/internal/cron/daily`. Devvit does not document the cron time zone; it is assumed to be UTC, which
makes the post time 7 am Eastern. TODO(joey): record the time zone observed in the first playtest.
Posting is idempotent per UTC date: the `posted:<date>` marker is written only after the post
succeeds, so the 12:15 run posts if the 12:00 run failed and does nothing if it succeeded. Each
post gets "Daily Island" post flair through a template the app creates on install, since Reddit
refuses flair text without a template ID; if the template is missing or the flaired submit fails,
the post goes up without flair. The schedule runs out after 2027-05-29; after that the cron logs an
error and posts nothing until the schedule is extended with `npm run gen`.

**Deleting a post.** The post-delete trigger removes the post's snapshot, times, stats, settlers
and results-comment keys. If the deleted post was the day's island, the `posted:<date>` marker is
cleared too, so the retry task or the "post today's island" menu item can post it again. Per-user
progress for the post expires on its own after 90 days.

## Credits

Landmark and settler icons are from [game-icons.net](https://game-icons.net/), licensed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Icons made by
[Delapouite](https://delapouite.com) (Lighthouse, Windmill, Castle, Greek temple, Well, Cave entrance,
Ship wreck, Barn, Watchtower, Camping tent, Mine wagon, Ancient ruins, Tipi) and
[Lorc](http://lorcblog.blogspot.com) (Anchor, Fire bowl). They are embedded unmodified as an inline
SVG sprite and recolored at render time with `currentColor`. The per-icon list with source links is in
[ATTRIBUTION.md](ATTRIBUTION.md).

## License

The code is released under the BSD-3-Clause license in [LICENSE](LICENSE), inherited from the
Devvit React template this project started from. The island data in `src/server/puzzles/` is
generated by `tools/gen` from a fixed seed, contains no third-party content, and ships under the
same license. The icons keep their own CC BY 3.0 license; see Credits.
