import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest is the unit/integration test runner. The QA & Testing agent
// owns the test strategy and may extend this config (e.g. setup files,
// coverage thresholds, environment per-suite).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.tsx'],
    globals: false,
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@/app': path.resolve(__dirname, 'app'),
      '@/components': path.resolve(__dirname, 'components'),
      '@/lib': path.resolve(__dirname, 'lib'),
      '@/tests': path.resolve(__dirname, 'tests'),
    },
  },
});
