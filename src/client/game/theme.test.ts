/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Read the stylesheet directly: Vitest empties any `.css` import (even `?raw`)
// under its default `css: false`, and jsdom's URL class trips fileURLToPath.
const css = readFileSync(join(import.meta.dirname, '../index.css'), 'utf8');

/**
 * Guards the palette against the dark-mode contrast regression found in
 * review: tokens are parsed straight from index.css and checked with the WCAG
 * 2.x relative-luminance formula in both color schemes.
 */

const themeStart = css.indexOf('@theme {');
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const baseStart = css.indexOf('@layer base');
const THEME = css.slice(themeStart, darkStart);
const DARK = css.slice(darkStart, baseStart);

const token = (block: string, name: string): string | undefined =>
  new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block)?.[1];

const light = (name: string): string => {
  const v = token(THEME, name);
  if (!v) throw new Error(`missing light token --color-${name}`);
  return v;
};
const dark = (name: string): string => token(DARK, name) ?? light(name);

const channel = (hex: string, i: number): number => {
  const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number =>
  0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

type Pair = { fg: string; bg: string; what: string };
const pairs = (mode: (name: string) => string): Pair[] => [
  { fg: mode('lit-text'), bg: mode('sheet'), what: 'lit glyph on clue sheet' },
  { fg: mode('warn-text'), bg: mode('sheet'), what: 'contradicted glyph on clue sheet' },
  { fg: mode('muted'), bg: mode('sheet'), what: 'pending glyph on clue sheet' },
  { fg: mode('ink'), bg: mode('sheet'), what: 'clue sentence on clue sheet' },
  { fg: mode('ink-on-sand'), bg: mode('sand'), what: 'board and legend icons on sand' },
  { fg: mode('muted'), bg: mode('paper'), what: 'secondary text on paper' },
  { fg: mode('ink'), bg: mode('paper'), what: 'body text on paper' },
  { fg: '#ffffff', bg: mode('lit'), what: 'white on lit fill (chart button, check badge)' },
];

describe('theme tokens', () => {
  it('keeps content on sand dark in both modes', () => {
    expect(light('ink-on-sand')).toBe('#2b2a28');
    expect(token(DARK, 'ink-on-sand')).toBeUndefined();
  });

  it('overrides the clue-sheet surface and its glyph colors for dark mode', () => {
    for (const name of ['sheet', 'lit-text', 'warn-text', 'muted']) {
      expect(token(DARK, name), name).toBeDefined();
      expect(token(DARK, name)).not.toBe(light(name));
    }
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ])('meets 4.5:1 for glyphs and text on every surface (%s)', (_mode, resolve) => {
    for (const { fg, bg, what } of pairs(resolve)) {
      expect(contrast(fg, bg), `${what}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('settle keyframes', () => {
  const keyframes = (name: string): string => {
    const m = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n  \\}`).exec(css);
    if (!m?.[1]) throw new Error(`missing @keyframes ${name}`);
    return m[1];
  };

  it('animate only the vertical drop and leave centring to the translate utilities', () => {
    const settle = keyframes('settle');
    const me = keyframes('settle-me');
    expect(settle).toContain('translateY(-24px)');
    expect(me).toContain('translateY(-28px)');
    for (const body of [settle, me]) {
      expect(body).not.toContain('-50%');
      expect(body).not.toMatch(/translate\(/);
      expect(body).toMatch(/to \{[^}]*transform: none/);
    }
  });
});
