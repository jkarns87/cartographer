import { DIRS, LANDMARKS, SIZE } from './types';
import type { Axis, Cell, Dir, LandMask, LandmarkId, Placement } from './types';

export const inBounds = (cell: Cell): boolean =>
  cell.r >= 0 && cell.r < SIZE && cell.c >= 0 && cell.c < SIZE;

export const idx = (cell: Cell): number => cell.r * SIZE + cell.c;

export const cellAt = (i: number): Cell => ({ r: Math.floor(i / SIZE), c: i % SIZE });

export const sameCell = (a: Cell, b: Cell): boolean => a.r === b.r && a.c === b.c;

/** The landmark occupying `cell` in `placements`, if any. */
export const landmarkAt = (placements: Placement, cell: Cell): LandmarkId | undefined => {
  for (const id of LANDMARKS) {
    const at = placements[id];
    if (at && sameCell(at, cell)) return id;
  }
  return undefined;
};

export const isLand = (land: LandMask, cell: Cell): boolean =>
  inBounds(cell) && land[idx(cell)] === '1';

export const landCells = (land: LandMask): Cell[] => {
  const cells: Cell[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (land[i] === '1') cells.push(cellAt(i));
  }
  return cells;
};

export const landCount = (land: LandMask): number => landCells(land).length;

export const DELTA: Record<Dir, Cell> = {
  N: { r: -1, c: 0 },
  E: { r: 0, c: 1 },
  S: { r: 1, c: 0 },
  W: { r: 0, c: -1 },
};

export const neighbor = (cell: Cell, dir: Dir): Cell => ({
  r: cell.r + DELTA[dir].r,
  c: cell.c + DELTA[dir].c,
});

/** True when the neighbor in `dir` is water or off-grid (off-grid counts as sea). */
export const onShore = (land: LandMask, cell: Cell, dir: Dir): boolean =>
  !isLand(land, neighbor(cell, dir));

export const isCoast = (land: LandMask, cell: Cell): boolean =>
  isLand(land, cell) && DIRS.some((d) => onShore(land, cell, d));

export const isInland = (land: LandMask, cell: Cell): boolean =>
  isLand(land, cell) && DIRS.every((d) => isLand(land, neighbor(cell, d)));

export const touches = (a: Cell, b: Cell): boolean =>
  Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

/** True when `a` is strictly in direction `dir` of `b`, considering that axis only. */
export const strictlyInDir = (a: Cell, dir: Dir, b: Cell): boolean => {
  switch (dir) {
    case 'N':
      return a.r < b.r;
    case 'S':
      return a.r > b.r;
    case 'E':
      return a.c > b.c;
    case 'W':
      return a.c < b.c;
  }
};

/** Same row (E/W) or same column (N/S) and strictly in that direction. */
export const due = (a: Cell, dir: Dir, b: Cell): boolean =>
  strictlyInDir(a, dir, b) && (dir === 'N' || dir === 'S' ? a.c === b.c : a.r === b.r);

export const shares = (a: Cell, axis: Axis, b: Cell): boolean =>
  axis === 'row' ? a.r === b.r : a.c === b.c;

/** `a` strictly between `b` and `c` on one shared row or column. */
export const between = (a: Cell, b: Cell, c: Cell): boolean => {
  if (a.r === b.r && a.r === c.r) {
    return (b.c < a.c && a.c < c.c) || (c.c < a.c && a.c < b.c);
  }
  if (a.c === b.c && a.c === c.c) {
    return (b.r < a.r && a.r < c.r) || (c.r < a.r && a.r < b.r);
  }
  return false;
};

/** Rows of 6 characters; 'L' or '#' is land, anything else is water. */
export const maskFromRows = (rows: string[]): LandMask => {
  if (rows.length !== SIZE) throw new Error(`expected ${SIZE} rows, got ${rows.length}`);
  return rows
    .map((row) => {
      if (row.length !== SIZE) throw new Error(`expected ${SIZE} columns in "${row}"`);
      return [...row].map((ch) => (ch === 'L' || ch === '#' ? '1' : '0')).join('');
    })
    .join('');
};

export const rowsFromMask = (land: LandMask): string[] => {
  const rows: string[] = [];
  for (let r = 0; r < SIZE; r++) {
    rows.push(
      [...land.slice(r * SIZE, (r + 1) * SIZE)].map((ch) => (ch === '1' ? 'L' : '.')).join('')
    );
  }
  return rows;
};

export const isValidMask = (land: LandMask): boolean =>
  land.length === SIZE * SIZE && /^[01]+$/.test(land);

export const isConnected = (land: LandMask): boolean => {
  const cells = landCells(land);
  const first = cells[0];
  if (!first) return false;
  const seen = new Set<number>([idx(first)]);
  const stack: Cell[] = [first];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) break;
    for (const d of DIRS) {
      const n = neighbor(cur, d);
      if (isLand(land, n) && !seen.has(idx(n))) {
        seen.add(idx(n));
        stack.push(n);
      }
    }
  }
  return seen.size === cells.length;
};

export const boundingBox = (
  land: LandMask
): { minR: number; maxR: number; minC: number; maxC: number } => {
  let minR = SIZE,
    maxR = -1,
    minC = SIZE,
    maxC = -1;
  for (const cell of landCells(land)) {
    minR = Math.min(minR, cell.r);
    maxR = Math.max(maxR, cell.r);
    minC = Math.min(minC, cell.c);
    maxC = Math.max(maxC, cell.c);
  }
  return { minR, maxR, minC, maxC };
};
