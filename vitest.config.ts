import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  // Next compiles JSX itself and tsconfig says "preserve", which esbuild would
  // hand through untouched. The component tests need it transformed.
  esbuild: {
    jsx: 'automatic'
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Node stays the default. Only the component files ask for a DOM, with a
    // `@vitest-environment jsdom` docblock at the top of the file.
    environment: 'node'
  }
});
