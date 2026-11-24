import { countHints } from './puzzle/hints';

/**
 * The fixed "Post my chart" card (spec 5.8). The server posts it as the user's
 * comment and the client passes the same text to the share sheet, so both sides
 * import this one implementation. No grid and no free text, ever.
 */

export type ChartCardOpts = {
  number: number;
  name: string;
  /** 'P' = place, 'L' = lift, 'H' = hint, in order. Any other character is ignored. */
  history: string;
  elapsedMs: number;
  corrections: number;
  streakCurrent: number;
  practice: boolean;
};

export const MAX_CARD_PINS = 24;

const PIN = '📍';
const LIFT = '↩';
const HINT = '💡';
const ELLIPSIS = '…';

/** Milliseconds to `m:ss`. Negative or non-finite input renders as `0:00`. */
export const cardTime = (ms: number): string => {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const pinLine = (history: string): string => {
  const symbols: string[] = [];
  for (const ch of history) {
    if (ch === 'P') symbols.push(PIN);
    else if (ch === 'L') symbols.push(LIFT);
    else if (ch === 'H') symbols.push(HINT);
  }
  if (symbols.length <= MAX_CARD_PINS) return symbols.join('');
  return symbols.slice(0, MAX_CARD_PINS).join('') + ELLIPSIS;
};

/** A clean chart took no corrections and no hints. */
export const isClean = (corrections: number, history: string): boolean =>
  corrections === 0 && countHints(history) === 0;

/**
 * Line 3: omitted for practice; `Clean chart` for a clean solve on a streak of
 * at most one day; otherwise `<n>-day streak`. An uncounted streak (0) with
 * corrections has nothing to say, so the line is omitted rather than "0-day".
 */
const streakLine = (opts: ChartCardOpts): string | null => {
  if (opts.practice) return null;
  if (isClean(opts.corrections, opts.history) && opts.streakCurrent <= 1) return 'Clean chart';
  if (opts.streakCurrent >= 1) return `${opts.streakCurrent}-day streak`;
  return null;
};

export const chartCardText = (opts: ChartCardOpts): string => {
  const title = opts.practice
    ? `Cartographer practice · ${opts.name}`
    : `Cartographer #${opts.number} · ${opts.name}`;

  const pins = pinLine(opts.history);
  const time = cardTime(opts.elapsedMs);
  const lines = [title, pins ? `${pins}  ${time}` : time];

  const footer = streakLine(opts);
  if (footer) lines.push(footer);
  return lines.join('\n');
};
