import {
  boundingBox,
  cellAt,
  idx,
  inBounds,
  isConnected,
  isInland,
  isLand,
  isValidMask,
  landCells,
  neighbor,
  onShore,
} from '../../src/shared/puzzle/grid';
import { DIRS, SIZE } from '../../src/shared/puzzle/types';
import type { Cell, LandMask } from '../../src/shared/puzzle/types';
import type { Rng } from './rng';

export const MIN_LAND = 18;
export const MAX_LAND = 22;
const MIN_BBOX = 4;
/** Shore-variety floor: see `islandProblem`. */
const MIN_SHORE_LINES = 3;

const CELL_COUNT = SIZE * SIZE;

const toMask = (land: readonly boolean[]): LandMask =>
  land.map((on) => (on ? '1' : '0')).join('');

/**
 * Random frontier growth: start on a random cell of the inner 4x4 and repeatedly add a uniformly
 * chosen water cell that touches the island, until `target` cells are land.
 */
export const growIsland = (rng: Rng, target: number): LandMask => {
  const land = new Array<boolean>(CELL_COUNT).fill(false);
  land[idx({ r: 1 + rng.int(SIZE - 2), c: 1 + rng.int(SIZE - 2) })] = true;
  for (let count = 1; count < target; count++) {
    const frontier: number[] = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      if (land[i]) continue;
      const cell = cellAt(i);
      const touchesLand = DIRS.some((d) => {
        const n = neighbor(cell, d);
        return inBounds(n) && land[idx(n)] === true;
      });
      if (touchesLand) frontier.push(i);
    }
    if (frontier.length === 0) break;
    land[rng.pick(frontier)] = true;
  }
  return toMask(land);
};

/** Water cells not connected (orthogonally, through water) to the open sea beyond the grid. */
const hasLake = (land: LandMask): boolean => {
  const seen = new Set<number>();
  const stack: Cell[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const cell = cellAt(i);
    const onEdge =
      cell.r === 0 ||
      cell.c === 0 ||
      cell.r === SIZE - 1 ||
      cell.c === SIZE - 1;
    if (onEdge && !isLand(land, cell)) {
      seen.add(i);
      stack.push(cell);
    }
  }
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) break;
    for (const d of DIRS) {
      const n = neighbor(cur, d);
      if (inBounds(n) && !isLand(land, n) && !seen.has(idx(n))) {
        seen.add(idx(n));
        stack.push(n);
      }
    }
  }
  const water = CELL_COUNT - landCells(land).length;
  return seen.size < water;
};

const lineIsFull = (land: LandMask, line: (k: number) => Cell): boolean => {
  for (let k = 0; k < SIZE; k++) {
    if (!isLand(land, line(k))) return false;
  }
  return true;
};

/**
 * Why an island is unacceptable, or null when it is fine. The first five rules are the spec's
 * (section 3.3); the rest are readability rules from playtesting the generator output:
 *
 * - No row or column completely filled. This is for silhouette quality only: a strip of land
 *   that runs the full width (or height) meets the frame on both sides, so the shape reads as a
 *   band cut off by the grid rather than an island. It does not make shore clues trivial (only
 *   the strip's two end cells become coastal on those sides).
 * - No lakes: enclosed water makes "northern shore" ambiguous to a player scanning the coast.
 * - At least 3 distinct rows hold a cell on the northern or southern shore, and at least 3
 *   distinct columns hold a cell on the eastern or western shore. A near-rectangle has only
 *   2 of each, so shore clues collapse to "top row" / "bottom row" and the coastline is dull.
 */
export const islandProblem = (land: LandMask): string | null => {
  if (!isValidMask(land)) return 'mask is not 36 characters of 0 and 1';
  const cells = landCells(land);
  if (cells.length < MIN_LAND || cells.length > MAX_LAND) {
    return `has ${cells.length} land cells, expected ${MIN_LAND}..${MAX_LAND}`;
  }
  if (!isConnected(land)) return 'land is not connected';
  const box = boundingBox(land);
  if (
    box.maxR - box.minR + 1 < MIN_BBOX ||
    box.maxC - box.minC + 1 < MIN_BBOX
  ) {
    return 'bounding box is smaller than 4x4';
  }
  if (!cells.some((cell) => isInland(land, cell))) return 'has no inland cell';
  for (let k = 0; k < SIZE; k++) {
    if (lineIsFull(land, (c) => ({ r: k, c })))
      return `row ${k} is entirely land`;
    if (lineIsFull(land, (r) => ({ r, c: k })))
      return `column ${k} is entirely land`;
  }
  if (hasLake(land)) return 'has an enclosed lake';
  const shoreRows = new Set<number>();
  const shoreCols = new Set<number>();
  for (const cell of cells) {
    if (onShore(land, cell, 'N') || onShore(land, cell, 'S'))
      shoreRows.add(cell.r);
    if (onShore(land, cell, 'E') || onShore(land, cell, 'W'))
      shoreCols.add(cell.c);
  }
  if (shoreRows.size < MIN_SHORE_LINES) {
    return `only ${shoreRows.size} rows have a northern or southern shore cell`;
  }
  if (shoreCols.size < MIN_SHORE_LINES) {
    return `only ${shoreCols.size} columns have an eastern or western shore cell`;
  }
  return null;
};

/** Connected, 18..22 cells, bbox >= 4x4, >= 1 inland cell, plus the readability rules above. */
export const isAcceptableIsland = (land: LandMask): boolean =>
  islandProblem(land) === null;
