# AGENTS.md

Cartographer is a Devvit Web daily island-deduction game for Reddit: React 19 + Tailwind 4 client,
Hono server on `@devvit/web` 0.15.4, Redis, and an offline puzzle generator. Node 24 (`.nvmrc`).

## Never publish before 2026-12-17

Do not run `devvit publish` (or anything that submits the app for review) before judging ends on
2026-12-17. `npm run launch` is deliberately blocked. `devvit upload` and `devvit playtest` are fine.

## Where things are

- Spec: `docs/superpowers/specs/2026-11-22-cartographer-design.md`
- Plan: `docs/superpowers/plans/2026-11-22-cartographer.md`
- Review notes and after-playtest items: `docs/review-notes.md`
- Devvit docs: https://developers.reddit.com/docs/llms.txt

## Layout

- `src/shared/`: code shared by client, server and generator. `puzzle/` (types, grid math, clue
  predicates, clue templates, both solvers), `api.ts` (request/response types), `card.ts` (the
  Post my chart card and `cardTime`), `tiers.ts` (tier labels).
- `src/server/`: Hono app. `index.ts` wires the real Devvit clients into `createApp(deps)`
  (`app.ts`). Services take a `Deps` object (`deps.ts`); never import `redis`, `reddit` or
  `context` from `@devvit/web/server` outside `index.ts`. `routes/api.ts` is the client API,
  `routes/internal.ts` the cron, menu and triggers. `puzzles/*.json` are generated.
- `src/client/`: two entries, `splash.html` (inline cover, keep it light) and `game.html` (the
  board, expanded mode). `icons/Sprite.tsx` and `icons/icons.json` are generated.
- `tools/gen/`: offline generator (`generate.ts`), review printer, verifier. Never runs in Devvit.
- `tools/icons/`: icon extraction and sprite builder (see its README).

## Scripts

| Script               | What it does                                             |
| -------------------- | -------------------------------------------------------- |
| `npm run test:unit`  | Vitest, node and jsdom projects (`vitest.config.ts`)     |
| `npm run test:watch` | Vitest in watch mode                                     |
| `npm run test:types` | `tsc --build` over every tsconfig                        |
| `npm run lint`       | ESLint over `src` and `tools`                            |
| `npm run build`      | Vite build of client and server into `dist/`             |
| `npm run gen`        | Regenerate `src/server/puzzles/*.json` from the seed     |
| `npm run gen:review` | Print every clue sheet for a human read-through          |
| `npm run gen:verify` | Re-solve and check both puzzle files; non-zero on errors |
| `npm run dev`        | `devvit playtest`                                        |
| `npm run deploy`     | types + lint, then `devvit upload`                       |
| `npm run login`      | `devvit login`                                           |

The full gate before handing work back: `test:unit`, `lint`, `test:types`, `build`, `gen:verify`.

## Code rules

- Type aliases, not interfaces. Named exports, not default exports.
- Never cast with `as` (an `as const` literal is fine). Narrow with type guards instead.
- `@typescript-eslint/no-floating-promises` is an error: `await` or `void` every promise.
- Follow the React hooks rules (enforced by `eslint-plugin-react-hooks`).
- Server tests use the in-memory fakes in `src/server/fakes.ts` via `makeDeps()`; no module mocks.
- Client API types live in `src/shared/api.ts`. No response may ever carry a puzzle solution.
- Devvit Web only: ignore any `@devvit/public-api` or blocks examples. Use `navigateTo`,
  `showToast` and friends from `@devvit/web/client` instead of `window.location` or `alert`.
- A new menu item or trigger endpoint also needs its mapping in `devvit.json`.
