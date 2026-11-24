import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HintPanel } from './HintPanel';
import { hintText } from './hintText';

describe('hintText', () => {
  it('names a misplaced landmark and the clues that say where it belongs', () => {
    expect(hintText({ kind: 'misplaced', landmark: 'windmill', clues: [1, 3] })).toBe(
      'The Windmill is misplaced. Clues 2 and 4 say where it belongs.'
    );
    expect(hintText({ kind: 'misplaced', landmark: 'well', clues: [0] })).toBe(
      'The Well is misplaced. Clue 1 says where it belongs.'
    );
    expect(hintText({ kind: 'misplaced', landmark: 'well', clues: [] })).toBe('The Well is misplaced.');
  });

  it('points at the next landmark with its cell count and clues', () => {
    expect(
      hintText({ kind: 'next', landmark: 'lighthouse', cells: [{ r: 0, c: 1 }], clues: [0, 2, 4] })
    ).toBe('Work out the Lighthouse next: only one cell fits it. See Clues 1, 3 and 5.');
    expect(
      hintText({ kind: 'next', landmark: 'harbor', cells: [{ r: 0, c: 1 }, { r: 2, c: 2 }], clues: [] })
    ).toBe('Work out the Harbor next: only 2 cells fit it.');
  });

  it('has a line for a board with nothing to correct', () => {
    expect(hintText({ kind: 'none' })).toBe('Everything you have placed is right. Keep going.');
  });
});

describe('HintPanel', () => {
  it('shows the hints left, the cost, and the current hint', () => {
    const onHint = vi.fn();
    render(<HintPanel hintsLeft={2} hint={{ kind: 'none' }} onHint={onHint} />);
    const button = screen.getByRole('button', { name: 'Ask for a hint (2 left)' });
    expect(screen.getByText('Each hint adds 30 seconds to your time.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Everything you have placed is right.');
    fireEvent.click(button);
    expect(onHint).toHaveBeenCalledTimes(1);
  });

  it('disables the button when no hints are left', () => {
    render(<HintPanel hintsLeft={0} hint={null} onHint={() => {}} />);
    expect(screen.getByRole('button', { name: 'No hints left' })).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
