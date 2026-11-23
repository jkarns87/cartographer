/** Small deterministic PRNG. Every random choice the generator makes goes through one of these. */
export type Rng = {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  pick<T>(arr: readonly T[]): T;
  /** A shuffled copy (Fisher-Yates); the input is not modified. */
  shuffle<T>(arr: readonly T[]): T[];
};

const TWO_POW_32 = 4294967296;

/** mulberry32: 32-bit state, period 2^32, good enough for puzzle generation. */
export const mulberry32 = (seed: number): Rng => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / TWO_POW_32;
  };
  const int = (n: number): number => Math.floor(next() * n);
  return {
    next,
    int,
    pick<T>(arr: readonly T[]): T {
      const value = arr[int(arr.length)];
      if (value === undefined) throw new Error('pick from an empty array');
      return value;
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const x = out[i];
        const y = out[j];
        if (x === undefined || y === undefined) continue;
        out[i] = y;
        out[j] = x;
      }
      return out;
    },
  };
};

/** murmur3 finalizer: a bijective 32-bit avalanche. */
const fmix32 = (value: number): number => {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/** Deterministic 32-bit mix of a master seed and an index (day, attempt, salt). */
export const hashSeed = (master: number, index: number): number =>
  fmix32(
    fmix32(master ^ 0x9e3779b9) ^
      Math.imul((index >>> 0) + 0x632be5ab, 0x9e3779b1)
  );
