# Cartographer: Devpost submission draft

Draft text for the Reddit Game of the Day 2026 submission form. Submissions close Tuesday
2026-12-08 at 18:00 PT. Do not publish the app before judging ends on 2026-12-17; `devvit upload`
and `devvit playtest` only.

- Demo post: TODO(joey): link to the post in the public test subreddit (under 200 members)
- App listing: TODO(joey): confirm `https://developers.reddit.com/apps/cartographer-daily` after `devvit upload`
- Video: TODO(joey): link (under one minute)
- Repository: https://github.com/jkarns87/cartographer
- README: https://github.com/jkarns87/cartographer/blob/main/README.md

## Tagline

A daily island to chart: read the surveyor's notes, place the landmarks, light every clue.

## Inspiration

Daily puzzles work when they are short, fair, and the same for everyone that day. On Reddit the
word and number-grid lanes are crowded, and classic logic-grid puzzles are fun on paper but read
like a spreadsheet. Cartographer makes the logic spatial: a small island map, landmarks drawn as
icons, and clues written as a surveyor's notes ("The Windmill is due east of the Well"). A map also
gives the community somewhere to stand. When you finish, the people who charted the same island
appear on it.

## What it does

- Every day at 12:00 UTC the app posts a new island. The inline cover in the feed shows the island's
  silhouette, number, name, difficulty and landmark count straight from the post's data, then adds
  how many people have charted it, the share who did it cleanly, and the median time.
- "Chart this island" opens the board in expanded mode. You tap a landmark in the legend, then tap
  a land cell to place it. Tapping a placed landmark lifts it and counts as a correction. Each clue
  shows a hollow circle while pending, a green check when your placement satisfies it, and an amber
  mark when your placement breaks it. Tapping a clue pulses the landmarks it names.
- When every clue is lit, Chart it sends the placement to the server, which checks it against the
  stored solution. The result screen stamps the island Charted and shows your time, corrections,
  rank, streak and tier, while the snoovatars of everyone who charted it drop onto the island,
  yours first.
- Post my chart replies under the post's stickied results comment with a fixed card: the island's
  title, a row of pin and lift symbols that shows how you solved it without showing where, your
  time, and your streak. Share sends the same card through Reddit's share sheet. Join for
  tomorrow's island subscribes you. All three are optional and separate.
- Counted solves earn user flair in the subreddit: Deckhand, Navigator (3-day streak), Cartographer
  (7 days) and Master Cartographer (30 days), with the streak in the text (`Navigator · 5d`) and a
  Steady Hand mark for seven clean solves in a row.
- The week ramps up: 7 landmarks Monday to Wednesday, 8 Thursday to Saturday, 9 on Sunday, each
  graded easy, medium or hard.
- Moderators get two menu items (post today's island, post a practice island) and a setting to turn
  flair off.

## How we built it

- Devvit Web 0.15.4 with a React 19 and Tailwind 4 client, a Hono server, and Redis. TypeScript
  throughout, built with Vite and tested with Vitest.
- One shared puzzle module (types, grid geometry, clue predicates, sentence templates, solvers) is
  used by the client for live clue states, by the server to verify a chart, and by the generator.
- Islands are generated offline. The generator grows a coastline, places the landmarks, lists every
  true clue, adds clues until the solution is unique, removes every clue it can, and then requires
  a propagation-only "human solver" to finish the island without guessing. 180 dated islands and 20
  practice islands are committed, and the test suite re-proves every one of them on each run.
- The server takes all of its dependencies (Redis, the Reddit client, settings, the clock, the
  request context) as one object, so every route and Reddit interaction is tested against
  in-memory fakes.
- The inline cover is its own small entry point that paints from post data with no network call;
  the board is a second entry opened in expanded mode.
- Icons come from game-icons.net (CC BY 3.0), compiled once into an inline SVG sprite and recolored
  with the app's palette.

## Challenges we ran into

- **Fair is more than unique.** A puzzle can have one solution and still need trial and error. The
  generator gates every island on a solver that only removes impossible candidates and never
  guesses. Its first version counted in-place sweeps, so the same island graded differently
  depending on the order of its clues. It now works in rounds, with every removal in a round
  computed from the state at the start of that round, so the round count measures the depth of the
  deduction and does not depend on clue order. The difficulty bands were recalibrated on that count.
- **Short clue sheets.** Removing clues is greedy, and Sunday's 9-landmark islands often ended
  above the 11-clue cap. Re-running the removal pass with fresh shuffles before rejecting an
  attempt roughly halved the reject rate.
- **Readable islands.** Reading the generated sheets as plain text (`npm run gen:review`) turned up
  problems no metric caught: full-width land bars, enclosed lakes that made "northern shore"
  ambiguous, near-rectangles where every shore clue meant "top row", and clues that another clue
  already implied. Each became a generator rule.
- **Keeping the answer off the client.** The board needs live feedback, but the solution never
  leaves the server. The clue predicates need only the clues and the land mask, so the client
  scores your placement itself and the server re-verifies. Settler positions are the solution's
  empty cells, so the reveal is withheld until you have solved.
- **Redis without lists, sets or scan.** The median time comes from a sorted set read by rank, with
  a counter that skips times under 10 seconds. Post cleanup deletes a known list of keys, and
  per-user progress expires on its own.
- **Platform unknowns.** The cron time zone, whether snoovatar images load inside the webview, and
  how post flair behaves on a subreddit without a matching template are not documented. Each has a
  fallback in code and an item on the playtest checklist.

## Accomplishments that we're proud of

- Every island in the schedule is proven to have exactly one solution and to be solvable by
  deduction alone, and CI fails if that ever stops being true.
- Solves are verified on the server and timed by the server. The client never receives the
  solution.
- The results thread follows Devvit's comment rules exactly: an explicit button, a reply as the
  user under one stickied app comment, a fixed template, no free text, nothing gated on it.
- Clue states use shape and color, every cell has a screen-reader label, tap targets are at least
  44 px, and dark mode and reduced motion are supported.
- 796 automated tests cover the puzzle rules, both solvers, the generator, every server service
  and route, and the client's reducer and components. TODO(joey): update the count from the README
  if it changes before submitting.

## What we learned

- A difficulty score has to ignore things the player never sees, such as the order clues happen to
  be stored in.
- Reading generated content as a human would catches more than any single metric.
- Devvit Web's split between a static client, a stateless server and a manifest pushes toward
  snapshotting each day's content at post time, which also makes redeploys safe.
- Passing dependencies in as one object made Reddit-side failures (flair, comments, post flair)
  easy to test without mocking modules.

## What's next for Cartographer

- Publish after judging ends on 2026-12-17 and apply for featuring.
- Extend the schedule beyond May 2027 and open past islands as practice.
- Player-built islands: a player places landmarks, the generator writes and verifies the clue
  sheet, and the community charts it.
- Label Sunday's 9-landmark island as a weekly Expedition in the interface.

## Why it is Reddity

Cartographer is not about Reddit; it is a puzzle that works best inside a community. Everyone in the
subreddit charts the same island on the same day. The stickied results thread under each post
collects everyone's cards, which show how a person solved it without spoiling where anything goes.
After you chart the island, the snoovatars of the people who charted it before you settle onto it,
so the solved map becomes a picture of that day's players. Streak flair carries your record into
every comment you make in the subreddit, and the app never overwrites flair you chose. No Snoo, no
karma, no subreddit jokes.

## Judging criteria

**Delightful UX.** The first screen is the island itself, painted from post data without a network
call, so the feed shows a different coastline each day. Play is two taps per landmark: pick it,
place it. Clues answer immediately with a shape and a color, a tapped clue points at the landmarks
it names, water cells shake instead of failing silently, and a three-step overlay teaches the rules
once. The finish is one card: the Charted stamp, your numbers, and the community arriving on the
island around you.

**Polish.** The app is built for publishing: the inline cover stays small and tap-only, the board
fits a phone in portrait and moves the clues to a sidebar in landscape and on desktop, and dark mode
and reduced motion are handled. Every service has tests (755 in all), the server
verifies every solve, the cron is idempotent with a retry 15 minutes later, and Reddit-side failures
are logged without breaking the game. Icons are open-licensed and credited, and there are no
third-party requests at runtime.

**Reddity.** The game is shared by design: one island per day for the whole subreddit, a stickied
results thread for the cards, snoovatars on the solved map, and streak flair that shows up in the
subreddit's comments. Commenting and subscribing are separate, optional buttons, as Devvit's rules
require.

**Daily Content.** 180 dated islands (2026-12-01 to 2027-05-29) and 20 practice islands are
generated from a fixed seed and verified on every test run, with a weekly ramp from 7 to 9
landmarks and an easy, medium or hard grade measured by the depth of deduction each island needs.
Every island is snapshotted into Redis when it is posted, so a redeploy never changes a live
puzzle, and one command (`npm run gen -- --day <date>`) replaces a single day.

## Demo video shot list

Target 57 seconds, recorded on a phone in the test subreddit, with no voice-over required. Use
captions for the bracketed text.

| #   | Time        | Length | Shot                                                                                                                                     |
| --- | ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 0:00 - 0:04 | 4 s    | Scroll the feed to the day's post. The inline cover shows the silhouette, name and difficulty. [A new island every day]                  |
| 2   | 0:04 - 0:07 | 3 s    | Tap Chart this island. The board opens in expanded mode.                                                                                 |
| 3   | 0:07 - 0:11 | 4 s    | First tutorial step, then Skip. [Place landmarks, light every clue]                                                                      |
| 4   | 0:11 - 0:18 | 7 s    | Select the landmark a shore clue names and place it on that coast. The clue turns into a green check.                                    |
| 5   | 0:18 - 0:24 | 6 s    | Place a landmark that breaks a clue. The clue turns amber. Tap the landmark to lift it; corrections reads 1.                             |
| 6   | 0:24 - 0:28 | 4 s    | Tap a clue. The landmarks it names pulse on the map and in the legend.                                                                   |
| 7   | 0:28 - 0:35 | 7 s    | Speed-ramp the last placements. Every clue lights and Chart it slides up. Tap it.                                                        |
| 8   | 0:35 - 0:44 | 9 s    | Result screen: the Charted stamp, time, rank, then the snoovatars settling onto the island, yours first. [Everyone who charted it today] |
| 9   | 0:44 - 0:51 | 7 s    | Tap Post my chart, then Results thread. The card appears as a reply under the stickied comment.                                          |
| 10  | 0:51 - 0:57 | 6 s    | Close on a username with `Navigator · 3d` flair in the thread. [Cartographer · TODO(joey): subreddit name]                               |

TODO(joey): before recording, prepare a test account with a three-day streak for shot 10 and a few
other solvers so shot 8 shows several snoovatars.
