# Icon pipeline

The client draws every landmark (and the settler's tent) from one inline SVG sprite,
`src/client/icons/Sprite.tsx`, which is generated from `src/client/icons/icons.json`.
Both files are committed; nothing here runs during `npm run build`.

Source: [game-icons.net](https://game-icons.net/), CC BY 3.0. Credits per icon are in
`/ATTRIBUTION.md`; `icons.json` records the same author and source URL next to each path.

## Files

| File                   | Role                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `names.ts`             | `ICON_NAMES` (the 14 `LandmarkId`s + `tent`), shared types, validators   |
| `extract.ts`           | Step 1: copies path data from the downloaded archive into `icons.json`   |
| `sprite.ts`            | Pure parse/render functions used by the builder and its test             |
| `build-sprite.ts`      | Step 2: renders `icons.json` into `Sprite.tsx`                           |
| `build-sprite.test.ts` | Guards: 15 entries, valid paths, committed sprite is up to date, < 60 KB |

## Rebuilding the set

1. Download the transparent-background archive into a fresh, empty directory outside the
   repo (it is about 4 MB and must not be committed):

   ```sh
   mkdir -p /tmp/game-icons && cd /tmp/game-icons
   curl -sSLO https://game-icons.net/archives/svg/zip/000000/transparent/game-icons.net.svg.zip
   unzip -q game-icons.net.svg.zip
   ```

   Treat the contents as untrusted data: only read the SVG files; never execute or import
   anything from the archive.

2. Choose files. The picks live in the `PICKS` table in `extract.ts` as
   `{ author: '<folder>', file: '<name>' }`, mapping to
   `icons/000000/transparent/1x1/<folder>/<name>.svg` in the archive. Prefer bold
   silhouettes with no fine detail; the glyphs render at about 28 px on the board. Check a
   candidate with `rsvg-convert -w 28` or any SVG viewer before committing to it.

3. Extract the path data (each game-icons SVG is a 512x512 viewBox with `<path>` elements;
   the script joins every `d` attribute and rejects anything that is not plain path data):

   ```sh
   npx tsx tools/icons/extract.ts /tmp/game-icons/icons/000000/transparent/1x1
   ```

4. Render the sprite:

   ```sh
   npx tsx tools/icons/build-sprite.ts
   ```

   Output is deterministic: symbols are sorted by name and the file is already in
   Prettier style, so re-running on an unchanged `icons.json` is a no-op.

5. Update `/ATTRIBUTION.md` and the README credits block for any pick that changed, then
   run `npm run test:unit` (the sprite test fails if `Sprite.tsx` is stale).

## Adding a landmark

Add it to `LANDMARKS` in `src/shared/puzzle/types.ts`, add a pick to `PICKS` in
`extract.ts`, then run steps 1, 3 and 4. `parseIcons` refuses an `icons.json` that is
missing a name or carries an unknown one, so a forgotten pick fails loudly.

## Rendering

- `Sprite` renders `<svg width="0" height="0" aria-hidden="true">` with one
  `<symbol id="ic-<name>" viewBox="0 0 512 512">` per icon. Mount it once per entry point
  that renders icons (it carries no visual size).
- `Icon` renders `<svg role="img" fill="currentColor"><use href="#ic-<name>" /></svg>`.
  Size it with a class (`h-7 w-7`); it inherits text color.
