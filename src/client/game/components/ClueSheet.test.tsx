import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Clue, ClueState } from '../../../shared/puzzle/types';
import { ClueSheet } from './ClueSheet';

const CLUES: Clue[] = [
  { type: 'shore', a: 'lighthouse', dir: 'N' },
  { type: 'due', a: 'windmill', dir: 'E', b: 'well' },
  { type: 'inland', a: 'well' },
];

describe('ClueSheet', () => {
  it('renders one glyph per state with its aria-label', () => {
    const states: ClueState[] = ['pending', 'lit', 'contradicted'];
    render(<ClueSheet clues={CLUES} states={states} highlighted={[]} onTapClue={() => {}} />);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByLabelText('pending')).toBeInTheDocument();
    expect(within(rows[1]!).getByLabelText('lit')).toBeInTheDocument();
    expect(within(rows[2]!).getByLabelText('contradicted')).toBeInTheDocument();

    expect(screen.getByLabelText('pending')).toHaveTextContent('○');
    expect(screen.getByLabelText('lit')).toHaveTextContent('✓');
    expect(screen.getByLabelText('contradicted')).toHaveTextContent('!');
  });

  it('renders the sentence text with an icon before each landmark name', () => {
    render(
      <ClueSheet clues={[CLUES[1]!]} states={['pending']} highlighted={[]} onTapClue={() => {}} />
    );
    const row = screen.getByRole('listitem');
    expect(row).toHaveTextContent('The Windmill is due east of the Well.');
    expect(row.querySelectorAll('svg[role="img"]')).toHaveLength(2);
  });

  it('calls onTapClue with the row index and highlights rows naming a highlighted landmark', () => {
    const onTapClue = vi.fn();
    render(
      <ClueSheet
        clues={CLUES}
        states={['pending', 'pending', 'pending']}
        highlighted={['well']}
        onTapClue={onTapClue}
      />
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveAttribute('data-highlighted', 'false');
    expect(rows[1]).toHaveAttribute('data-highlighted', 'true');
    expect(rows[2]).toHaveAttribute('data-highlighted', 'true');

    fireEvent.click(within(rows[2]!).getByRole('button'));
    expect(onTapClue).toHaveBeenCalledWith(2);
  });
});
