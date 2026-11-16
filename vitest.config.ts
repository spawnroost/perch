import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Load DATABASE_URL_TEST etc. from .env when present (DB tests skip if unset).
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file
}

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) },
  },
  test: {
    setupFiles: ['packages/core/test/setup.ts'],
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // DB tests share one Postgres database, so test files run one at a time.
    fileParallelism: false,
  },
});
