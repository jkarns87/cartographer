/**
 * Step 2 of the icon pipeline: render src/client/icons/icons.json into the committed
 * src/client/icons/Sprite.tsx. Output is deterministic (symbols sorted by name), so
 * re-running on an unchanged icons.json produces an identical file.
 *
 *   npx tsx tools/icons/build-sprite.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseIcons, renderSprite } from './sprite';

const ICONS_JSON = fileURLToPath(
  new URL('../../src/client/icons/icons.json', import.meta.url)
);
const SPRITE_TSX = fileURLToPath(
  new URL('../../src/client/icons/Sprite.tsx', import.meta.url)
);

const main = (): void => {
  const raw: unknown = JSON.parse(readFileSync(ICONS_JSON, 'utf8'));
  const icons = parseIcons(raw, ICONS_JSON);
  const tsx = renderSprite(icons);
  writeFileSync(SPRITE_TSX, tsx);
  console.log(
    `wrote ${SPRITE_TSX} (${icons.size} symbols, ${(tsx.length / 1024).toFixed(1)} KB)`
  );
};

main();
