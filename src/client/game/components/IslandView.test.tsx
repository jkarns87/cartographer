import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Settler } from '../../../shared/api';
import { maskFromRows } from '../../../shared/puzzle/grid';
import { IslandView } from './IslandView';

const LAND = maskFromRows(['......', '.####.', '.####.', '.####.', '.####.', '......']);

const settler = (over: Partial<Settler> = {}): Settler => ({
  userId: 't2_me',
  snoovatar: 'https://i.redd.it/me.png',
  cell: { r: 1, c: 1 },
  isMe: true,
  ...over,
});

const glyphIn = (el: Element | null): string | null | undefined =>
  el?.querySelector('use')?.getAttribute('href');

describe('IslandView layout', () => {
  it('keeps the aspect ratio on the grid itself so Safari sizes the rows', () => {
    render(<IslandView land={LAND} placements={{}} onCellTap={() => {}} />);
    const frame = screen.getByRole('group', { name: 'Island' });
    expect(frame.className).not.toMatch(/aspect-square/);
    const grid = frame.querySelector('.grid');
    expect(grid?.className).toMatch(/aspect-square/);
    expect(grid?.className).not.toMatch(/\bh-full\b/);
  });

  it('draws the compass rose in the corner with the most water', () => {
    const { container } = render(<IslandView land={LAND} placements={{}} />);
    expect(container.querySelector('[data-compass="se"]')).not.toBeNull();
  });

  it('rings the cells a hint points at', () => {
    render(
      <IslandView
        land={LAND}
        placements={{}}
        onCellTap={() => {}}
        highlightCells={[{ r: 1, c: 1 }, { r: 2, c: 2 }]}
      />
    );
    const hinted = document.querySelectorAll('[data-hint="true"]');
    expect(hinted).toHaveLength(2);
    expect(hinted[0]?.className).toMatch(/ring-warn/);
    expect(screen.getByRole('button', { name: 'row 2 column 2, land, empty' })).toHaveAttribute('data-hint', 'true');
  });
});

describe('IslandView settlers', () => {
  it('shows the snoovatar eagerly (no lazy loading)', () => {
    render(<IslandView land={LAND} placements={{}} settlers={[settler()]} />);
    const img = screen.getByAltText('Your avatar');
    expect(img).toHaveAttribute('src', 'https://i.redd.it/me.png');
    expect(img).not.toHaveAttribute('loading');
  });

  it('swaps a snoovatar that fails to load for the tent icon', () => {
    render(
      <IslandView
        land={LAND}
        placements={{}}
        settlers={[settler(), settler({ userId: 't2_b', isMe: false, cell: { r: 2, c: 3 } })]}
      />
    );
    const mine = document.querySelector('[data-settler="me"]');
    const other = document.querySelector('[data-settler="other"]');
    const img = mine?.querySelector('img');
    if (!img) throw new Error('expected an avatar image');
    fireEvent.error(img);

    expect(mine?.querySelector('img')).toBeNull();
    expect(glyphIn(mine)).toBe('#ic-tent');
    expect(mine?.querySelector('svg')).toHaveAttribute('aria-label', 'You');
    // Only the broken avatar falls back.
    expect(other?.querySelector('img')).not.toBeNull();
  });

  it('draws the tent icon when the settler has no snoovatar', () => {
    render(<IslandView land={LAND} placements={{}} settlers={[settler({ snoovatar: null })]} />);
    const mine = document.querySelector('[data-settler="me"]');
    expect(mine?.querySelector('img')).toBeNull();
    expect(glyphIn(mine)).toBe('#ic-tent');
  });
});
