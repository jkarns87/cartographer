import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { maskFromRows } from '../../../shared/puzzle/grid';
import { compassCorner } from './compass';
import { CompassRose } from './CompassRose';

describe('compassCorner', () => {
  it('prefers the bottom-right corner when every corner is water', () => {
    expect(compassCorner(maskFromRows(['......', '.####.', '.####.', '.####.', '.####.', '......']))).toBe('se');
  });

  it('picks the corner with the most water in its 2x2 block', () => {
    expect(compassCorner(maskFromRows(['....##', '....##', '..##..', '..###.', '######', '######']))).toBe('nw');
    expect(compassCorner(maskFromRows(['##....', '##....', '..##..', '..###.', '######', '######']))).toBe('ne');
    expect(compassCorner(maskFromRows(['##..##', '##..##', '..##..', '..###.', '..####', '....##']))).toBe('sw');
    // Ties go bottom-right, then bottom-left, top-right, top-left.
    expect(compassCorner(maskFromRows(['......', '......', '..##..', '..###.', '......', '......']))).toBe('se');
    expect(compassCorner(maskFromRows(['......', '......', '..##..', '..###.', '....##', '....##']))).toBe('sw');
  });
});

describe('CompassRose', () => {
  it('is decorative, ignores taps, and records its corner', () => {
    const { container } = render(<CompassRose corner="sw" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-compass', 'sw');
    expect(svg?.className.baseVal).toMatch(/pointer-events-none/);
    expect(svg?.className.baseVal).toMatch(/text-gold/);
    expect(svg?.className.baseVal).toMatch(/bottom-\[3%\] left-\[3%\]/);
    expect(svg?.textContent).toContain('N');
  });
});
