// Test-environment stub for the `server-only` marker module.
//
// In production / Next.js builds, `import 'server-only'` is a guard that
// throws if a server-only file is bundled into a client component.
// Under Vitest (Node), there is no such bundling, so we alias the
// module to this empty stub. See vitest.config.ts.
export {};
