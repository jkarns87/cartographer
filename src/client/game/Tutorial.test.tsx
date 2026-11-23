import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Tutorial } from './Tutorial';

vi.mock('./api', () => ({
  postTutorialSeen: vi.fn(() => Promise.resolve()),
}));

const api = await import('./api');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Tutorial', () => {
  it('starts on step one and points at the legend of icons', () => {
    render(<Tutorial />);
    expect(screen.getByRole('dialog', { name: 'Pick an icon' })).toBeInTheDocument();
    expect(screen.getByText(/legend of icons/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
  });

  it('Skip closes it and records it once', () => {
    render(<Tutorial />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.postTutorialSeen).toHaveBeenCalledTimes(1);
  });

  it('Next walks the three steps and the last button closes it and records it once', () => {
    render(<Tutorial />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Tap the island' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Light every clue' })).toBeInTheDocument();
    expect(api.postTutorialSeen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start charting' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.postTutorialSeen).toHaveBeenCalledTimes(1);
  });

  it('Escape closes it and records it once, and a second Escape does nothing', () => {
    render(<Tutorial />);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(api.postTutorialSeen).toHaveBeenCalledTimes(1);
  });
});
