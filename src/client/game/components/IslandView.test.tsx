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

  it('paints the compass rose beneath the tiles', () => {
    render(<IslandView land={LAND} placements={{}} onCellTap={() => {}} />);
    const frame = screen.getByRole('group', { name: 'Island' });
    const order = Array.from(frame.children);
    const compassAt = order.findIndex((el) => el.hasAttribute('data-compass'));
    const gridAt = order.findIndex((el) => el.classList.contains('grid'));
    // Rendered before the grid, so the cells stack over it: sand covers it...
    expect(compassAt).toBeGreaterThanOrEqual(0);
    expect(compassAt).toBeLessThan(gridAt);
    expect(screen.getByRole('button', { name: 'row 2 column 2, land, empty' }).className).toMatch(/bg-sand/);
    // ...and water cells are transparent, so it shows through the sea.
    expect(screen.getByRole('button', { name: 'row 1 column 1, water' }).className).not.toMatch(/bg-water/);
  });

  it('draws the shoreline on the land sides that face water, with no canals between cells', () => {
    render(<IslandView land={LAND} placements={{}} onCellTap={() => {}} />);
    const frame = screen.getByRole('group', { name: 'Island' });
    expect(frame.querySelector('.grid')?.className).not.toMatch(/\bgap-/);
    const cls = (name: string) => screen.getByRole('button', { name }).className;
    // (1,1) is the island's north-west corner: shore to the north and west only, square corners.
    const corner = cls('row 2 column 2, land, empty');
    expect(corner).toMatch(/border-t-2/);
    expect(corner).toMatch(/border-l-2/);
    expect(corner).not.toMatch(/border-r-2|border-b-2|rounded/);
    // (2,2) has land on all four sides: only the hairline survey grid.
    const inland = cls('row 3 column 3, land, empty');
    expect(inland).toMatch(/border-land/);
    expect(inland).not.toMatch(/border-[trbl]-2/);
  });

  it('counts the edge of the map as sea when drawing the shoreline', () => {
    const edge = maskFromRows(['###...', '###...', '......', '......', '......', '......']);
    render(<IslandView land={edge} placements={{}} onCellTap={() => {}} />);
    const nw = screen.getByRole('button', { name: 'row 1 column 1, land, empty' }).className;
    expect(nw).toMatch(/border-t-2/);
    expect(nw).toMatch(/border-l-2/);
    expect(nw).not.toMatch(/border-r-2|border-b-2/);
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
