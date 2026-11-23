import { LANDMARKS } from '../../src/shared/puzzle/types';

/** Every symbol the sprite must contain: the 14 landmarks plus the settler's tent. */
export const ICON_NAMES = [...LANDMARKS, 'tent'] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** One entry of src/client/icons/icons.json. */
export type IconEntry = { path: string; author: string; source: string };

/** Characters allowed in SVG path data; anything else is rejected before it reaches JSX. */
export const PATH_DATA = /^[A-Za-z0-9 .,+-]+$/;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
