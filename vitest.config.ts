import { defineConfig } from 'vitest/config';

// Standalone test config — intentionally does NOT load the CRXJS plugin used by
// vite.config.ts. The unit tests target pure functions (URL parsing, encoding,
// HTML escaping, state reducers), so a Node environment with no DOM is enough.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
