import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('asks for a hint, shows it with the landmark highlighted, and charges it', async () => {
    stubGame(GAME);
    render(<GamePage />);
    const button = await screen.findByRole('button', { name: 'Ask for a hint (3 left)' });
    fireEvent.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent(/Work out the Windmill next: only \d+ cells fit it\. See Clue 1\./);
    expect(screen.getByRole('button', { name: 'Ask for a hint (2 left)' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-hint="true"]').length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: 'Windmill' }).className).toMatch(/animate-pulse-mark/);

    // The hint stays until the next move, then clears.
    fireEvent.click(screen.getByRole('button', { name: 'row 3 column 3, land, empty' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('runs out after three hints', async () => {
    stubGame(GAME);
    render(<GamePage />);
    for (const left of [3, 2, 1]) {
      fireEvent.click(await screen.findByRole('button', { name: `Ask for a hint (${left} left)` }));
    }
    expect(screen.getByRole('button', { name: 'No hints left' })).toBeDisabled();
  });

  it('opens the terminology sheet from the Terms button and closes it', async () => {
    stubGame(GAME);
    render(<GamePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Terms' }));
    const dialog = screen.getByRole('dialog', { name: 'Terms' });
    expect(dialog).toHaveTextContent('Stands on no shore');
    expect(dialog).toHaveTextContent('Clean');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a login button that calls showLoginPrompt on a 401', async () => {
    stubGame({ error: 'login' }, 401);
    render(<GamePage />);
    const button = await screen.findByRole('button', { name: 'Log in' });
    fireEvent.click(button);
    expect(showLoginPrompt).toHaveBeenCalledTimes(1);
  });

  it('labels a dated 9-landmark island as an Expedition in the header meta line', async () => {
    const nine: GameResponse = {
      ...GAME,
      puzzle: {
        ...GAME.puzzle,
        landmarks: ['lighthouse', 'windmill', 'harbor', 'fort', 'temple', 'well', 'farm', 'cave', 'mine'],
      },
    };
    stubGame(nine);
    render(<GamePage />);
    expect(await screen.findByText(/9 landmarks · Expedition/)).toBeInTheDocument();
  });

  it('does not label a 2-landmark or a practice island as an Expedition', async () => {
    stubGame({ ...GAME, puzzle: { ...GAME.puzzle, number: 0 } });
    render(<GamePage />);
    expect(await screen.findByText(/2 landmarks/)).toBeInTheDocument();
    expect(screen.queryByText(/Expedition/)).not.toBeInTheDocument();
  });

  it('gives the inline Log in button in a chart error a 44 px touch target', async () => {
    const ready: GameResponse = {
      ...GAME,
      placements: { windmill: { r: 2, c: 2 }, lighthouse: { r: 3, c: 4 } },
      history: 'PP',
      status: 'in-progress',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url === '/api/game') return new Response(JSON.stringify(ready), { status: 200 });
        if (url === '/api/chart') return new Response(JSON.stringify({ error: 'login' }), { status: 401 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );
    render(<GamePage />);
    const chartIt = await screen.findByRole('button', { name: 'Chart it' });
    await act(async () => {
      fireEvent.click(chartIt);
    });
    const alert = await screen.findByRole('alert');
    const login = screen.getByRole('button', { name: 'Log in' });
    expect(alert).toContainElement(login);
    expect(login).toHaveClass('min-h-11', 'px-2');
    fireEvent.click(login);
    expect(showLoginPrompt).toHaveBeenCalledTimes(1);
  });
});
