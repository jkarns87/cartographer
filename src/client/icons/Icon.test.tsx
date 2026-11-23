import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '../../shared/puzzle/types';
import { Icon } from './Icon';
import { Sprite } from './Sprite';

const ICON_NAMES = [...LANDMARKS, 'tent'].sort();

describe('Sprite', () => {
  it('defines one hidden symbol per landmark plus tent', () => {
    const { container } = render(<Sprite />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('width')).toBe('0');
    const ids = [...container.querySelectorAll('symbol')].map((s) => s.id);
    expect(ids).toEqual(ICON_NAMES.map((n) => `ic-${n}`));
    for (const symbol of container.querySelectorAll('symbol')) {
      expect(symbol.getAttribute('viewBox')).toBe('0 0 512 512');
      expect(
        symbol.querySelector('path')?.getAttribute('d')?.length ?? 0
      ).toBeGreaterThan(50);
    }
  });
});

describe('Icon', () => {
  it('references the sprite symbol and labels itself with the landmark name', () => {
    const { getByRole, container } = render(
      <Icon name="fort" className="h-7 w-7" />
    );
    const svg = getByRole('img', { name: 'Fort' });
    expect(svg.getAttribute('class')).toBe('h-7 w-7');
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(container.querySelector('use')?.getAttribute('href')).toBe(
      '#ic-fort'
    );
  });

  it('labels the tent as Settler and honours an explicit title', () => {
    const tent = render(<Icon name="tent" />);
    expect(tent.getByRole('img', { name: 'Settler' })).toBeTruthy();
    const titled = render(<Icon name="well" title="Well (placed)" />);
    expect(titled.getByRole('img', { name: 'Well (placed)' })).toBeTruthy();
  });
});
