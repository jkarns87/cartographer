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
