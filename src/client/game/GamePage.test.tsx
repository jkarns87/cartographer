import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GameResponse } from '../../shared/api';
import { maskFromRows } from '../../shared/puzzle/grid';
import { GamePage } from './GamePage';

const { showLoginPrompt } = vi.hoisted(() => ({ showLoginPrompt: vi.fn() }));
vi.mock('@devvit/web/client', () => ({ showLoginPrompt }));
vi.mock('./ResultScreen', () => ({ ResultContainer: () => null }));
vi.mock('./Tutorial', () => ({ Tutorial: () => null }));

const GAME: GameResponse = {
  postId: 't3_test',
  puzzle: {
    id: 'p1',
    number: 1,
    name: 'Test Isle',
    difficulty: 'easy',
    land: maskFromRows(['..LL..', '.LLLL.', 'LLLLL.', '.LLLLL', '..LLL.', '...L..']),
    landmarks: ['lighthouse', 'windmill'],
    clues: [{ type: 'inland', a: 'windmill' }],
  },
  placements: {},
  history: '',
  corrections: 0,
  startedAt: 1_000,
  serverNow: 5_000,
  status: 'unsolved',
  tutorialSeen: true,
};

const stubGame = (body: unknown, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (): Promise<Response> => new Response(JSON.stringify(body), { status }))
  );

describe('GamePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    showLoginPrompt.mockReset();
  });

  it('stacks on portrait phones and moves the sidebar beside the board at md: and sm:landscape:', async () => {
    stubGame(GAME);
    render(<GamePage />);
    const main = await screen.findByRole('main');
    const container = main.firstElementChild;
    expect(container).not.toBeNull();
    const cls = container?.className ?? '';
    expect(cls).toMatch(/\bflex-col\b/);
    for (const variant of ['md:', 'sm:landscape:']) {
      expect(cls).toContain(`${variant}flex-row`);
      expect(cls).toContain(`${variant}items-start`);
    }
    expect(cls).not.toMatch(/\blg:/);

    const boardColumn = container?.firstElementChild;
    const boardCls = boardColumn?.className ?? '';
    for (const variant of ['md:', 'sm:landscape:']) {
      expect(boardCls).toContain(`${variant}shrink-0`);
      expect(boardCls).toMatch(new RegExp(`${variant.replace(':', '\\:')}w-\\[min\\(30rem,.*100dvh`));
    }
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('renders a login button that calls showLoginPrompt on a 401', async () => {
    stubGame({ error: 'login' }, 401);
    render(<GamePage />);
    const button = await screen.findByRole('button', { name: 'Log in' });
    fireEvent.click(button);
    expect(showLoginPrompt).toHaveBeenCalledTimes(1);
  });
});
