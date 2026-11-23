import type { IslandPostData } from '../../shared/api';
import { isValidMask } from '../../shared/puzzle/grid';
import type { Difficulty } from '../../shared/puzzle/types';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDifficulty = (value: unknown): value is Difficulty =>
  typeof value === 'string' && DIFFICULTIES.some((d) => d === value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * Validates `context.postData` at runtime. Post data is untyped JSON written at
 * post time, so every field is checked rather than trusted. A missing `date` is
 * read as a practice island (`null`); anything else malformed returns null and
 * the cover falls back to `/api/cover`.
 */
export const parsePostData = (value: unknown): IslandPostData | null => {
  if (!isRecord(value)) return null;
  const { number, name, difficulty, land, landmarkCount, date } = value;
  if (!isCount(number)) return null;
  if (typeof name !== 'string' || name.length === 0) return null;
  if (!isDifficulty(difficulty)) return null;
  if (typeof land !== 'string' || !isValidMask(land)) return null;
  if (!isCount(landmarkCount) || landmarkCount === 0) return null;
  if (date !== undefined && date !== null && typeof date !== 'string') return null;
  return { number, name, difficulty, land, landmarkCount, date: date ?? null };
};
