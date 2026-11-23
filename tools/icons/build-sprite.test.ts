import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from './names';
import { parseIcons, renderSprite } from './sprite';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('icons.json', () => {
  const raw: unknown = JSON.parse(read('../../src/client/icons/icons.json'));
  const icons = parseIcons(raw);

  it('has exactly one entry per LandmarkId plus tent', () => {
    expect([...icons.keys()].sort()).toEqual([...ICON_NAMES].sort());
  });

  it('points every entry at a game-icons.net page', () => {
    for (const [name, entry] of icons) {
      expect(entry.source, name).toMatch(
        /^https:\/\/game-icons\.net\/1x1\/[a-z-]+\/[a-z0-9-]+\.html$/
      );
      expect(entry.author, name).not.toBe('');
      expect(entry.path.length, name).toBeGreaterThan(50);
    }
  });
});

describe('parseIcons', () => {
  const valid = Object.fromEntries(
    ICON_NAMES.map((name) => [
      name,
      { path: 'M0 0h1v1z', author: 'A', source: 'https://x' },
    ])
  );

  it('rejects a missing icon', () => {
    const rest = Object.fromEntries(
      Object.entries(valid).filter(([k]) => k !== 'tent')
    );
    expect(() => parseIcons(rest)).toThrow(/missing entry for "tent"/);
  });

  it('rejects an unknown icon', () => {
    expect(() => parseIcons({ ...valid, dragon: valid.tent })).toThrow(
      /"dragon" is not/
    );
  });

  it('rejects path data that could escape a JSX attribute', () => {
    const bad = { ...valid, tent: { ...valid.tent, path: 'M0 0" /><script>' } };
    expect(() => parseIcons(bad)).toThrow(/unexpected characters/);
  });
});

describe('Sprite.tsx', () => {
  it('matches what build-sprite.ts would generate from icons.json (run npx tsx tools/icons/build-sprite.ts if not)', () => {
    const raw: unknown = JSON.parse(read('../../src/client/icons/icons.json'));
    const expected = renderSprite(parseIcons(raw));
    expect(read('../../src/client/icons/Sprite.tsx')).toBe(expected);
  });

  it('stays under 60 KB', () => {
    expect(read('../../src/client/icons/Sprite.tsx').length).toBeLessThan(
      60 * 1024
    );
  });
});
