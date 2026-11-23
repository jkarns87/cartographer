/**
 * The fixed "Post my chart" card (spec 5.8). The server posts it as the user's
 * comment and the client passes the same text to the share sheet, so both sides
 * import this one implementation. No grid and no free text, ever.
 */

export type ChartCardOpts = {
  number: number;
  name: string;
  /** 'P' = place, 'L' = lift, in order. Any other character is ignored. */
  history: string;
  elapsedMs: number;
  corrections: number;
  streakCurrent: number;
  practice: boolean;
};

export const MAX_CARD_PINS = 24;

const PIN = '📍';
const LIFT = '↩';
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
  }
  if (symbols.length <= MAX_CARD_PINS) return symbols.join('');
  return symbols.slice(0, MAX_CARD_PINS).join('') + ELLIPSIS;
};

export const chartCardText = (opts: ChartCardOpts): string => {
  const title = opts.practice
    ? `Cartographer practice · ${opts.name}`
    : `Cartographer #${opts.number} · ${opts.name}`;

  const pins = pinLine(opts.history);
  const time = cardTime(opts.elapsedMs);
  const lines = [title, pins ? `${pins}  ${time}` : time];

  if (!opts.practice) {
    lines.push(
      opts.corrections === 0 && opts.streakCurrent <= 1
        ? 'Clean chart'
        : `${opts.streakCurrent}-day streak`
    );
  }
  return lines.join('\n');
};
