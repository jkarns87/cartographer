# Attribution

## Icons

The landmark and settler icons in `src/client/icons/` are from
[game-icons.net](https://game-icons.net/) and are licensed under
[Creative Commons Attribution 3.0 Unported (CC BY 3.0)](https://creativecommons.org/licenses/by/3.0/).
Icons made by [Delapouite](https://delapouite.com) and [Lorc](http://lorcblog.blogspot.com).

Modifications: the originals are black-on-transparent 512x512 SVGs. Only the `<path>`
data was copied, unchanged, into an inline sprite (`src/client/icons/Sprite.tsx`,
generated from `src/client/icons/icons.json` by `tools/icons/build-sprite.ts`), and each
glyph is recolored at render time with `fill="currentColor"`. No shapes were edited.

| Icon (in game)   | Source file                    | Author     | Link                                                     |
| ---------------- | ------------------------------ | ---------- | -------------------------------------------------------- |
| Lighthouse       | `delapouite/lighthouse.svg`    | Delapouite | https://game-icons.net/1x1/delapouite/lighthouse.html    |
| Windmill         | `delapouite/windmill.svg`      | Delapouite | https://game-icons.net/1x1/delapouite/windmill.html      |
| Harbor           | `lorc/anchor.svg`              | Lorc       | https://game-icons.net/1x1/lorc/anchor.html              |
| Fort             | `delapouite/castle.svg`        | Delapouite | https://game-icons.net/1x1/delapouite/castle.html        |
| Temple           | `delapouite/greek-temple.svg`  | Delapouite | https://game-icons.net/1x1/delapouite/greek-temple.html  |
| Well             | `delapouite/well.svg`          | Delapouite | https://game-icons.net/1x1/delapouite/well.html          |
| Cave             | `delapouite/cave-entrance.svg` | Delapouite | https://game-icons.net/1x1/delapouite/cave-entrance.html |
| Shipwreck        | `delapouite/ship-wreck.svg`    | Delapouite | https://game-icons.net/1x1/delapouite/ship-wreck.html    |
| Farm             | `delapouite/barn.svg`          | Delapouite | https://game-icons.net/1x1/delapouite/barn.html          |
| Watchtower       | `delapouite/watchtower.svg`    | Delapouite | https://game-icons.net/1x1/delapouite/watchtower.html    |
| Camp             | `delapouite/camping-tent.svg`  | Delapouite | https://game-icons.net/1x1/delapouite/camping-tent.html  |
| Mine             | `delapouite/mine-wagon.svg`    | Delapouite | https://game-icons.net/1x1/delapouite/mine-wagon.html    |
| Ruin             | `delapouite/ancient-ruins.svg` | Delapouite | https://game-icons.net/1x1/delapouite/ancient-ruins.html |
| Beacon           | `lorc/fire-bowl.svg`           | Lorc       | https://game-icons.net/1x1/lorc/fire-bowl.html           |
| Settler (`tent`) | `delapouite/tipi.svg`          | Delapouite | https://game-icons.net/1x1/delapouite/tipi.html          |

Source files are named as they appear in the game-icons.net SVG archive
(`icons/000000/transparent/1x1/<author>/<name>.svg`). How the set was built is documented
in `tools/icons/README.md`.

## Brand assets

The subreddit icon and banners in `docs/brand/` (built by `tools/brand/build.py`) reuse four of
the glyphs above unchanged apart from color and scale: Lighthouse, Fort (`castle`), Windmill and
Temple (`greek-temple`), all by Delapouite, CC BY 3.0. Everything else in those images (the
island, grid, compass, clue sheet and type) is original to this project. A credit line for the
subreddit sidebar or wiki:

> Landmark icons by Delapouite via game-icons.net, CC BY 3.0.
