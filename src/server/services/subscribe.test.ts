import { describe, expect, it } from 'vitest';
import { isUserActionDenied } from './subscribe';

describe('isUserActionDenied', () => {
  it("matches Reddit's refusal to act as the user", () => {
    expect(
      isUserActionDenied(
        new Error(
          '2 UNKNOWN: permission not granted for [SUBSCRIBE_TO_SUBREDDIT]'
        )
      )
    ).toBe(true);
  });

  it('ignores other errors and non-errors', () => {
    expect(isUserActionDenied(new Error('ECONNRESET'))).toBe(false);
    expect(isUserActionDenied('permission not granted')).toBe(false);
    expect(isUserActionDenied(undefined)).toBe(false);
  });
});
