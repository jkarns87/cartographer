/**
 * Step 1 of the icon pipeline: copy path data out of the game-icons.net SVG archive
 * into src/client/icons/icons.json.
 *
 *   npx tsx tools/icons/extract.ts <unzipped-archive>/icons/000000/transparent/1x1
 *
 * The archive is untrusted input. This script only reads the files named in PICKS as
 * text and copies their `d` attributes; nothing in the archive is executed or imported.
 * See tools/icons/README.md for the full procedure.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_NAMES, PATH_DATA } from './names';
import type { IconEntry, IconName } from './names';

type AuthorSlug = 'delapouite' | 'lorc';

/** Author slug (archive folder and URL segment) -> credit name from the archive's license.txt. */
const AUTHORS: Record<AuthorSlug, string> = {
  delapouite: 'Delapouite',
  lorc: 'Lorc',
};

type Pick = { author: AuthorSlug; file: string };

/** Chosen for a bold silhouette that still reads at 28 px. */
const PICKS: Record<IconName, Pick> = {
  lighthouse: { author: 'delapouite', file: 'lighthouse' },
  windmill: { author: 'delapouite', file: 'windmill' },
  harbor: { author: 'lorc', file: 'anchor' },
  fort: { author: 'delapouite', file: 'castle' },
  temple: { author: 'delapouite', file: 'greek-temple' },
  well: { author: 'delapouite', file: 'well' },
  cave: { author: 'delapouite', file: 'cave-entrance' },
  shipwreck: { author: 'delapouite', file: 'ship-wreck' },
  farm: { author: 'delapouite', file: 'barn' },
  watchtower: { author: 'delapouite', file: 'watchtower' },
  camp: { author: 'delapouite', file: 'camping-tent' },
  mine: { author: 'delapouite', file: 'mine-wagon' },
  ruins: { author: 'delapouite', file: 'ancient-ruins' },
  beacon: { author: 'lorc', file: 'fire-bowl' },
  tent: { author: 'delapouite', file: 'tipi' },
};

const OUT = fileURLToPath(
  new URL('../../src/client/icons/icons.json', import.meta.url)
);

const extractPath = (svg: string, label: string): string => {
  if (!svg.includes('viewBox="0 0 512 512"')) {
    throw new Error(`${label}: expected a 512x512 viewBox`);
  }
  const parts = [...svg.matchAll(/\sd="([^"]*)"/g)].map((m) =>
    (m[1] ?? '').trim()
  );
  const d = parts.filter((p) => p.length > 0).join(' ');
  if (d.length === 0) throw new Error(`${label}: no <path d="..."> found`);
  if (!PATH_DATA.test(d))
    throw new Error(`${label}: unexpected characters in path data`);
  return d;
};

const main = (argv: readonly string[]): void => {
  const root = argv[0];
  if (root === undefined) {
    throw new Error(
      'usage: npx tsx tools/icons/extract.ts <archive>/icons/000000/transparent/1x1'
    );
  }
  const base = resolve(root);
  const icons: Partial<Record<IconName, IconEntry>> = {};
  for (const name of ICON_NAMES) {
    const { author, file } = PICKS[name];
    const svgFile = join(base, author, `${file}.svg`);
    icons[name] = {
      path: extractPath(readFileSync(svgFile, 'utf8'), `${author}/${file}.svg`),
      author: AUTHORS[author],
      source: `https://game-icons.net/1x1/${author}/${file}.html`,
    };
  }
  writeFileSync(OUT, `${JSON.stringify(icons, null, 2)}\n`);
  console.log(`wrote ${OUT} (${ICON_NAMES.length} icons)`);
};

main(process.argv.slice(2));
