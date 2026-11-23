# Cartographer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Devvit Web daily deduction game where players place landmark icons on a 6x6 island until a unique clue set is satisfied, with flair, a results comment thread, and a snoovatar reveal.

**Architecture:** One shared TypeScript puzzle module (types, grid, predicates, templates, solvers) is imported by three consumers: an offline generator that writes a dated schedule JSON, a Hono server on `@devvit/web/server` that posts daily islands and verifies charts against Redis snapshots, and a React client with a tiny inline cover entry and a full expanded game entry. Services receive a `Deps` object so every server path is tested with in-memory fakes.

**Tech Stack:** `@devvit/web` 0.15.4, Node 24, TypeScript 6, Hono 4, React 19, Tailwind 4, Vite 8, Vitest 4 (+ jsdom, Testing Library), tsx for scripts.

**Spec:** `docs/superpowers/specs/2026-11-22-cartographer-design.md` (read it first; this plan argues from it).

## Global Constraints

- Node >= 24, `@devvit/web` 0.15.4. Devvit Web only. No `@devvit/public-api`, no Blocks.
- Never run `devvit publish` or `npm run launch` (the script is intentionally disabled until 2026-12-17).
- Commits carry no `Co-Authored-By` trailers. Subagents do not commit; the coordinator commits after review.
- Client fetches only `/api/*`. No external origins at runtime. All assets vendored.
- `postData` <= 2 KB. Requests <= 30 s. Redis: strings, hashes, sorted sets only (no lists, sets, scan).
- The client never receives `solution`. `POST /api/chart` is the only path that marks a solve.
- User comments: explicit button only, replies under the stickied app comment, fixed template, no free text. Comment and subscribe are separate buttons; nothing is gated on them.
- Open-licensed icons only (CC0 or CC BY with attribution). Never the Snoo mascot.
- Template code style (AGENTS.md): type aliases over interfaces, named exports, never cast types (`as`), `@typescript-eslint/no-floating-promises` is an error.
- Test command: `npm run test:unit` (Vitest). Type check: `npm run test:types`. Lint: `npm run lint`. Build: `npm run build`.
- Ownership per task (to allow parallel work): a task edits only the paths listed under its **Files**. Do not touch `package.json`, `devvit.json`, `vitest.config.ts`, or tsconfigs; report needed changes instead.

## File Structure

```
src/shared/puzzle/types.ts        DONE   contract types, LANDMARKS, LANDMARK_NAMES, DIRS
src/shared/puzzle/grid.ts         DONE   cell math, mask helpers, geometry predicates
src/shared/puzzle/predicates.ts   DONE   clueHolds, evaluateClue, validatePlacement, isSolved
src/shared/puzzle/templates.ts    T1     clueText, clueParts (sentence rendering)
src/shared/puzzle/solver.ts       T2     propagate (human solver), countSolutions (uniqueness)
src/shared/api.ts                 DONE   request/response types shared by client and server
tools/gen/{rng,island,clues,build,names,schedule,generate,review,verify}.ts  T3
src/server/puzzles/schedule.json  T3     180 dated islands (server-only)
src/server/puzzles/practice.json  T3     20 practice islands
src/server/deps.ts                T4     Deps type, minimal RedisLike/RedditLike interfaces
src/server/fakes.ts               T4     FakeRedis, FakeReddit for tests
src/server/keys.ts                T4     Redis key builders
src/server/services/schedule.ts   T4     load JSON, entryForDate, practiceEntry
src/server/services/snapshot.ts   T4     save/load post snapshot
src/server/services/posting.ts    T4     postIsland, postToday (cron + menu)
src/server/services/streaks.ts    T4     pure streak rule + persistence + tier
src/server/services/flair.ts      T4     ensureFlairTemplates, applyFlair
src/server/routes/internal.ts     T4     cron, menu, triggers
src/server/app.ts                 T4     createApp(deps)
src/server/index.ts               T4     wire real deps, serve
src/server/services/progress.ts   T5     per-user hash, startedAt, placements
src/server/services/stats.ts      T5     counters, times zset, median, rank
src/server/services/chart.ts      T5     verify + finalize
src/server/services/comments.ts   T5     results header, chart card text, post chart
src/server/services/snoovatar.ts  T5     resolve, cache, reveal mapping
src/server/routes/api.ts          T5     /api/* handlers
src/client/game/reducer.ts        T6     pure interaction state
src/client/game/components/*.tsx  T6     Board, Legend, ClueSheet, Header, ChartButton, IslandView
src/client/game/api.ts            T6     typed fetch wrappers
src/client/game/useGame.ts        T6     load/save/chart hook
src/client/game/GamePage.tsx      T6
src/client/game.tsx, game.html    T6
src/client/game/ResultScreen.tsx  T7     result + reveal + buttons
src/client/game/Tutorial.tsx      T7
src/client/splash.tsx, splash.html T7    inline cover
src/client/icons/Sprite.tsx       T8     inline SVG symbols
src/client/icons/Icon.tsx         T8     replaces placeholder
ATTRIBUTION.md                    T8
README.md                         T9
```

---

### Task 1: Shared module tests and clue templates

**Files:**
- Create: `src/shared/puzzle/grid.test.ts`, `src/shared/puzzle/predicates.test.ts`, `src/shared/puzzle/templates.ts`, `src/shared/puzzle/templates.test.ts`
- Modify (only if a test exposes a bug): `src/shared/puzzle/grid.ts`, `src/shared/puzzle/predicates.ts`

**Interfaces:**
- Consumes: everything in `types.ts`, `grid.ts`, `predicates.ts` (read them first).
- Produces:
  ```ts
  export const DIR_WORD: Record<Dir, string>;      // north, east, south, west
  export const SHORE_WORD: Record<Dir, string>;    // northern, eastern, southern, western
  export type CluePart = { text: string } | { landmark: LandmarkId };
  export const clueParts = (clue: Clue): CluePart[];
  export const clueText = (clue: Clue): string;    // clueParts joined, landmark -> "The <Name>" rules below
  ```

Sentence rules (exact strings; `{A}` is the display name from `LANDMARK_NAMES`):

| Clue | Sentence |
|---|---|
| shore | `The {A} stands on the {SHORE_WORD[dir]} shore.` |
| inland | `The {A} is inland.` |
| due | `The {A} is due {DIR_WORD[dir]} of the {B}.` |
| somewhere | `The {A} lies somewhere {DIR_WORD[dir]} of the {B}.` |
| touches | `The {A} touches the {B}.` / not: `The {A} does not touch the {B}.` |
| shares | `The {A} shares a {axis} with the {B}.` / not: `The {A} does not share a {axis} with the {B}.` |
| between | `The {A} lies between the {B} and the {C}.` |
| extreme | `No landmark stands {DIR_WORD[dir]} of the {A}.` |

`clueParts` splits the sentence so the UI can render an icon before each landmark name: for example due -> `[{text:'The '},{landmark:'windmill'},{text:' is due east of the '},{landmark:'well'},{text:'.'}]`. `clueText` = parts mapped with `landmark -> LANDMARK_NAMES[id]`, joined.

- [ ] **Step 1: Write grid tests** in `src/shared/puzzle/grid.test.ts` covering: `maskFromRows`/`rowsFromMask` round trip; `isLand` false off-grid; `onShore` true for an edge land cell toward the edge; `isCoast`/`isInland` on the fixture; `touches` orthogonal only; `strictlyInDir` for all four dirs; `due` requires the shared axis; `between` on a row and on a column and false when not collinear; `isConnected` true for the fixture and false for two separated blobs; `boundingBox`.

Fixture (use everywhere):
```ts
export const ISLAND = maskFromRows([
  '..LL..',
  '.LLLL.',
  'LLLLL.',
  '.LLLLL',
  '..LLL.',
  '...L..',
]);
```

- [ ] **Step 2: Run** `npx vitest run src/shared/puzzle/grid.test.ts`. Expected: pass (grid.ts exists). Fix grid.ts if a test exposes a genuine bug, and say so in your report.

- [ ] **Step 3: Write predicate tests** in `src/shared/puzzle/predicates.test.ts`: one `describe` per clue type with lit / contradicted / pending cases using `evaluateClue`; extreme partial cases (a unplaced -> pending; a placed with a violating other -> contradicted; a placed, others unplaced -> pending; all placed, none violating -> lit); negated touches and shares; `validatePlacement` returning each `PlacementProblem`; `isSolved` true for a hand-built 3-landmark puzzle and false after moving one landmark.

- [ ] **Step 4: Run** the predicate tests. Expected: pass; fix predicates.ts only on a genuine bug.

- [ ] **Step 5: Write failing template tests** in `templates.test.ts` with one exact-string expectation per row in the table above, plus `clueParts` for `due` matching the example array exactly.

- [ ] **Step 6: Implement** `templates.ts` per the Interfaces block. Run the test file. Expected: pass.

- [ ] **Step 7: Run** `npm run test:unit`, `npm run lint`, `npm run test:types`. All green. Report what you changed in grid.ts or predicates.ts, if anything.

---

### Task 2: Solvers (human propagation and uniqueness)

**Files:**
- Create: `src/shared/puzzle/solver.ts`, `src/shared/puzzle/solver.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `grid.ts` (`idx`, `cellAt`, `landCells`, `onShore`, `isInland`, `due`, `strictlyInDir`, `touches`, `shares`, `between`), `predicates.ts` (`clueHolds` for cross-checking).
- Produces:
  ```ts
  export type Candidates = Map<LandmarkId, Set<number>>;   // candidate cell indexes per landmark
  export const initialCandidates = (puzzle: Pick<Puzzle, 'land' | 'landmarks'>): Candidates;
  export type PropagateStatus = 'solved' | 'stuck' | 'contradiction';
  export type PropagateResult = { status: PropagateStatus; passes: number; cands: Candidates; placement: Placement };
  export const propagate = (puzzle: Pick<Puzzle, 'land' | 'landmarks' | 'clues'>, start?: Candidates): PropagateResult;
  export type CountResult = { count: number; solutions: Placement[]; nodes: number; capped: boolean };
  export const countSolutions = (puzzle: Pick<Puzzle, 'land' | 'landmarks' | 'clues'>, opts?: { limit?: number; nodeCap?: number }): CountResult; // defaults limit 2, nodeCap 200000
  export const DIFFICULTY_THRESHOLDS = { easyMax: 3, mediumMax: 6 } as const;
  export const difficultyFor = (passes: number): Difficulty;
  ```

Algorithm for `propagate` (never guesses):
1. Compile clues into constraints once: unary `(cellIdx) => boolean` for shore/inland; binary `{ a, b, rel: (pa: Cell, pb: Cell) => boolean }` for due, somewhere, touches (negated when `not`), shares (negated when `not`); extreme `{a, dir}` becomes one binary constraint per other landmark x: `{ a: x, b: a, rel: (px, pa) => !strictlyInDir(px, dir, pa) }`; between becomes a ternary `{ a, b, c }` checked with `between(pa, pb, pc)`.
2. Loop: `passes++`; `changed = false`. Apply unary filters. For each binary constraint, keep `p` in cand(a) only if some `q` in cand(b) has `q !== p` and `rel(cellAt(p), cellAt(q))`; symmetrically for cand(b) with `rel(cellAt(q), cellAt(p))`. For each ternary, keep each member's candidate only if supporting pairs exist in the other two (all three distinct). Naked singles: for every landmark with one candidate, remove that cell from every other landmark. If any set becomes empty, return `contradiction`. If every set is a singleton, return `solved` with the placement. If nothing changed in this pass, return `stuck` (do not count the no-change pass).
3. `placement` always contains the singletons found so far.

Algorithm for `countSolutions`: `propagate` first; on contradiction return 0. If solved, count 1. Else pick the unassigned landmark with the fewest candidates; for each candidate (ascending), clone the candidate map, set the singleton, `propagate`, recurse. Increment `nodes` per branch; when `nodes > nodeCap` set `capped = true` and stop. Stop when `solutions.length >= limit`.

- [ ] **Step 1: Write failing tests** in `solver.test.ts` using the Task 1 fixture `ISLAND` (copy the mask literal; do not import from a test file):
  - A 3-landmark puzzle with a provably unique solution: `countSolutions` returns `count: 1` and the solution matches a hand-placed expectation; `propagate` returns `solved` with the same placement and `passes >= 1`.
  - The same puzzle minus one clue: `countSolutions` returns `count: 2` (limit) and `propagate` returns `stuck`.
  - A puzzle with contradictory clues (`due E` and `due W` between the same pair): `propagate` returns `contradiction`; `countSolutions` returns 0.
  - Extreme: `[{type:'extreme', a:'well', dir:'W'}]` with two landmarks removes from the other landmark every cell west of all of well's candidates after propagation (assert on `cands`).
  - Between on a column.
  - Node cap: with `nodeCap: 1` on an under-constrained 5-landmark puzzle, `capped` is true.
  - `difficultyFor(3) === 'easy'`, `difficultyFor(4) === 'medium'`, `difficultyFor(7) === 'hard'`.
  - Cross-check: for every solution returned by `countSolutions`, every clue `clueHolds` (import from predicates).

- [ ] **Step 2: Run** the file. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `solver.ts` per the algorithms. Keep constraint compilation in a separate function `compileConstraints(puzzle)` returned as `{ unary, binary, ternary }` so the generator can reuse it later if needed.
- [ ] **Step 4: Run** the file until green. Then `npm run test:unit && npm run lint && npm run test:types`.

---

### Task 3: Generator, schedule, review and verify tools

**Files:**
- Create: `tools/gen/rng.ts`, `tools/gen/island.ts`, `tools/gen/clues.ts`, `tools/gen/build.ts`, `tools/gen/names.ts`, `tools/gen/schedule.ts`, `tools/gen/generate.ts`, `tools/gen/review.ts`, `tools/gen/verify.ts`, `tools/gen/build.test.ts`, `tools/gen/verify.test.ts`, `tools/tsconfig.tools.json`
- Create (generated, committed): `src/server/puzzles/schedule.json`, `src/server/puzzles/practice.json`
- Modify: `tsconfig.json` (add the tools reference) — this is the one allowed config edit for this task.

**Interfaces:**
- Consumes: `solver.ts` (`propagate`, `countSolutions`, `difficultyFor`), `predicates.ts`, `grid.ts`, `types.ts`.
- Produces:
  ```ts
  // rng.ts
  export type Rng = { next(): number; int(n: number): number; pick<T>(arr: readonly T[]): T; shuffle<T>(arr: readonly T[]): T[] };
  export const mulberry32 = (seed: number): Rng;
  export const hashSeed = (master: number, index: number): number;   // deterministic 32-bit mix
  // island.ts
  export const growIsland = (rng: Rng, target: number): LandMask;      // random frontier growth from the inner 4x4
  export const isAcceptableIsland = (land: LandMask): boolean;          // connected, 18..22 cells, bbox >= 4x4, >= 1 inland cell
  // clues.ts
  export const enumerateTrueClues = (land: LandMask, landmarks: LandmarkId[], solution: Placement): Clue[];
  // build.ts
  export const CLUE_WEIGHTS: Record<ClueType, number>;  // due 3, somewhere 2, touches 2, shares 2, shore 2, between 2, inland 1, extreme 1; negated touches/shares weigh 0.5
  export const CAPS = { minClues: 7, maxClues: 11, maxNegatives: 2, maxBetween: 2, maxExtreme: 2 } as const;
  export type BuildOptions = { landmarkCount: number; number: number; date: string | null; id: string };
  export const buildPuzzle = (seed: number, opts: BuildOptions): ScheduleEntry | null;  // null after 50 internal attempts
  // names.ts
  export const islandName = (rng: Rng): string;  // "<Adjective> <Noun>" from two fixed word lists of >= 24 entries each
  // schedule.ts
  export const landmarkCountFor = (date: string): number; // UTC weekday: Mon..Wed 7, Thu..Sat 8, Sun 9
  export const generateSchedule = (opts: { masterSeed: number; startDate: string; days: number }): Schedule;
  export const generatePractice = (opts: { masterSeed: number; count: number }): Schedule;
  // verify.ts
  export type VerifyProblem = { id: string; problem: string };
  export const verifySchedule = (schedule: Schedule): VerifyProblem[];  // [] when all good
  ```

`buildPuzzle` pipeline (spec 3.3): for attempt in 0..49: `rng = mulberry32(hashSeed(seed, attempt))`; grow island (retry growth up to 20 times until acceptable); draw `landmarkCount` landmarks by shuffling `LANDMARKS`; assign distinct random land cells (solution); `all = enumerateTrueClues(...)`; build the sheet: shuffle `all` by weighted random order (sort by `-Math.log(rng.next()) / weight`, ascending), add clues one at a time (respecting caps for negatives/between/extreme as you add) until `countSolutions(...).count === 1` or you run out; if never unique, next attempt. Minimize: for each clue in shuffled order, remove it and keep the removal if still unique. Human check: `propagate`; if not `solved`, pick the unused true clue that most reduces the largest candidate set (evaluate by running `propagate` with that clue added) and add it, re-minimize, repeat up to 3 times; if still not solved, next attempt. Enforce `CAPS` and "every landmark named at least once" (extreme counts as naming `a` only); if violated, next attempt. Difficulty from `difficultyFor(passes)`. Name from `islandName(rng)`. Return the entry with `clues` in a final shuffled order.

- [ ] **Step 1: tools tsconfig.** Create `tools/tsconfig.tools.json` extending `./tsconfig.base.json` with `types: ["node"]`, `rootDir: ".."`, `outDir: "../dist/types/tools-gen"`, `include: ["../tools/gen/**/*.ts"]`, `exclude: ["../tools/gen/**/*.test.ts"]`, `references: [{ "path": "./tsconfig.shared.json" }]`, and add `{ "path": "./tools/tsconfig.tools.json" }` to `tsconfig.json` references.
- [ ] **Step 2: Write failing tests** `tools/gen/build.test.ts`: `mulberry32(1)` yields the same first three numbers twice; `growIsland` output passes `isAcceptableIsland` for seeds 1..20 (allow retries inside the test as the generator does); `enumerateTrueClues` on a 3-landmark solution contains an expected `due` clue and never contains a clue where `clueHolds` is false; `buildPuzzle(1, { landmarkCount: 7, ... })` returns an entry with `countSolutions().count === 1`, `propagate().status === 'solved'`, and all caps respected; a property test over seeds 1..100 for 7, 8, 9 landmarks: every non-null entry passes `verifySchedule({version:1, masterSeed:0, entries:[entry]})` with no problems, and the test logs `console.info` with reject count and clue-count histogram per landmark count (this is the day-5 spike output).
- [ ] **Step 3: Implement** `rng.ts`, `island.ts`, `clues.ts`, `names.ts`, `build.ts` until the tests pass.
- [ ] **Step 4: Write** `verify.ts` (`verifySchedule` checks: valid mask, acceptable island, landmarks distinct and 7..9, solution valid via `validatePlacement`, every clue `clueHolds` on the solution, `countSolutions().count === 1` and not capped, `propagate().status === 'solved'`, caps, every landmark named, dated entries have unique dates and numbers 1..n in date order, practice entries have `number === 0` and `date === null`) and `verify.test.ts` that loads both JSON files from `src/server/puzzles/` and asserts `[]`. The CLI (`tsx tools/gen/verify.ts`) prints problems and exits 1 on any.
- [ ] **Step 5: Write** `schedule.ts`, `generate.ts` (CLI flags: `--seed` default 7, `--start` default `2026-12-01`, `--days` default 180, `--practice` default 20, `--day YYYY-MM-DD` regenerates one dated entry using `hashSeed(masterSeed, index) ^ Date.now()` and rewrites only that entry), and `review.ts` (prints `#n name difficulty landmarks` then the clue sentences via `clueText`, then the solution rows with landmark initials).
- [ ] **Step 6: Generate** both files with `npm run gen` and run `npm run gen:review | head -80` to eyeball readability. Run `npm run gen:verify`. Expected exit 0.
- [ ] **Step 7:** `npm run test:unit && npm run lint && npm run test:types`. Report the spike numbers (reject rate, clue-count histogram, difficulty distribution across the 180 days).

---

### Task 4: Server foundation (deps, fakes, posting, streaks, flair, internal routes)

**Files:**
- Create: `src/server/deps.ts`, `src/server/fakes.ts`, `src/server/keys.ts`, `src/server/services/schedule.ts`, `src/server/services/snapshot.ts`, `src/server/services/posting.ts`, `src/server/services/streaks.ts`, `src/server/services/flair.ts`, `src/server/routes/internal.ts`, `src/server/app.ts`, tests beside each (`*.test.ts`), `src/server/puzzles/fixture.ts` (a 2-entry schedule used by tests only).
- Modify: `src/server/index.ts` (wire real deps). Delete: `src/server/core/post.ts`, `src/server/routes/menu.ts`, `src/server/routes/triggers.ts` (replaced by `routes/internal.ts`).
- Do not create `src/server/routes/api.ts` content beyond a stub router (Task 5 owns it); delete the template's counter handlers.

**Interfaces:**
```ts
// deps.ts
export type Ctx = { userId: string | undefined; username: string | undefined; postId: string | undefined; subredditName: string };
export type ZMember = { member: string; score: number };
export type RedisLike = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<string>;
  del(...keys: string[]): Promise<void>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<number>;
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  zAdd(key: string, ...members: ZMember[]): Promise<number>;
  zCard(key: string): Promise<number>;
  zRank(key: string, member: string): Promise<number | undefined>;
  zScore(key: string, member: string): Promise<number | undefined>;
  zRange(key: string, start: number, stop: number, options?: { by: 'rank' }): Promise<ZMember[]>;
};
export type PostLike = { id: string };
export type CommentLike = { id: string; distinguish(makeSticky?: boolean): Promise<void> };
export type UserFlairLike = { flairText?: string | undefined };
export type UserLike = { username: string; getUserFlairBySubreddit(subreddit: string): Promise<UserFlairLike | undefined> };
export type FlairTemplateLike = { id: string; text: string };
export type RedditLike = {
  submitCustomPost(opts: { subredditName: string; title: string; entry?: string; postData?: Record<string, unknown>; textFallback?: { text: string }; flairText?: string }): Promise<PostLike>;
  submitComment(opts: { id: string; text: string; runAs?: 'USER' | 'APP' }): Promise<CommentLike>;
  getUserFlairTemplates(subredditName: string): Promise<FlairTemplateLike[]>;
  createUserFlairTemplate(opts: { subredditName: string; text: string; backgroundColor?: string; textColor?: 'light' | 'dark'; allowUserEdits?: boolean }): Promise<FlairTemplateLike>;
  setUserFlair(opts: { subredditName: string; username: string; flairTemplateId?: string; text?: string }): Promise<void>;
  getCurrentUser(): Promise<UserLike | undefined>;
  getSnoovatarUrl(username: string): Promise<string | undefined>;
  subscribeToCurrentSubreddit(): Promise<void>;
};
export type SettingsLike = { get<T>(name: string): Promise<T | undefined> };
export type Deps = { redis: RedisLike; reddit: RedditLike; settings: SettingsLike; now: () => number; ctx: () => Ctx; schedule: Schedule; practice: Schedule };
```
The real `reddit` and `redis` from `@devvit/web/server` satisfy these structurally (verify with `npm run test:types`; if a method's real signature does not fit, adapt the interface in `deps.ts`, never cast).

```ts
// keys.ts
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
};
export const USER_TTL_SECONDS = 90 * 24 * 3600;
export const SNOO_TTL_SECONDS = 7 * 24 * 3600;

// services/schedule.ts
export const loadSchedules = (): { schedule: Schedule; practice: Schedule };  // imports the two JSON files
export const entryForDate = (schedule: Schedule, date: string): ScheduleEntry | undefined;
export const practiceEntry = (practice: Schedule, index: number): ScheduleEntry | undefined; // index modulo length
export const utcDate = (ms: number): string;   // 'YYYY-MM-DD'

// services/snapshot.ts
export type Snapshot = ScheduleEntry & { postedAt: number; postId: string };
export const saveSnapshot = (deps: Deps, snap: Snapshot): Promise<void>;
export const loadSnapshot = (deps: Deps, postId: string): Promise<Snapshot | undefined>;
export const toPuzzle = (snap: Snapshot): Puzzle;                 // strips date, seed, solution, postedAt, postId
export const toPostData = (entry: ScheduleEntry): IslandPostData;
export const toSummary = (snap: Snapshot): IslandSummary;

// services/posting.ts
export const RESULTS_HEADER = 'Results thread. Finish the island and tap Post my chart in the game to add yours.';
export const postTitle = (entry: ScheduleEntry): string;   // `Cartographer #${n} · ${name} · ${Difficulty}` or `Cartographer practice · ${name}`
export const postIsland = (deps: Deps, entry: ScheduleEntry): Promise<{ postId: string; commentId: string | undefined }>;
export const postToday = (deps: Deps): Promise<{ status: 'posted' | 'already' | 'missing'; postId?: string; date: string }>;
export const postPractice = (deps: Deps): Promise<{ postId: string }>;  // picks index from a counter key 'practice:next'

// services/streaks.ts
export type StreakState = { current: number; best: number; lastDate: string | null; cleanRun: number; total: number };
export type SolveEvent = { islandDate: string | null; postedAt: number; solvedAt: number; corrections: number };
export const isCounted = (e: SolveEvent): boolean;    // islandDate !== null && solvedAt - postedAt <= 24h
export const applySolve = (prev: StreakState, e: SolveEvent): StreakState;   // pure, spec 5.5
export const tierFor = (s: StreakState): Tier | null;
export const toStreakInfo = (s: StreakState, counted: boolean): StreakInfo;
export const readStreak = (deps: Deps, uid: string): Promise<StreakState>;
export const writeStreak = (deps: Deps, uid: string, s: StreakState): Promise<void>;

// services/flair.ts
export const TIER_LABEL: Record<Tier, string>;  // Deckhand, Navigator, Cartographer, Master Cartographer
export const flairTextFor = (info: StreakInfo): string | null;  // `${label} · ${current}d` + ' ✦' when steadyHand; null when tier null
export const ensureFlairTemplates = (deps: Deps): Promise<Record<Tier, string>>;
export const applyFlair = (deps: Deps, uid: string, username: string, info: StreakInfo): Promise<'set' | 'skipped' | 'disabled'>;

// app.ts
export const createApp = (deps: Deps): Hono;
```

`postIsland` sequence: title + postData + textFallback (`"Cartographer is a daily island deduction game. Open this post in the Reddit app or on new Reddit to play."`) + `flairText: 'Daily Island'`; on throw, retry once without `flairText`; then `saveSnapshot` with `postedAt = deps.now()`; then try `submitComment({ id: postId, text: RESULTS_HEADER, runAs: 'APP' })` then `distinguish(true)` and `redis.set(keys.results(postId), comment.id)`; comment failures are logged and swallowed. `postToday`: `date = utcDate(now())`; if `exists(keys.posted(date))` -> `already`; entry missing -> `missing` (console.error); else `postIsland` then `set(keys.posted(date), postId)`.

Streak rule in `applySolve`: `total += 1`; if not counted, return with only `total` changed; if `islandDate === prev.lastDate` return unchanged except total (cannot happen, but safe); if `prev.lastDate` is the previous UTC day of `islandDate`, `current += 1`, else `current = 1`; `lastDate = islandDate`; `best = max`; `cleanRun = corrections === 0 ? cleanRun + 1 : 0`. Use `Date.UTC` arithmetic for "previous day".

`applyFlair`: return `disabled` when `settings.get<boolean>('flairEnabled') === false`; `null` text -> `skipped`; read `getCurrentUser()` then `getUserFlairBySubreddit(subredditName)`; if existing `flairText` is non-empty and differs from `redis.get(keys.flair(uid))` -> `skipped`; else `setUserFlair({ subredditName, username, flairTemplateId: templates[tier], text })`, `redis.set(keys.flair(uid), text)` -> `set`. Templates come from `ensureFlairTemplates`, which reads `hGetAll(keys.flairTemplates())`, lists existing templates by text, creates missing ones (colors: deckhand `#C8B49A`, navigator `#6FA8DC`, cartographer `#5B8C5A`, master `#B8860B`, textColor `dark`), stores IDs.

Internal routes (`routes/internal.ts`, mounted at `/internal`): `POST /cron/daily` -> `postToday` -> JSON `{ status }` 200 always; `POST /menu/post-today` -> `postToday`, respond `UiResponse` with `navigateTo` the post or `showToast` for already/missing; `POST /menu/post-practice` -> `postPractice` -> `navigateTo`; `POST /triggers/on-app-install` and `on-app-upgrade` -> `ensureFlairTemplates` -> `{}`; `POST /triggers/on-post-delete` -> read body `{ postId }` (the request's `postId` field; log the body shape on first playtest) -> `del` the post keys -> `{}`. Post URL for navigateTo: `https://www.reddit.com/r/${subredditName}/comments/${postId.replace('t3_', '')}`.

- [ ] **Step 1: Fakes.** Write `fakes.ts`: `FakeRedis` (Map-backed strings, hashes as `Map<string, Map<string,string>>`, zsets as `Map<string, Map<string, number>>` with `zRange` sorted by score then member, `zRank` by that order, `expire` recorded in `ttls`), `FakeReddit` (records every call in `calls: Array<{ method: string; args: unknown[] }>`, returns `{ id: 't3_1' }` style IDs with an incrementing counter, `distinguish` records sticky, configurable `snoovatars: Record<string,string>`, `flairTemplates: FlairTemplateLike[]`, `currentUser`, and a `failNextSubmitPost` flag), `FakeSettings` (Map), `makeDeps(overrides?)` returning `Deps` with `now` from a mutable `clock`, `ctx` from a mutable `ctxState`, and schedules from `puzzles/fixture.ts` (two dated entries `2026-12-01`, `2026-12-02` and one practice entry built by hand with valid unique puzzles; keep them small: 7 landmarks, 8 clues; validate them in a test with `countSolutions`).
- [ ] **Step 2: Streak tests** (`streaks.test.ts`): table-driven `applySolve` cases: first counted solve -> current 1, best 1; consecutive day -> 2; gap of two days -> 1; uncounted (late by 25 h) -> current unchanged, total +1; practice (`islandDate: null`) -> only total; clean run increments and resets; `tierFor` thresholds 1/3/7/30; `isCounted` boundary at exactly 24 h (counted) and 24 h + 1 ms (not).
- [ ] **Step 3:** Implement `streaks.ts`. Run tests. Green.
- [ ] **Step 4: Posting tests** (`posting.test.ts`): `postToday` fresh -> `posted`, snapshot saved with `postedAt`, `posted:<date>` set, comment submitted with `runAs: 'APP'` and sticky; second call -> `already` and no new post; date with no entry -> `missing`; `failNextSubmitPost` -> throws, `posted:<date>` NOT set, next call succeeds; `flairText` failure -> retried without flair; practice -> `number 0` title.
- [ ] **Step 5:** Implement `keys.ts`, `services/schedule.ts`, `services/snapshot.ts`, `services/posting.ts`. Green.
- [ ] **Step 6: Flair tests** (`flair.test.ts`): `ensureFlairTemplates` creates four templates once and reuses on second call; `applyFlair` sets when flair empty; skips when foreign flair present; sets when existing flair equals our last text; `disabled` when setting false; `flairTextFor` strings including the steady hand suffix.
- [ ] **Step 7:** Implement `flair.ts`. Green.
- [ ] **Step 8: Route tests** (`internal.test.ts`) through `createApp(deps).request('/internal/cron/daily', { method: 'POST', body: '{}' })` for cron fresh/already; menu post-today returns `navigateTo`; triggers call `ensureFlairTemplates`; post-delete removes keys.
- [ ] **Step 9:** Implement `routes/internal.ts`, `app.ts` (mount `/api` stub router from `routes/api.ts` exporting `export const api = new Hono()` with no routes yet, and `/internal`), and rewrite `index.ts`:
  ```ts
  import { Hono } from 'hono';
  import { serve } from '@hono/node-server';
  import { context, createServer, getServerPort, reddit, redis, settings } from '@devvit/web/server';
  import { createApp } from './app';
  import { loadSchedules } from './services/schedule';
  const { schedule, practice } = loadSchedules();
  const app: Hono = createApp({
    redis, reddit, settings,
    now: () => Date.now(),
    ctx: () => ({ userId: context.userId, username: context.username, postId: context.postId, subredditName: context.subredditName }),
    schedule, practice,
  });
  serve({ fetch: app.fetch, createServer, port: getServerPort() });
  ```
  If `redis`/`reddit` do not satisfy `RedisLike`/`RedditLike` structurally, adjust the interfaces (for example `zRange` option types) until `npm run test:types` passes without casts.
- [ ] **Step 10:** `npm run test:unit && npm run lint && npm run test:types && npm run build`. Report any interface adjustments.

---

### Task 5: Server API routes (progress, chart, stats, comments, reveal)

**Files:**
- Create: `src/server/services/progress.ts`, `src/server/services/stats.ts`, `src/server/services/chart.ts`, `src/server/services/comments.ts`, `src/server/services/snoovatar.ts`, tests beside each, `src/server/routes/api.test.ts`
- Modify: `src/server/routes/api.ts`

**Interfaces:**
```ts
// progress.ts
export type UserProgress = { startedAt: number | null; placements: Placement; history: string; corrections: number; solvedAt: number | null; elapsedMs: number | null; commented: boolean; subscribePromptSeen: boolean };
export const readProgress = (deps: Deps, postId: string, uid: string): Promise<UserProgress>;
export const ensureStarted = (deps: Deps, postId: string, uid: string): Promise<number>;   // hSetNX startedAt, expire, hIncrBy stats.started on first start; returns startedAt
export const savePlacements = (deps: Deps, postId: string, uid: string, req: PlaceRequest): Promise<void>;  // ignored when solvedAt set
export const statusOf = (p: UserProgress): PlayStatus;
// stats.ts
export const readStats = (deps: Deps, postId: string): Promise<Stats>;   // median from zRange over times excluding scores < 10000
export const recordTime = (deps: Deps, postId: string, uid: string, elapsedMs: number, clean: boolean): Promise<void>;
export const rankOf = (deps: Deps, postId: string, uid: string): Promise<{ rank: number; total: number }>;
// chart.ts
export type ChartOutcome = { kind: 'ok'; result: Result; stats: Stats } | { kind: 'invalid' } | { kind: 'mismatch' } | { kind: 'not-found' };
export const chart = (deps: Deps, postId: string, uid: string, username: string, req: ChartRequest): Promise<ChartOutcome>;
export const buildResult = (deps: Deps, postId: string, uid: string, p: UserProgress, snap: Snapshot): Promise<Result>;  // for GET routes when solved
// comments.ts
export const chartCardText = (opts: { number: number; name: string; history: string; elapsedMs: number; corrections: number; streakCurrent: number; practice: boolean }): string;
export const postChart = (deps: Deps, postId: string, uid: string): Promise<{ kind: 'ok'; commentId: string } | { kind: 'already' } | { kind: 'not-ready' }>;
// snoovatar.ts
export const resolveSnoovatar = (deps: Deps, uid: string, username: string): Promise<string | null>;  // cached in snoo:<uid>, '' for none
export const settlerCell = (uid: string, emptyCells: Cell[]): Cell;   // FNV-1a hash of uid modulo length
export const reveal = (deps: Deps, postId: string, me: string | undefined): Promise<RevealResponse>;
```

`chart()` sequence: `snap = loadSnapshot` (undefined -> not-found); `validatePlacement(snap, req.placements)` not ok -> invalid; `samePlacement(req.placements, snap.solution, snap.landmarks)` false, or `allCluesLit(toPuzzle(snap), req.placements)` false -> mismatch; `startedAt = ensureStarted`; `now = deps.now()`; `claimed = hSetNX(userKey, 'solvedAt', String(now))`; if `claimed === 0` -> return existing result via `buildResult`; else `elapsedMs = now - startedAt`; `hSet` elapsedMs, corrections, history, placements; `recordTime`; `zAdd settlers {member: uid, score: now}`; `resolveSnoovatar` (ignore failures); `event = { islandDate: snap.date, postedAt: snap.postedAt, solvedAt: now, corrections }`; `next = applySolve(readStreak, event)`; `writeStreak`; `info = toStreakInfo(next, isCounted(event))`; `if (isCounted(event)) await applyFlair(...)` wrapped in try/catch with `console.error`; `stats = readStats`; return ok.

`chartCardText`: line 1 `Cartographer #${number} · ${name}` (practice: `Cartographer practice · ${name}`); line 2 pins (`P` -> `📍`, `L` -> `↩`, first 24 symbols then `…` when longer) + two spaces + `m:ss`; line 3 omitted for practice, else `Clean chart` when corrections 0 and streakCurrent <= 1, else `${streakCurrent}-day streak`.

Routes (`routes/api.ts`, all read `deps.ctx()`; missing `postId` -> 400 `{ error: 'invalid' }`):
- `GET /cover`: snapshot (404 not-found) + stats + me (loggedIn false when no userId; else progress status and result when solved).
- `GET /game`: 401 `{ error: 'login' }` without userId; `ensureStarted`; return `GameResponse` with `toPuzzle(snap)` (never the solution), `tutorialSeen` from `hGet(keys.streak(uid), 'tutorialSeen') === '1'`.
- `POST /place`: 401 without user; body validated: `placements` object whose keys are in `snap.landmarks` and values `{r,c}` ints; `history` string matching `/^[PL]{0,200}$/`; `corrections` integer 0..999; else 400.
- `POST /chart`: 401 without user; map `ChartOutcome` to 200/400/409/404.
- `POST /comment`: 401 without user; `postChart` -> 200/409/400.
- `POST /subscribe`: 401 without user; `reddit.subscribeToCurrentSubreddit()`; `hSet subscribePromptSeen '1'`; 200.
- `POST /tutorial-seen`: `hSet(keys.streak(uid), { tutorialSeen: '1' })`; 200.
- `GET /reveal`: works logged out (`me` undefined).

- [ ] **Step 1:** Tests first for `progress`, `stats` (median: odd/even counts, exclusion under 10 s, null when empty; rank 1-based by score), `comments.chartCardText` (exact strings for the three line-3 variants and the truncation), `snoovatar.settlerCell` determinism and spread, `reveal` capping at 40 plus caller and `more` count, and `chart` (ok path with all side effects asserted on fakes; wrong placement -> mismatch; missing landmark -> invalid; double submit returns the same elapsedMs and does not double count; uncounted solve skips flair; practice island never touches streak fields other than total).
- [ ] **Step 2:** Implement services until green.
- [ ] **Step 3:** Route tests via `createApp(deps).request(...)` for every status code listed above, including 401s and the 400 body validation.
- [ ] **Step 4:** Implement `routes/api.ts`. `npm run test:unit && npm run lint && npm run test:types && npm run build`.

---

### Task 6: Client game (reducer, board, legend, clue sheet, hook, page)

**Files:**
- Create: `src/client/game/reducer.ts`, `src/client/game/reducer.test.ts`, `src/client/game/api.ts`, `src/client/game/useGame.ts`, `src/client/game/GamePage.tsx`, `src/client/game/components/IslandView.tsx`, `Board.tsx`, `Legend.tsx`, `ClueSheet.tsx`, `Header.tsx`, `ChartButton.tsx`, `src/client/game/components/ClueSheet.test.tsx`, `src/client/game/components/Legend.test.tsx`, `src/client/game/format.ts` (`formatElapsed(ms): 'm:ss'`)
- Modify: `src/client/game.tsx`, `src/client/game.html` (title "Cartographer"), `src/client/index.css` (theme tokens).
- Delete: `src/client/hooks/` if still present.
- Icons: import `Icon` from `src/client/icons/Icon.tsx` (placeholder exists; Task 8 replaces it in place with the same props `{ name: IconName; className?: string; title?: string }`).

**Interfaces:**
```ts
// reducer.ts
export type GameState = { selected: LandmarkId | null; placements: Placement; history: string; corrections: number };
export type GameAction = { type: 'select'; id: LandmarkId } | { type: 'tapCell'; cell: Cell } | { type: 'lift'; id: LandmarkId } | { type: 'hydrate'; placements: Placement; history: string; corrections: number };
export const initialState = (landmarks: LandmarkId[], placements?: Placement, history?: string, corrections?: number): GameState;  // selected = first unplaced landmark
export const reduce = (state: GameState, action: GameAction, puzzle: Pick<Puzzle, 'land' | 'landmarks'>): GameState;
export const landmarkAt = (placements: Placement, cell: Cell): LandmarkId | undefined;
export const nextUnplaced = (landmarks: LandmarkId[], placements: Placement, after?: LandmarkId): LandmarkId | null;
// api.ts
export const getGame = (): Promise<GameResponse | ApiError>;
export const postPlace = (req: PlaceRequest): Promise<void>;
export const postChart = (req: ChartRequest): Promise<ChartResponse | ApiError>;
export const postComment = (): Promise<{ ok: true; commentId: string } | ApiError>;
export const postSubscribe = (): Promise<void>;
export const postTutorialSeen = (): Promise<void>;
export const getReveal = (): Promise<RevealResponse>;
```

Reducer rules (spec 4.3): `tapCell` on water -> unchanged (the component shakes); on an occupied cell -> lift that landmark (it becomes `selected`, removed from placements, `history += 'L'`, `corrections += 1`; if another landmark was selected it simply returns to unselected-unplaced state, nothing else changes); on an empty land cell with a selection -> place it, `history += 'P'`, `selected = nextUnplaced(landmarks, placements, placed)` (wrap around; null when all placed); on empty land with no selection -> unchanged. `lift` action behaves like tapping that landmark's cell. `select` sets `selected` to that id only when it is unplaced.

Components:
- `IslandView({ land, placements, highlight?: LandmarkId[], settlers?: Settler[], onCellTap?: (cell) => void, shakeCell?: Cell | null, size?: 'board' | 'cover' })`: CSS grid 6x6 inside a water-colored frame with 6 px margin; water cells `bg-water`, land cells `bg-sand` with a 1 px `border-land`; a placed landmark renders `<Icon name=...>` centered; tap targets are the whole cell (min 44 px on the board size). Buttons have `aria-label` like `"row 2 column 3, land, empty"`.
- `Board` wraps `IslandView` with the tap wiring and the shake state (set on water tap, cleared after 300 ms, no animation under `prefers-reduced-motion`).
- `Legend({ landmarks, placements, selected, onSelect, onLift })`: one chip per landmark: `<button>` 44x44 with the `Icon`; placed chips get `grayscale opacity-60` and a check badge and tapping them calls `onLift`; the selected chip has a 2 px ring; the selected landmark's name is shown below the strip.
- `ClueSheet({ clues, states, highlighted, onTapClue })`: a list; each row shows the state glyph (`○` hollow circle for pending, `✓` green for lit, `!` amber for contradicted, each with `aria-label`) and the sentence via `clueParts` with inline `<Icon>` before each landmark name; row highlighted when `highlighted` includes a named landmark.
- `Header({ name, startedAt, serverNow, corrections, solved })`: timer `m:ss` ticking from `startedAt` using the server offset (`Date.now() - (serverNow - startedAt)` baseline) and frozen when solved.
- `ChartButton({ visible, onChart, busy })`: fixed to the bottom on portrait, slides in with `transition-transform` (no motion under reduced motion).
- `GamePage`: loads via `useGame`; layout `flex-col` on portrait, `lg:flex-row` with the board left and a sidebar right; handles `error: 'login'` by rendering a button that calls `showLoginPrompt()` from `@devvit/web/client`; shows a loading skeleton; renders `ResultScreen` (Task 7; until it exists, render a simple "Charted" panel component `ResultPlaceholder` in `GamePage.tsx` that Task 7 replaces).
- `useGame`: `getGame()` on mount; keeps `GameState` via `useReducer` with the puzzle; saves with `postPlace` debounced 400 ms after each change (and immediately before chart); `chart()` posts and stores the `ChartResponse`; a `clueStates` memo from `evaluateClue`; `canChart` when all placed and all lit.

- [ ] **Step 1: Reducer tests** (`reducer.test.ts`) using the Task 1 fixture mask literal: select then tap land places and auto-advances; tap water unchanged; tap occupied lifts with `L` and corrections; wrap-around of `nextUnplaced`; placing the last landmark sets `selected` null; `hydrate` restores; `select` on a placed landmark is ignored.
- [ ] **Step 2:** Implement `reducer.ts`. Green.
- [ ] **Step 3: Component tests**: `ClueSheet` renders the three glyphs with their aria-labels for a states array; `Legend` marks placed chips with `aria-pressed` / check and calls `onLift` when a placed chip is tapped and `onSelect` otherwise.
- [ ] **Step 4:** Implement components, `format.ts`, `api.ts`, `useGame.ts`, `GamePage.tsx`, `game.tsx`. Theme tokens in `index.css` under `@theme` (Tailwind 4): `--color-water: #7FB3D5`, `--color-water-deep: #5B93BA`, `--color-sand: #F1E3C3`, `--color-land: #D8C39A`, `--color-ink: #2B2A28`, `--color-lit: #2E8B57`, `--color-warn: #D98E04`, plus dark variants via `@media (prefers-color-scheme: dark)` overriding `--color-sand: #CDB889`, `--color-ink: #F3EFE6`, background `#1B2733`.
- [ ] **Step 5:** `npm run test:unit && npm run lint && npm run test:types && npm run build`. Confirm `dist/client/game.html` exists.

---

### Task 7: Result screen, reveal, tutorial, and the inline cover

**Files:**
- Create: `src/client/game/ResultScreen.tsx`, `src/client/game/ResultScreen.test.tsx`, `src/client/game/Tutorial.tsx`, `src/client/game/useReveal.ts`, `src/client/cover/Cover.tsx`, `src/client/cover/cover.test.tsx`
- Modify: `src/client/splash.tsx`, `src/client/splash.html` (title "Cartographer"), `src/client/game/GamePage.tsx` (swap the placeholder for `ResultScreen`, mount `Tutorial` when `tutorialSeen` is false).

**Interfaces:**
- Consumes: `IslandView`, `Icon`, `formatElapsed`, `api.ts` wrappers, `showShareSheet`, `navigateTo`, `requestExpandedMode`, `context` from `@devvit/web/client`.
- `ResultScreen({ puzzle, placements, result, stats, settlers, onComment, onShare, onSubscribe, onResults, revealDone })`.
- `Cover()`: reads `context.postData` typed as `IslandPostData` by validating fields at runtime (a `parsePostData(unknown): IslandPostData | null` helper with tests, no casts), renders number, name, difficulty label, landmark count, `IslandView size="cover"`, and the button `Chart this island` -> `requestExpandedMode(e.nativeEvent, 'game')`. After paint, fetches `/api/cover`; when `me.status === 'solved'` shows the stamped result (time, corrections, rank) and the settlers from `/api/reveal` statically.

Result screen content (spec 4.4): island with placements, a rotated "CHARTED" stamp, `formatElapsed(elapsedMs)`, corrections, stats line `"{charted} charted · {cleanPct}% clean · median {m:ss}"` (median omitted when null), rank `"#{rank} of {total}"`, streak line with tier label and steady hand badge, buttons: `Post my chart` (disabled with "Posted" after success or when `result.commented`), `Share` -> `showShareSheet({ text: card })` where the client rebuilds the card with the same rules as the server (`chartCardText` duplicate lives in `src/shared/card.ts`; move the server's implementation there and import it from both sides; this is the one cross-task edit allowed, coordinate by leaving `src/server/services/comments.ts` importing from shared), `Join for tomorrow's island` (hidden when `subscribePromptSeen`), `Results thread` -> `navigateTo` the post URL (`https://www.reddit.com/comments/${postId.replace('t3_','')}`).

Reveal animation: `useReveal` fetches `/api/reveal` once; `IslandView` renders settlers as 20 px round `<img src={snoovatar}>` (or the `tent` icon) absolutely positioned inside their cell, up to three per cell with offsets, with a `settle` keyframe (translateY from -24 px, 320 ms, staggered 60 ms, your own first and 28 px); no animation under `prefers-reduced-motion`.

Tutorial: a three-step overlay (Pick an icon / Tap the island / Light every clue) with Next and Skip; on dismiss calls `postTutorialSeen()`.

- [ ] **Step 1:** Tests: `parsePostData` accepts a valid object and rejects a missing `land`; `ResultScreen` renders time, rank, stats, and disables the comment button after `onComment` resolves; the share button calls the provided `onShare`.
- [ ] **Step 2:** Implement all files. Move `chartCardText` to `src/shared/card.ts` with its test, and update the server import.
- [ ] **Step 3:** `npm run test:unit && npm run lint && npm run test:types && npm run build`. Confirm `dist/client/splash.html` is under 60 KB of JS (check the built asset sizes and report them).

---

### Task 8: Icon sprite and attribution

**Files:**
- Create: `src/client/icons/Sprite.tsx`, `src/client/icons/icons.json` (name -> `{ path: string; author: string; source: string }`), `tools/icons/README.md` (how the set was built), `ATTRIBUTION.md`
- Modify: `src/client/icons/Icon.tsx` (replace the placeholder, keep the props)

**Interfaces:**
- Produces: `Sprite` component rendering `<svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>` with one `<symbol id="ic-<name>" viewBox="0 0 512 512">` per icon; `Icon` renders `<svg className=...><use href="#ic-<name>" /></svg>` with `fill="currentColor"` and `role="img"`. Names: the 14 `LandmarkId`s plus `tent`.

Source: game-icons.net (CC BY 3.0). Download the transparent-background SVG archive `https://game-icons.net/archives/svg/zip/000000/transparent/game-icons.net.svg.zip` into a fresh empty directory in the scratchpad, unzip there, and pick one file per name. Suggested picks (verify each exists; substitute the closest if not): lighthouse `delapouite/lighthouse`, windmill `delapouite/windmill`, harbor `lorc/anchor`, fort `delapouite/castle` (or `lorc/tower-fall` fallback), temple `delapouite/greek-temple`, well `delapouite/well`, cave `delapouite/cave-entrance`, shipwreck `delapouite/shipwreck` (or `lorc/sinking-ship`), farm `delapouite/barn`, watchtower `delapouite/watchtower`, camp `delapouite/camping-tent`, mine `delapouite/mine-wagon` (or `lorc/mining`), ruins `delapouite/ancient-ruins`, beacon `lorc/bonfire` (or `delapouite/fire-signal`), tent `delapouite/tent`. Extract only the `<path d="...">` data from each file (these SVGs are a single path on a 512 viewBox), keep author names, and write `icons.json`. Do not commit the archive.

- [ ] **Step 1:** Download and unzip in the scratchpad; list the candidate files; choose; record choices in `icons.json`.
- [ ] **Step 2:** Write `Sprite.tsx` generated from `icons.json` at build time? No: generate it once with a small script (`tools/icons/build-sprite.ts`, run via `npx tsx`) that writes `Sprite.tsx`, so the TSX is committed and the client build stays simple. Keep the script in the repo.
- [ ] **Step 3:** Replace `Icon.tsx`. Write `ATTRIBUTION.md` listing every icon with its author and the CC BY 3.0 link (`https://creativecommons.org/licenses/by/3.0/`) and the game-icons.net URL. Add the same block to the README's Credits section later (Task 9 does the README; include the exact block in your report).
- [ ] **Step 4:** `npm run lint && npm run test:types && npm run build`. Report the sprite size in KB.

---

### Task 9: Wiring, README, and submission assets

**Files:**
- Modify: `README.md`, `src/client/game.tsx` and `splash.tsx` (mount `<Sprite />` once at the root), `.github/workflows/ci.yaml` (keep as is but ensure `npm run test:unit` is Vitest), `devvit.json` only if a build error demands it.
- Create: `docs/submission.md` (Devpost text draft: inspiration, what it does, how it is built, challenges, what is next; Reddity paragraph; the four rubric criteria addressed in order), `docs/playtest-checklist.md` (the eight day-one checks from spec section 8 plus the mobile checks).

- [ ] **Step 1:** README sections: What it is (two sentences and a screenshot placeholder path `docs/screenshots/cover.png`), How to play, Daily content (generator, schedule depth, `npm run gen`, `gen:review`, `gen:verify`, how uniqueness and fairness are guaranteed), Reddit features (flair tiers, results thread, snoovatar reveal, share), Architecture (one paragraph per layer, the Redis key table), Development (`npm install`, `npm run dev` needs `devvit login`, test commands), Moderator guide (menu items, the flair setting, cron time), Credits (icon attribution block from Task 8), License.
- [ ] **Step 2:** Write `docs/submission.md` and `docs/playtest-checklist.md`.
- [ ] **Step 3:** Full gate: `npm run test:unit && npm run lint && npm run test:types && npm run build`. Report bundle sizes for `dist/client/*.js` and `dist/server/index.cjs`.

---

### Task 10: Integration review and polish pass

- [ ] **Step 1:** Read every `src/**` file once as a reviewer: spec conformance (section by section), unhandled promises, missing 401/400 paths, any `as` casts, any client import of `solution`, any string that could become free text in a comment.
- [ ] **Step 2:** Fix findings with tests. Run the full gate.
- [ ] **Step 3:** Write `docs/review-notes.md` with what was found and fixed and what remains for live playtest.

## Self-Review

Spec coverage: 2.x -> Tasks 1, 2 (predicates/templates/solvers); 3.x -> Task 3; 4.x -> Tasks 6, 7, 8; 5.x -> Tasks 4, 5; 6 -> tests inside every task; 7 -> Task 9. Placeholder scan: none. Type consistency: `Deps`, `Snapshot`, `UserProgress`, `GameState`, `Icon` props are defined once and referenced by name elsewhere.
