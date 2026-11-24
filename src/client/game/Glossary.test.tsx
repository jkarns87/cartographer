import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Glossary } from './Glossary';
import { TERMS } from './terms';

describe('Glossary', () => {
  it('lists every term with its meaning and focuses Close', () => {
    render(<Glossary onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Terms' })).toBeInTheDocument();
    for (const t of TERMS) {
      expect(screen.getByText(t.term)).toBeInTheDocument();
      expect(screen.getByText(t.meaning)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('defines the phrases the way the rules check them', () => {
    const meaning = (term: string) => TERMS.find((t) => t.term === term)?.meaning ?? '';
    expect(meaning('Touches')).toMatch(/share an edge/);
    expect(meaning('Stands on no shore')).toMatch(/none of its four sides/);
    expect(meaning('Lies between')).toMatch(/Diagonals do not count/);
    expect(meaning('Due east of')).toMatch(/same row/);
    expect(meaning('Somewhere east of')).toMatch(/whatever the row/);
    expect(meaning('No landmark stands north of')).toMatch(/same row or further south/);
    expect(meaning('Hint')).toMatch(/30 seconds/);
  });

  it('closes on the button and on Escape', () => {
    const onClose = vi.fn();
    render(<Glossary onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
