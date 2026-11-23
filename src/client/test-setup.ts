import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without `globals`, so Testing Library cannot register its own
// afterEach cleanup; do it here so renders never leak between tests.
afterEach(() => {
  cleanup();
});
