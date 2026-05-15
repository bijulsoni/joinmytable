import { describe, it, expect } from 'vitest';

// Smoke test - replaced by the QA & Testing agent's real suite.
// Exists so CI runs `npm run test` as a meaningful gate from day one.
describe('smoke', () => {
  it('arithmetic still works', () => {
    expect(1 + 1).toBe(2);
  });
});
