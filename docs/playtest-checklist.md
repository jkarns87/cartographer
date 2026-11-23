# Cartographer playtest checklist

Run these in the private test subreddit with `npm run dev` (`devvit playtest`) before recording the
video and before moving the demo post to the public test subreddit. Use two Reddit accounts: the app
owner and a second, non-owner, non-moderator account. Record every finding in the README where a
`TODO(joey)` asks for it.

Useful tools: the app logs from the playtest session, the browser devtools Network tab on desktop
(new Reddit), and devtools device emulation for sizes.

## Day one

- [ ] **Cron time zone.** The `daily` task (`0 12 * * *`) and `daily-retry` (`15 12 * * *`) are
      assumed to run in UTC.
  - Look at: the creation time of the first post the cron makes, and the cron log line
    (`status: 'posted'` with the date) against 12:00 UTC.
  - If it fails: if the tasks fire at another zone's noon, rewrite both cron expressions in
    `devvit.json` to the UTC-equivalent hour and upload again. The day key is always the UTC date
    at post time, so the right island still posts. Record the finding in the README Moderator
    guide.

- [ ] **Retry is a no-op after a good post.**
  - Look at: the 12:15 run logs `status: 'already'`, and the subreddit has exactly one island for
    the day.
  - If it fails: a second post means the `posted:<date>` marker was not written. Delete the
    duplicate post, check the logs of the 12:00 run for an error after the submit, and fix before
    the next day.

- [ ] **Post flair `Daily Island`.** `submitCustomPost` is called with `flairText: 'Daily Island'`;
      when that throws, the code retries once without it.
  - Look at: whether the post carries the flair, whether the logs show
    `submitIsland: submit with flair failed ... retrying without`, and that only one post was
    created.
  - If it fails: if the subreddit needs a template, create a `Daily Island` post flair template in
    mod tools. If a failed flaired submit still created a post (two posts appear), remove
    `flairText` from `submitIsland` in `src/server/services/posting.ts`.

- [ ] **Results comment.**
  - Look at: the app's comment ("Results thread. Finish the island and tap Post my chart in the
    game to add yours.") is distinguished and stickied at the top of the post's comments.
  - If it fails: the post is still playable. Look for the log line
    `pinResults: results comment failed`. Post my chart reports an error until the comment
    exists, so fix before the demo.

- [ ] **Snoovatar images in the webview.**
  - Look at: after charting, the settlers on the result screen show avatar images, not broken
    image icons. Check the console for blocked-image or CSP errors. Test with one account that has
    a snoovatar and one that does not (that one should show the tent icon).
  - If it fails: the tent icon from the sprite already covers users without a snoovatar. If
    Reddit's image URLs are blocked, render the tent for everyone by returning `snoovatar: null`
    from `reveal` in `src/server/services/snoovatar.ts`.

- [ ] **Flair text override.** Templates are created with `allowUserEdits: false`, and
      `setUserFlair` passes both `flairTemplateId` and `text`.
  - Look at: after a counted solve, the user's flair in the subreddit reads `Deckhand · 1d` (tier
    plus streak), not just `Deckhand`.
  - If it fails: if the text override is ignored, create the templates with
    `allowUserEdits: true` in `ensureFlairTemplates` (`src/server/services/flair.ts`), or drop
    `flairTemplateId` and set the text with a background color directly.

- [ ] **Second device resumes.**
  - Look at: place three landmarks on the phone, then open the same post on desktop. The same
    three placements, the same corrections count, and a timer that kept running (not reset to
    0:00).
  - If it fails: saves are debounced by 400 ms. Check that `POST /api/place` returns 200 in the
    Network tab and that `GET /api/game` returns the saved `placements`.

- [ ] **Practice island.**
  - Look at: "Cartographer: post a practice island" creates a post titled
    `Cartographer practice · <name>`, the result screen says the streak is unchanged, and the
    Post my chart card has no streak line.
  - If it fails: check the logs for `menu/post-practice failed`.

## Mobile

- [ ] **Inline cover fits.** The cover uses height `regular`.
  - Look at: in the iOS and Android apps, and in devtools at 390x320, the whole cover (island,
    name, difficulty, stats line and the full button) is visible with no scrollbar and nothing
    clipped.
  - If it fails: shrink the island column in `src/client/cover/Cover.tsx` (it is 44% wide) or
    drop the stats line on short heights.

- [ ] **Lighthouse on the cover.** Target: performance above 80.
  - Look at: a Lighthouse mobile run against the cover in the playtest post (desktop Chrome
    devtools).
  - If it fails: the cover's own entry is small; the weight is the shared React chunk. Check that
    nothing from the board (reducer, result screen, tutorial) was pulled into the cover bundle.

- [ ] **iOS expanded mode.**
  - Look at: Chart this island opens the board; the map is square and full width; every tap target
    is easy to hit; the Chart it bar sits above the home indicator; Share opens the share sheet.
  - If it fails: note the device and iOS version; the fixed Chart it bar uses
    `env(safe-area-inset-bottom)`.

- [ ] **Android expanded mode.**
  - Look at: the same as iOS, plus the system back gesture returns to the feed without losing
    progress (reopen and check the placements).
  - If it fails: note the device and Android version.

- [ ] **Dark mode.**
  - Look at: both the cover and the board with the system in dark mode. Text on paper and on the
    clue sheet is readable, the sand cells stay light with dark icons, and the green check and
    amber mark are distinguishable.
  - If it fails: adjust the dark overrides of the color variables in `src/client/index.css`.

- [ ] **Landscape and desktop.**
  - Look at: on a phone in landscape and on desktop, the legend and clue sheet sit in a sidebar to
    the right of the board, and the board fits the viewport height.
  - If it fails: the layout is breakpoint-only (`md:` and `sm:landscape:` in `GamePage.tsx`).

- [ ] **Reduced motion.**
  - Look at: with reduced motion on, settlers appear without dropping, the stamp does not scale
    in, water taps do not shake, and highlighted landmarks get a ring or glow instead of a pulse.
  - If it fails: add a `motion-safe:` or `motion-reduce:` variant to the offending class.

## Moderation

- [ ] **Menu items.**
  - Look at: as a moderator, the subreddit menu shows "Cartographer: post today's island" and
    "Cartographer: post a practice island". As the non-moderator account, neither appears. Post
    today's island either posts and navigates to the post, or shows a toast that today's island is
    already posted (or that nothing is scheduled).
  - If it fails: check the `menu` block in `devvit.json` (`forUserType: 'moderator'`,
    `location: 'subreddit'`).

- [ ] **Flair templates on install.**
  - Look at: mod tools, user flair, shows Deckhand, Navigator, Cartographer and Master
    Cartographer. Upgrading the app does not create duplicates.
  - If it fails: the templates are also created on the first flair write, so streak flair still
    works; check the logs for `ensureFlairTemplates failed`.

- [ ] **The `flairEnabled` setting.**
  - Look at: turn "Award user flair for streaks" off in the app's subreddit settings and solve a
    fresh island with a test account: its flair does not change. Turn it back on and solve the
    next one: flair is written.
  - If it fails: check that `settings.subreddit.flairEnabled` is in `devvit.json` and that the
    setting saved.

- [ ] **User-chosen flair is kept.**
  - Look at: give the test account a custom flair, then solve: the custom flair is unchanged.
  - If it fails: this is a bug in `applyFlair` (`src/server/services/flair.ts`); fix before the
    demo.

- [ ] **Post delete trigger body.** The handler reads `postId` from the body and falls back to the
      request context.
  - Look at: delete a test post and read the logs. A line
    `on-post-delete: no postId in body or context` means the body shape is different. If you
    deleted today's island, "post today's island" should now post a fresh one instead of showing
    the already-posted toast.
  - If it fails: log the body, then update `bodyPostId` in `src/server/routes/internal.ts` to read
    the post ID from where it actually is (for example a nested post object).

## Compliance

- [ ] **No solution on the client.**
  - Look at: in the desktop Network tab, the responses of `GET /api/game`, `GET /api/cover` and
    `GET /api/reveal`. `puzzle` holds only `id`, `number`, `name`, `difficulty`, `land`,
    `landmarks` and `clues`; there is no `solution` or `seed` anywhere. Before you solve,
    `/api/reveal` returns an empty `settlers` list.
  - If it fails: blocker. Fix `toPuzzle` in `src/server/services/snapshot.ts` before submitting.

- [ ] **Post my chart identity and placement.** The app declares `permissions.reddit.scope: 'user'`
      and `asUser: ['SUBMIT_COMMENT', 'SUBSCRIBE_TO_SUBREDDIT']`, and posts with `runAs: 'USER'`.
  - Look at: tap Post my chart as the owner and as the non-owner account. Record which username
    each reply shows (Devvit runs user actions from the app account for unpublished apps unless
    the owner acts). Each reply is under the stickied results comment, never top-level, and
    matches the fixed card. A second tap shows Posted and creates no second reply.
  - If it fails: if the call errors, the claim is released and the button shows "Could not post
    your chart"; read the logs. Update the README note on playtest identity with what you saw.

- [ ] **Nothing is gated.**
  - Look at: chart an island without tapping Post my chart, Share or Join. The result, rank,
    streak and flair are all recorded. Post my chart, Share and Join for tomorrow's island are
    three separate buttons.
  - If it fails: blocker for review; remove the dependency.

- [ ] **Subscribe.**
  - Look at: Join for tomorrow's island subscribes the account to the subreddit, then shows
    "Subscribed. See you tomorrow." and does not show again on that island.
  - If it fails: check the logs for the `/api/subscribe` error and the `SUBSCRIBE_TO_SUBREDDIT`
    permission.

- [ ] **No free text and no Snoo.**
  - Look at: there is no text input anywhere in the cover, board or result screen, and the only
    Reddit imagery is players' own snoovatars.
  - If it fails: blocker; remove it.

- [ ] **Submission basics.**
  - Look at: the README renders on GitHub with screenshots in place, the Credits section and
    `ATTRIBUTION.md` are present, the demo subreddit is public with fewer than 200 members, and
    `npm run launch` still refuses to run.
  - If it fails: fix before 2026-12-08 18:00 PT.
