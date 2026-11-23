import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoverResponse, IslandPostData, Result } from '../../shared/api';
import { maskFromRows } from '../../shared/puzzle/grid';
import { Cover } from './Cover';
import { parsePostData } from './postData';

const devvit = vi.hoisted(() => {
  const state: { context: { postData: unknown } } = { context: { postData: undefined } };
  return state;
});

vi.mock('@devvit/web/client', () => ({
  context: devvit.context,
  requestExpandedMode: vi.fn(),
}));

vi.mock('../game/api', () => ({
  getCover: vi.fn(),
  getReveal: vi.fn(),
}));

const { requestExpandedMode } = await import('@devvit/web/client');
const api = await import('../game/api');

const LAND = maskFromRows(['......', '.####.', '.####.', '.####.', '.####.', '......']);

const POST_DATA: IslandPostData = {
  number: 12,
  name: 'Thistle Reach',
  difficulty: 'medium',
  land: LAND,
  landmarkCount: 8,
  date: '2026-11-23',
};

const RESULT: Result = {
  elapsedMs: 252_000,
  corrections: 1,
  history: 'PPPLPPPPP',
  rank: 3,
  total: 41,
  streak: { current: 2, best: 2, cleanRun: 0, total: 2, tier: 'deckhand', steadyHand: false, counted: true },
  commented: false,
  subscribePromptSeen: false,
};

const coverResponse = (me: CoverResponse['me']): CoverResponse => ({
  postId: 't3_abc123',
  island: POST_DATA,
  stats: { started: 60, charted: 41, cleanPct: 37, medianMs: 198_000 },
  me,
});

const never = <T,>() => new Promise<T>(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  devvit.context.postData = { ...POST_DATA };
  vi.mocked(api.getReveal).mockResolvedValue({ settlers: [], more: 0 });
});

describe('parsePostData', () => {
  it('accepts a valid object', () => {
    expect(parsePostData({ ...POST_DATA })).toEqual(POST_DATA);
  });

  it('rejects a missing land', () => {
    const { land: _land, ...rest } = POST_DATA;
    expect(parsePostData(rest)).toBeNull();
  });

  it('rejects wrong field types and malformed masks', () => {
    expect(parsePostData(undefined)).toBeNull();
    expect(parsePostData(null)).toBeNull();
    expect(parsePostData('island')).toBeNull();
    expect(parsePostData([POST_DATA])).toBeNull();
    expect(parsePostData({ ...POST_DATA, number: '12' })).toBeNull();
    expect(parsePostData({ ...POST_DATA, number: -1 })).toBeNull();
    expect(parsePostData({ ...POST_DATA, name: '' })).toBeNull();
    expect(parsePostData({ ...POST_DATA, difficulty: 'expedition' })).toBeNull();
    expect(parsePostData({ ...POST_DATA, land: '0101' })).toBeNull();
    expect(parsePostData({ ...POST_DATA, land: LAND.replace('1', 'x') })).toBeNull();
    expect(parsePostData({ ...POST_DATA, landmarkCount: 0 })).toBeNull();
    expect(parsePostData({ ...POST_DATA, landmarkCount: 7.5 })).toBeNull();
    expect(parsePostData({ ...POST_DATA, date: 20261123 })).toBeNull();
  });

  it('reads a null or missing date as a practice island', () => {
    expect(parsePostData({ ...POST_DATA, number: 0, date: null })?.date).toBeNull();
    const { date: _date, ...undated } = POST_DATA;
    expect(parsePostData(undated)?.date).toBeNull();
  });
});

describe('Cover', () => {
  it('paints the island from postData before the network answers', () => {
    vi.mocked(api.getCover).mockReturnValue(never());
    render(<Cover />);
    expect(screen.getByText('Cartographer #12')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Thistle Reach' })).toBeInTheDocument();
    expect(screen.getByText('Medium · 8 landmarks')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Island map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chart this island' })).toBeInTheDocument();
    expect(api.getCover).toHaveBeenCalledTimes(1);
  });

  it('opens the game entry in expanded mode from the button', () => {
    vi.mocked(api.getCover).mockReturnValue(never());
    render(<Cover />);
    fireEvent.click(screen.getByRole('button', { name: 'Chart this island' }));
    expect(requestExpandedMode).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestExpandedMode).mock.calls[0]?.[1]).toBe('game');
  });

  it('adds community stats after the cover request resolves', async () => {
    vi.mocked(api.getCover).mockResolvedValue(coverResponse({ loggedIn: false, status: 'unsolved' }));
    render(<Cover />);
    expect(await screen.findByText('41 charted · 37% clean · median 3:18')).toBeInTheDocument();
    expect(screen.queryByText('Charted')).not.toBeInTheDocument();
    expect(api.getReveal).not.toHaveBeenCalled();
  });

  it('labels the button for an island in progress', async () => {
    vi.mocked(api.getCover).mockResolvedValue(coverResponse({ loggedIn: true, status: 'in-progress' }));
    render(<Cover />);
    expect(await screen.findByRole('button', { name: 'Continue charting' })).toBeInTheDocument();
  });

  it('shows the stamped result and the settlers once solved', async () => {
    vi.mocked(api.getCover).mockResolvedValue(
      coverResponse({ loggedIn: true, status: 'solved', result: RESULT })
    );
    vi.mocked(api.getReveal).mockResolvedValue({
      settlers: [
        { userId: 't2_me', snoovatar: null, cell: { r: 1, c: 1 }, isMe: true },
        { userId: 't2_b', snoovatar: null, cell: { r: 2, c: 3 }, isMe: false },
      ],
      more: 0,
    });
    render(<Cover />);
    expect(await screen.findByText('Charted')).toBeInTheDocument();
    expect(screen.getByText('4:12')).toBeInTheDocument();
    expect(screen.getByText('#3 of 41')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View your chart' })).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getReveal).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[data-settler]')).toHaveLength(2);
  });

  it('titles practice islands without a number', () => {
    devvit.context.postData = { ...POST_DATA, number: 0, date: null };
    vi.mocked(api.getCover).mockReturnValue(never());
    render(<Cover />);
    expect(screen.getByText('Cartographer practice')).toBeInTheDocument();
  });

  it('falls back to the cover response when postData is missing', async () => {
    devvit.context.postData = undefined;
    vi.mocked(api.getCover).mockResolvedValue(coverResponse({ loggedIn: false, status: 'unsolved' }));
    render(<Cover />);
    expect(screen.queryByRole('img', { name: 'Island map' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Thistle Reach' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Island map' })).toBeInTheDocument();
  });
});
