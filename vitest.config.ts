import { defineConfig } from 'vitest/config';
import path from 'node:path';

// JoinMyTable test harness.
//
// Owner: QA & Testing agent.
//
// Three layers, three opt-in scopes:
//
//   tests/unit/         pure logic. No env, no network. Always runs in CI.
//   tests/integration/  hits a real Supabase test project. Self-skips when
//                       TEST_SUPABASE_* env vars are not set.
//   tests/rls/          direct RLS verification with two authenticated
//                       clients. Same env contract as integration.
//
// Scripts in package.json:
//   npm run test               -> unit only (the merge gate)
//   npm run test:unit          -> unit only
//   npm run test:integration   -> integration only
//   npm run test:rls           -> RLS only
//   npm run test:all           -> unit + integration + rls
//
// The runner is invoked with `--dir <path>` per script to keep each
// scope independent. The single config below applies to all of them.

export default defineConfig({
  test: {
    environment: 'node',
    // Match relative to the runner root; --dir scopes the search.
    include: ['**/*.{test,spec}.ts', '**/*.{test,spec}.tsx'],
    exclude: ['_helpers/**', 'tests/_helpers/**', 'node_modules/**', '.next/**', 'dist/**'],
    globals: false,
    passWithNoTests: true,
    // Integration / RLS tests await DNS, postgrest, and auth — give them
    // headroom but cap so a hung test doesn't stall CI forever.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@/app': path.resolve(__dirname, 'app'),
      '@/components': path.resolve(__dirname, 'components'),
      '@/lib': path.resolve(__dirname, 'lib'),
      '@/tests': path.resolve(__dirname, 'tests'),
      // The `server-only` marker module throws unconditionally on
      // import. Under Vitest there is no client/server boundary to
      // protect, so alias it to an empty stub.
      'server-only': path.resolve(__dirname, 'tests/_helpers/server-only-stub.ts'),
    },
  },
});
