import { describe, expect, it } from 'vitest';
import {
  between,
  boundingBox,
  cellAt,
  due,
  idx,
  inBounds,
  isCoast,
  isConnected,
  isInland,
  isLand,
  isValidMask,
  landCells,
  landCount,
  maskFromRows,
  neighbor,
  onShore,
  rowsFromMask,
  sameCell,
  shares,
  strictlyInDir,
  touches,
} from './grid';
import { DIRS, SIZE } from './types';
import type { Cell, Dir } from './types';

const ROWS = ['..LL..', '.LLLL.', 'LLLLL.', '.LLLLL', '..LLL.', '...L..'];

/** Shared fixture: 20 connected land cells, 9 inland, 11 coast, touching all four edges. */
export const ISLAND = maskFromRows(ROWS);

const ALL_WATER = '0'.repeat(SIZE * SIZE);

const cell = (r: number, c: number): Cell => ({ r, c });

const INLAND: Cell[] = [
  cell(1, 2),
  cell(1, 3),
  cell(2, 1),
  cell(2, 2),
  cell(2, 3),
  cell(3, 2),
  cell(3, 3),
  cell(3, 4),
  cell(4, 3),
];

/** Every coast cell of the fixture with the shores it stands on, in DIRS order. */
const SHORES: Array<{ c: Cell; shores: Dir[] }> = [
  { c: cell(0, 2), shores: ['N', 'W'] },
  { c: cell(0, 3), shores: ['N', 'E'] },
  { c: cell(1, 1), shores: ['N', 'W'] },
  { c: cell(1, 4), shores: ['N', 'E'] },
  { c: cell(2, 0), shores: ['N', 'S', 'W'] },
  { c: cell(2, 4), shores: ['E'] },
  { c: cell(3, 1), shores: ['S', 'W'] },
  { c: cell(3, 5), shores: ['N', 'E', 'S'] },
  { c: cell(4, 2), shores: ['S', 'W'] },
  { c: cell(4, 4), shores: ['E', 'S'] },
  { c: cell(5, 3), shores: ['E', 'S', 'W'] },
];

const OFF_GRID: Cell[] = [
  cell(-1, 0),
  cell(0, -1),
  cell(SIZE, 0),
  cell(0, SIZE),
  cell(-1, -1),
  cell(SIZE, SIZE),
];

describe('maskFromRows / rowsFromMask', () => {
  it('encodes land as 1 and water as 0, row-major', () => {
    expect(ISLAND).toBe('001100011110111110011111001110000100');
    expect(ISLAND).toHaveLength(SIZE * SIZE);
  });

  it('round trips through rowsFromMask', () => {
    expect(rowsFromMask(ISLAND)).toEqual(ROWS);
    expect(maskFromRows(rowsFromMask(ISLAND))).toBe(ISLAND);
  });

  it('accepts # as land', () => {
    expect(maskFromRows(ROWS.map((row) => row.replaceAll('L', '#')))).toBe(
      ISLAND
    );
  });

  it('rejects the wrong number of rows', () => {
    expect(() => maskFromRows(ROWS.slice(0, 5))).toThrow(/expected 6 rows/);
  });

  it('rejects a row of the wrong width', () => {
    expect(() => maskFromRows([...ROWS.slice(0, 5), '..L..'])).toThrow(
      /expected 6 columns/
    );
  });

  it.each([
    { name: 'the fixture', mask: ISLAND, expected: true },
    { name: 'all water', mask: ALL_WATER, expected: true },
    { name: 'too short', mask: ISLAND.slice(1), expected: false },
    { name: 'too long', mask: `${ISLAND}1`, expected: false },
    { name: 'a stray character', mask: `2${ISLAND.slice(1)}`, expected: false },
    { name: 'empty', mask: '', expected: false },
  ])('isValidMask: $name -> $expected', ({ mask, expected }) => {
    expect(isValidMask(mask)).toBe(expected);
  });
});

describe('cell math', () => {
  it.each([
    { c: cell(0, 0), expected: true },
    { c: cell(5, 5), expected: true },
    { c: cell(-1, 0), expected: false },
    { c: cell(0, -1), expected: false },
    { c: cell(6, 0), expected: false },
    { c: cell(0, 6), expected: false },
  ])('inBounds($c) -> $expected', ({ c, expected }) => {
    expect(inBounds(c)).toBe(expected);
  });

  it('idx and cellAt are inverses over the whole grid', () => {
    for (let i = 0; i < SIZE * SIZE; i++) {
      expect(idx(cellAt(i))).toBe(i);
    }
    expect(idx(cell(2, 3))).toBe(15);
    expect(cellAt(15)).toEqual(cell(2, 3));
  });

  it('sameCell compares coordinates by value', () => {
    expect(sameCell(cell(2, 3), cell(2, 3))).toBe(true);
    expect(sameCell(cell(2, 3), cell(3, 2))).toBe(false);
  });

  it.each<{ dir: Dir; expected: Cell }>([
    { dir: 'N', expected: cell(1, 2) },
    { dir: 'E', expected: cell(2, 3) },
    { dir: 'S', expected: cell(3, 2) },
    { dir: 'W', expected: cell(2, 1) },
  ])('neighbor of (2,2) to the $dir is $expected', ({ dir, expected }) => {
    expect(neighbor(cell(2, 2), dir)).toEqual(expected);
  });
});

describe('isLand', () => {
  it('is true for land and false for in-grid water', () => {
    expect(isLand(ISLAND, cell(2, 2))).toBe(true);
    expect(isLand(ISLAND, cell(0, 0))).toBe(false);
    expect(isLand(ISLAND, cell(5, 5))).toBe(false);
  });

  it.each(OFF_GRID.map((c) => ({ c })))('is false off-grid at $c', ({ c }) => {
    expect(isLand(ISLAND, c)).toBe(false);
  });

  it('landCells lists the 20 land cells in row-major order', () => {
    const cells = landCells(ISLAND);
    expect(cells).toHaveLength(20);
    expect(landCount(ISLAND)).toBe(20);
    expect(cells[0]).toEqual(cell(0, 2));
    expect(cells[cells.length - 1]).toEqual(cell(5, 3));
    expect(cells.every((c) => isLand(ISLAND, c))).toBe(true);
    const indexes = cells.map(idx);
    expect([...indexes].sort((x, y) => x - y)).toEqual(indexes);
    expect(landCount(ALL_WATER)).toBe(0);
  });
});

describe('onShore', () => {
  it.each<{ c: Cell; dir: Dir }>([
    { c: cell(0, 2), dir: 'N' },
    { c: cell(3, 5), dir: 'E' },
    { c: cell(5, 3), dir: 'S' },
    { c: cell(2, 0), dir: 'W' },
  ])('is true for edge cell $c toward the off-grid $dir edge', ({ c, dir }) => {
    expect(onShore(ISLAND, c, dir)).toBe(true);
  });

  it.each<{ c: Cell; dir: Dir }>([
    { c: cell(1, 1), dir: 'N' },
    { c: cell(2, 4), dir: 'E' },
    { c: cell(3, 1), dir: 'S' },
    { c: cell(4, 2), dir: 'W' },
  ])('is true for $c toward in-grid water to the $dir', ({ c, dir }) => {
    expect(onShore(ISLAND, c, dir)).toBe(true);
  });

  it('is false toward land', () => {
    expect(onShore(ISLAND, cell(0, 2), 'E')).toBe(false);
    expect(onShore(ISLAND, cell(0, 2), 'S')).toBe(false);
    for (const dir of DIRS) {
      expect(onShore(ISLAND, cell(2, 2), dir)).toBe(false);
    }
  });
});

describe('isCoast / isInland', () => {
  it.each(INLAND.map((c) => ({ c })))('$c is inland and not coast', ({ c }) => {
    expect(isInland(ISLAND, c)).toBe(true);
    expect(isCoast(ISLAND, c)).toBe(false);
    for (const dir of DIRS) {
      expect(onShore(ISLAND, c, dir)).toBe(false);
    }
  });

  it.each(SHORES)(
    '$c is coast on shores $shores and not inland',
    ({ c, shores }) => {
      expect(isCoast(ISLAND, c)).toBe(true);
      expect(isInland(ISLAND, c)).toBe(false);
      expect(DIRS.filter((d) => onShore(ISLAND, c, d))).toEqual(shores);
    }
  );

  it('inland and coast partition the land cells', () => {
    const land = landCells(ISLAND);
    const inland = land.filter((c) => isInland(ISLAND, c));
    const coast = land.filter((c) => isCoast(ISLAND, c));
    expect(inland).toHaveLength(9);
    expect(coast).toHaveLength(11);
    expect([...inland, ...coast].map(idx).sort((x, y) => x - y)).toEqual(
      land.map(idx)
    );
  });

  it('water and off-grid cells are neither inland nor coast', () => {
    for (const c of [
      cell(0, 0),
      cell(5, 5),
      cell(0, 4),
      cell(3, 0),
      ...OFF_GRID,
    ]) {
      expect(isInland(ISLAND, c)).toBe(false);
      expect(isCoast(ISLAND, c)).toBe(false);
    }
  });
});

describe('touches', () => {
  it.each(DIRS.map((dir) => ({ dir })))(
    'is true for the orthogonal neighbor to the $dir, in both orders',
    ({ dir }) => {
      const origin = cell(2, 2);
      expect(touches(origin, neighbor(origin, dir))).toBe(true);
      expect(touches(neighbor(origin, dir), origin)).toBe(true);
    }
  );

  it.each([
    { why: 'diagonal', a: cell(2, 2), b: cell(3, 3) },
    { why: 'the same cell', a: cell(2, 2), b: cell(2, 2) },
    { why: 'two apart on a row', a: cell(2, 2), b: cell(2, 4) },
    { why: 'two apart on a column', a: cell(2, 2), b: cell(4, 2) },
    { why: 'a knight move', a: cell(2, 2), b: cell(3, 4) },
  ])('is false for $why', ({ a, b }) => {
    expect(touches(a, b)).toBe(false);
  });
});

describe('strictlyInDir', () => {
  const ne = cell(1, 3);
  const sw = cell(3, 1);

  it.each<{ x: Cell; dir: Dir; y: Cell; expected: boolean }>([
    { x: ne, dir: 'N', y: sw, expected: true },
    { x: ne, dir: 'E', y: sw, expected: true },
    { x: ne, dir: 'S', y: sw, expected: false },
    { x: ne, dir: 'W', y: sw, expected: false },
    { x: sw, dir: 'N', y: ne, expected: false },
    { x: sw, dir: 'E', y: ne, expected: false },
    { x: sw, dir: 'S', y: ne, expected: true },
    { x: sw, dir: 'W', y: ne, expected: true },
    { x: cell(2, 0), dir: 'W', y: cell(2, 4), expected: true },
    { x: cell(2, 0), dir: 'E', y: cell(2, 4), expected: false },
    { x: cell(2, 0), dir: 'N', y: cell(2, 4), expected: false },
    { x: cell(2, 0), dir: 'S', y: cell(2, 4), expected: false },
    { x: ne, dir: 'N', y: ne, expected: false },
    { x: ne, dir: 'E', y: ne, expected: false },
    { x: ne, dir: 'S', y: ne, expected: false },
    { x: ne, dir: 'W', y: ne, expected: false },
  ])('$x strictly $dir of $y -> $expected', ({ x, dir, y, expected }) => {
    expect(strictlyInDir(x, dir, y)).toBe(expected);
  });

  it('ignores the other axis entirely', () => {
    expect(strictlyInDir(cell(0, 5), 'N', cell(5, 0))).toBe(true);
    expect(strictlyInDir(cell(0, 5), 'E', cell(5, 0))).toBe(true);
    expect(strictlyInDir(cell(5, 0), 'S', cell(0, 5))).toBe(true);
    expect(strictlyInDir(cell(5, 0), 'W', cell(0, 5))).toBe(true);
  });
});

describe('due', () => {
  it.each<{ why: string; x: Cell; dir: Dir; y: Cell; expected: boolean }>([
    {
      why: 'same row, east',
      x: cell(2, 4),
      dir: 'E',
      y: cell(2, 0),
      expected: true,
    },
    {
      why: 'same row, west',
      x: cell(2, 0),
      dir: 'W',
      y: cell(2, 4),
      expected: true,
    },
    {
      why: 'same column, north',
      x: cell(1, 3),
      dir: 'N',
      y: cell(3, 3),
      expected: true,
    },
    {
      why: 'same column, south',
      x: cell(3, 3),
      dir: 'S',
      y: cell(1, 3),
      expected: true,
    },
    {
      why: 'adjacent on a row',
      x: cell(2, 3),
      dir: 'E',
      y: cell(2, 2),
      expected: true,
    },
    {
      why: 'same row, wrong way',
      x: cell(2, 4),
      dir: 'W',
      y: cell(2, 0),
      expected: false,
    },
    {
      why: 'same column, wrong way',
      x: cell(1, 3),
      dir: 'S',
      y: cell(3, 3),
      expected: false,
    },
    {
      why: 'north but a different column',
      x: cell(1, 3),
      dir: 'N',
      y: cell(3, 1),
      expected: false,
    },
    {
      why: 'east but a different row',
      x: cell(1, 3),
      dir: 'E',
      y: cell(3, 1),
      expected: false,
    },
    {
      why: 'same row asked for north',
      x: cell(2, 4),
      dir: 'N',
      y: cell(2, 0),
      expected: false,
    },
    {
      why: 'the same cell',
      x: cell(2, 2),
      dir: 'E',
      y: cell(2, 2),
      expected: false,
    },
  ])('$why -> $expected', ({ x, dir, y, expected }) => {
    expect(due(x, dir, y)).toBe(expected);
  });

  it('equals strictlyInDir on a shared axis for every pair of cells', () => {
    for (let i = 0; i < SIZE * SIZE; i++) {
      for (let j = 0; j < SIZE * SIZE; j++) {
        const x = cellAt(i);
        const y = cellAt(j);
        for (const dir of DIRS) {
          const axis = dir === 'N' || dir === 'S' ? 'column' : 'row';
          expect(due(x, dir, y)).toBe(
            strictlyInDir(x, dir, y) && shares(x, axis, y)
          );
        }
      }
    }
  });
});

describe('shares', () => {
  it('row', () => {
    expect(shares(cell(2, 0), 'row', cell(2, 4))).toBe(true);
    expect(shares(cell(2, 0), 'row', cell(3, 0))).toBe(false);
  });

  it('column', () => {
    expect(shares(cell(0, 3), 'column', cell(5, 3))).toBe(true);
    expect(shares(cell(0, 3), 'column', cell(0, 2))).toBe(false);
  });

  it('the same cell shares both', () => {
    expect(shares(cell(2, 2), 'row', cell(2, 2))).toBe(true);
    expect(shares(cell(2, 2), 'column', cell(2, 2))).toBe(true);
  });
});

describe('between', () => {
  it.each([
    {
      why: 'on a row',
      a: cell(2, 2),
      b: cell(2, 0),
      c: cell(2, 4),
      expected: true,
    },
    {
      why: 'on a row, endpoints swapped',
      a: cell(2, 2),
      b: cell(2, 4),
      c: cell(2, 0),
      expected: true,
    },
    {
      why: 'on a row, adjacent endpoints',
      a: cell(2, 2),
      b: cell(2, 1),
      c: cell(2, 3),
      expected: true,
    },
    {
      why: 'on a column',
      a: cell(3, 3),
      b: cell(1, 3),
      c: cell(5, 3),
      expected: true,
    },
    {
      why: 'on a column, endpoints swapped',
      a: cell(3, 3),
      b: cell(5, 3),
      c: cell(1, 3),
      expected: true,
    },
    {
      why: 'on a row but outside the endpoints',
      a: cell(2, 0),
      b: cell(2, 2),
      c: cell(2, 4),
      expected: false,
    },
    {
      why: 'on a column but outside the endpoints',
      a: cell(1, 3),
      b: cell(3, 3),
      c: cell(5, 3),
      expected: false,
    },
    {
      why: 'a coincides with an endpoint',
      a: cell(2, 2),
      b: cell(2, 2),
      c: cell(2, 4),
      expected: false,
    },
    {
      why: 'the endpoints coincide',
      a: cell(2, 2),
      b: cell(2, 4),
      c: cell(2, 4),
      expected: false,
    },
    {
      why: 'not collinear: one endpoint off the row',
      a: cell(2, 2),
      b: cell(2, 0),
      c: cell(3, 4),
      expected: false,
    },
    {
      why: 'not collinear: diagonal',
      a: cell(2, 2),
      b: cell(1, 1),
      c: cell(3, 3),
      expected: false,
    },
    {
      why: 'a off the shared line',
      a: cell(3, 2),
      b: cell(2, 0),
      c: cell(2, 4),
      expected: false,
    },
  ])('$why -> $expected', ({ a, b, c, expected }) => {
    expect(between(a, b, c)).toBe(expected);
  });
});

describe('isConnected', () => {
  it('is true for the fixture', () => {
    expect(isConnected(ISLAND)).toBe(true);
  });

  it('is false for two separated blobs', () => {
    const blobs = maskFromRows([
      'LL....',
      'LL....',
      '......',
      '......',
      '....LL',
      '....LL',
    ]);
    expect(isConnected(blobs)).toBe(false);
  });

  it('does not treat diagonal contact as connected', () => {
    const diagonal = maskFromRows([
      'L.....',
      '.L....',
      '......',
      '......',
      '......',
      '......',
    ]);
    expect(isConnected(diagonal)).toBe(false);
  });

  it('is true for a single cell and false for no land at all', () => {
    const single = maskFromRows([
      '......',
      '......',
      '..L...',
      '......',
      '......',
      '......',
    ]);
    expect(isConnected(single)).toBe(true);
    expect(isConnected(ALL_WATER)).toBe(false);
  });
});

describe('boundingBox', () => {
  it('spans the whole grid for the fixture', () => {
    expect(boundingBox(ISLAND)).toEqual({ minR: 0, maxR: 5, minC: 0, maxC: 5 });
  });

  it('tightens around a small blob', () => {
    const blob = maskFromRows([
      '......',
      '.LL...',
      '.LL...',
      '......',
      '......',
      '......',
    ]);
    expect(boundingBox(blob)).toEqual({ minR: 1, maxR: 2, minC: 1, maxC: 2 });
  });

  it('returns the inverted sentinel when there is no land', () => {
    expect(boundingBox(ALL_WATER)).toEqual({
      minR: SIZE,
      maxR: -1,
      minC: SIZE,
      maxC: -1,
    });
  });
});
