import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LandmarkId } from '../../../shared/puzzle/types';
import { Legend } from './Legend';

const LANDMARKS: LandmarkId[] = ['lighthouse', 'windmill', 'well'];

describe('Legend', () => {
  it('marks placed chips with aria-pressed and a check, and the selected chip as current', () => {
    render(
      <Legend
        landmarks={LANDMARKS}
        placements={{ lighthouse: { r: 2, c: 2 } }}
        selected="windmill"
        onSelect={() => {}}
        onLift={() => {}}
      />
    );
    const lighthouse = screen.getByRole('button', { name: /lighthouse/i });
    const windmill = screen.getByRole('button', { name: /windmill/i });
    const well = screen.getByRole('button', { name: /^well/i });

    expect(lighthouse).toHaveAttribute('aria-pressed', 'true');
    expect(lighthouse).toHaveAccessibleName(/placed/i);
    expect(lighthouse.querySelector('[data-check]')).not.toBeNull();

    expect(windmill).toHaveAttribute('aria-pressed', 'false');
    expect(windmill).toHaveAttribute('aria-current', 'true');
    expect(windmill.querySelector('[data-check]')).toBeNull();

    expect(well).toHaveAttribute('aria-pressed', 'false');
    expect(well).not.toHaveAttribute('aria-current');

    expect(screen.getByText('Windmill')).toBeInTheDocument();
  });

  it('calls onLift for a placed chip and onSelect otherwise', () => {
    const onSelect = vi.fn();
    const onLift = vi.fn();
    render(
      <Legend
        landmarks={LANDMARKS}
        placements={{ lighthouse: { r: 2, c: 2 } }}
        selected="windmill"
        onSelect={onSelect}
        onLift={onLift}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /lighthouse/i }));
    expect(onLift).toHaveBeenCalledWith('lighthouse');
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^well/i }));
    expect(onSelect).toHaveBeenCalledWith('well');
    expect(onLift).toHaveBeenCalledTimes(1);
  });

  it('shows a prompt instead of a name when nothing is selected', () => {
    render(
      <Legend
        landmarks={LANDMARKS}
        placements={{ lighthouse: { r: 2, c: 2 }, windmill: { r: 3, c: 4 }, well: { r: 5, c: 3 } }}
        selected={null}
        onSelect={() => {}}
        onLift={() => {}}
      />
    );
    expect(screen.getByText(/all landmarks placed/i)).toBeInTheDocument();
  });
});
