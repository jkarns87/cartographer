import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoverResponse, Result, Settler, Stats } from '../../shared/api';
import { maskFromRows } from '../../shared/puzzle/grid';
import type { Placement, Puzzle } from '../../shared/puzzle/types';
import { ResultContainer, ResultScreen } from './ResultScreen';
import type { ResultScreenProps } from './ResultScreen';

vi.mock('@devvit/web/client', () => ({
  navigateTo: vi.fn(),
  showShareSheet: vi.fn(() => Promise.resolve()),
  showToast: vi.fn(),
}));

vi.mock('./api', () => ({
  getCover: vi.fn(),
  getReveal: vi.fn(),
  postComment: vi.fn(),
  postSubscribe: vi.fn(),
}));

const { navigateTo, showShareSheet } = await import('@devvit/web/client');
const api = await import('./api');

const PUZZLE: Puzzle = {
  id: 'p-12',
  number: 12,
  name: 'Thistle Reach',
  difficulty: 'medium',
  land: maskFromRows([
    '......',
    '.####.',
    '.####.',
    '.####.',
    '.####.',
    '......',
  ]),
  landmarks: ['lighthouse', 'windmill', 'well'],
  clues: [],
};

const PLACEMENTS: Placement = {
  lighthouse: { r: 1, c: 1 },
  windmill: { r: 2, c: 2 },
  well: { r: 3, c: 3 },
};

const RESULT: Result = {
  elapsedMs: 252_000,
  corrections: 1,
  history: 'PPPLPPPPP',
  rank: 3,
  total: 41,
  streak: {
    current: 7,
    best: 9,
    cleanRun: 7,
    total: 20,
    tier: 'cartographer',
    steadyHand: true,
    counted: true,
  },
  commented: false,
  subscribePromptSeen: false,
};

const STATS: Stats = {
  started: 60,
  charted: 41,
  cleanPct: 37,
  medianMs: 198_000,
};

const SETTLERS: Settler[] = [
  { userId: 't2_other', snoovatar: null, cell: { r: 4, c: 4 }, isMe: false },
  { userId: 't2_me', snoovatar: null, cell: { r: 1, c: 2 }, isMe: true },
];

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const renderScreen = (overrides: Partial<ResultScreenProps> = {}) => {
  const props: ResultScreenProps = {
    puzzle: PUZZLE,
    placements: PLACEMENTS,
    result: RESULT,
    stats: STATS,
    settlers: SETTLERS,
    revealDone: true,
    onComment: vi.fn(() => Promise.resolve(true)),
    onShare: vi.fn(),
    onSubscribe: vi.fn(() => Promise.resolve(true)),
    onResults: vi.fn(),
    ...overrides,
  };
  render(<ResultScreen {...props} />);
  return props;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResultScreen', () => {
  it('renders the stamp, time, corrections, rank, stats, and streak with tier and badge', () => {
    renderScreen();
    expect(
      screen.getByRole('region', { name: 'Island charted' })
    ).toBeInTheDocument();
    expect(screen.getByText('Charted')).toBeInTheDocument();
    expect(screen.getByText('4:12')).toBeInTheDocument();
    expect(screen.getByText('#3 of 41')).toBeInTheDocument();
    expect(
      screen.getByText('41 charted · 37% clean · median 3:18')
    ).toBeInTheDocument();
    expect(screen.getByText('7-day streak')).toBeInTheDocument();
    expect(screen.getByText('Cartographer')).toBeInTheDocument();
    expect(screen.getByText('Steady Hand ✦')).toBeInTheDocument();
    expect(screen.getByText('2 settlers landed')).toBeInTheDocument();
  });

  it('omits the median when it is null and shows a placeholder while stats load', () => {
    const { unmount } = render(
      <ResultScreen
        puzzle={PUZZLE}
        placements={PLACEMENTS}
        result={RESULT}
        stats={{ ...STATS, medianMs: null }}
        settlers={[]}
        revealDone={false}
        onComment={() => Promise.resolve(true)}
        onShare={() => {}}
        onSubscribe={() => Promise.resolve(true)}
        onResults={() => {}}
      />
    );
    expect(screen.getByText('41 charted · 37% clean')).toBeInTheDocument();
    expect(screen.getByText('Settlers arriving…')).toBeInTheDocument();
    unmount();

    renderScreen({ stats: null });
    expect(screen.queryByText(/charted ·/)).not.toBeInTheDocument();
  });

  it('drops settlers into their cells with yours marked and larger (28 px vs 20 px)', () => {
    renderScreen();
    expect(document.querySelectorAll('[data-settler]')).toHaveLength(2);
    const me = document.querySelector('[data-settler="me"]');
    const other = document.querySelector('[data-settler="other"]');
    expect(me).toHaveClass('h-7', 'w-7');
    expect(me).not.toHaveClass('h-5');
    expect(other).toHaveClass('h-5', 'w-5');
    expect(other).not.toHaveClass('h-7');
  });

  it('disables Post my chart with "Posted" once onComment resolves', async () => {
    const pending = deferred<boolean>();
    const props = renderScreen({ onComment: vi.fn(() => pending.promise) });
    const button = screen.getByRole('button', { name: 'Post my chart' });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(props.onComment).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Posting…' })).toBeDisabled();

    await act(async () => {
      pending.resolve(true);
      await pending.promise;
    });
    const posted = screen.getByRole('button', { name: 'Posted' });
    expect(posted).toBeDisabled();
    fireEvent.click(posted);
    expect(props.onComment).toHaveBeenCalledTimes(1);
  });

  it('keeps Post my chart enabled and says so when posting fails', async () => {
    renderScreen({ onComment: vi.fn(() => Promise.resolve(false)) });
    fireEvent.click(screen.getByRole('button', { name: 'Post my chart' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not post your chart'
    );
    expect(screen.getByRole('button', { name: 'Post my chart' })).toBeEnabled();
  });

  it('starts as Posted when the result says the chart was already commented', () => {
    renderScreen({ result: { ...RESULT, commented: true } });
    expect(screen.getByRole('button', { name: 'Posted' })).toBeDisabled();
  });

  it('calls the provided onShare and onResults', () => {
    const props = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(props.onShare).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Results thread' }));
    expect(props.onResults).toHaveBeenCalledTimes(1);
  });

  it('offers Join once, confirms after subscribing, and hides it when the prompt was seen', async () => {
    const props = renderScreen();
    fireEvent.click(
      screen.getByRole('button', { name: "Join for tomorrow's island" })
    );
    expect(props.onSubscribe).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('Subscribed');
    expect(
      screen.queryByRole('button', { name: "Join for tomorrow's island" })
    ).not.toBeInTheDocument();
  });

  it('keeps Join and shows an error line when subscribing fails', async () => {
    const props = renderScreen({
      onSubscribe: vi.fn(() => Promise.resolve(false)),
    });
    fireEvent.click(
      screen.getByRole('button', { name: "Join for tomorrow's island" })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not subscribe. Try again.'
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const join = screen.getByRole('button', {
      name: "Join for tomorrow's island",
    });
    expect(join).toBeEnabled();

    fireEvent.click(join);
    expect(props.onSubscribe).toHaveBeenCalledTimes(2);
  });

  it('treats a rejected onSubscribe as a failure instead of leaking the rejection', async () => {
    renderScreen({
      onSubscribe: vi.fn(() => Promise.reject(new Error('offline'))),
    });
    fireEvent.click(
      screen.getByRole('button', { name: "Join for tomorrow's island" })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not subscribe'
    );
    expect(
      screen.getByRole('button', { name: "Join for tomorrow's island" })
    ).toBeEnabled();
  });

  it('hides Join when the subscribe prompt was already seen', () => {
    renderScreen({ result: { ...RESULT, subscribePromptSeen: true } });
    expect(
      screen.queryByRole('button', { name: "Join for tomorrow's island" })
    ).not.toBeInTheDocument();
  });

  it('shows the practice note instead of a streak on practice islands', () => {
    renderScreen({ puzzle: { ...PUZZLE, number: 0 } });
    expect(
      screen.getByText('Practice island. Streaks are unchanged.')
    ).toBeInTheDocument();
    expect(screen.queryByText('7-day streak')).not.toBeInTheDocument();
  });

  it('notes an uncounted solve', () => {
    renderScreen({
      result: { ...RESULT, streak: { ...RESULT.streak, counted: false } },
    });
    expect(screen.getByText(/after the 24-hour window/)).toBeInTheDocument();
  });

  it('says the streak ended when it lapsed but a best remains', () => {
    renderScreen({
      result: {
        ...RESULT,
        streak: {
          ...RESULT.streak,
          current: 0,
          tier: 'deckhand',
          counted: false,
        },
      },
    });
    expect(screen.getByText('Streak ended')).toBeInTheDocument();
    expect(screen.getByText('· best 9')).toBeInTheDocument();
    expect(screen.queryByText('No streak yet')).not.toBeInTheDocument();
  });
});

describe('ResultContainer', () => {
  const COVER: CoverResponse = {
    postId: 't3_abc123',
    island: {
      number: 12,
      name: 'Thistle Reach',
      difficulty: 'medium',
      land: PUZZLE.land,
      landmarkCount: 3,
      date: '2026-11-23',
    },
    stats: { started: 70, charted: 50, cleanPct: 40, medianMs: null },
    me: { loggedIn: true, status: 'solved', result: RESULT },
  };

  beforeEach(() => {
    vi.mocked(api.getReveal).mockResolvedValue({ settlers: SETTLERS, more: 3 });
    vi.mocked(api.getCover).mockResolvedValue(COVER);
  });

  const renderContainer = (stats: Stats | null) =>
    render(
      <ResultContainer
        postId="t3_abc123"
        puzzle={PUZZLE}
        placements={PLACEMENTS}
        result={RESULT}
        stats={stats}
      />
    );

  it('reveals settlers once and uses chart stats without fetching the cover', async () => {
    renderContainer(STATS);
    expect(
      await screen.findByText('5 settlers landed (3 not shown)')
    ).toBeInTheDocument();
    expect(api.getReveal).toHaveBeenCalledTimes(1);
    expect(api.getCover).not.toHaveBeenCalled();
    expect(
      screen.getByText('41 charted · 37% clean · median 3:18')
    ).toBeInTheDocument();
  });

  it('fetches community stats from the cover when the chart response is absent', async () => {
    renderContainer(null);
    expect(
      await screen.findByText('50 charted · 40% clean')
    ).toBeInTheDocument();
    expect(api.getCover).toHaveBeenCalledTimes(1);
  });

  it('shares the chart card text and lets Reddit add the post link', async () => {
    renderContainer(STATS);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(showShareSheet).toHaveBeenCalledWith({
      text: 'Cartographer #12 · Thistle Reach\n📍📍📍↩📍📍📍📍📍  4:12\n7-day streak',
    });
    await waitFor(() => expect(api.getReveal).toHaveBeenCalled());
  });

  it('opens the results thread by post URL', async () => {
    renderContainer(STATS);
    fireEvent.click(screen.getByRole('button', { name: 'Results thread' }));
    expect(navigateTo).toHaveBeenCalledWith(
      'https://www.reddit.com/comments/abc123'
    );
    await waitFor(() => expect(api.getReveal).toHaveBeenCalled());
  });

  it('reports a subscribe ApiError as a failure and success as subscribed', async () => {
    vi.mocked(api.postSubscribe).mockResolvedValueOnce({ error: 'login' });
    renderContainer(STATS);
    fireEvent.click(
      screen.getByRole('button', { name: "Join for tomorrow's island" })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not subscribe'
    );

    vi.mocked(api.postSubscribe).mockResolvedValueOnce({ ok: true });
    fireEvent.click(
      screen.getByRole('button', { name: "Join for tomorrow's island" })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Subscribed');
    expect(api.postSubscribe).toHaveBeenCalledTimes(2);
  });

  it('treats an already-posted chart as posted', async () => {
    vi.mocked(api.postComment).mockResolvedValue({ error: 'already' });
    renderContainer(STATS);
    fireEvent.click(screen.getByRole('button', { name: 'Post my chart' }));
    expect(
      await screen.findByRole('button', { name: 'Posted' })
    ).toBeDisabled();
  });
});
