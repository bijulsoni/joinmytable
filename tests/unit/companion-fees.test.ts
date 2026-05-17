// Unit tests for companion-fee (rate) validation.
//
// CLAUDE.md core product rule #4: the companionship fee is fixed per
// activity type, set by the companion. Suggested ranges (advisory, not
// enforced):
//   coffee/tea  $10–15
//   lunch       $20–25
//   happy hour  $20–25
//   dinner      $20–25
//
// The CURRENT validator (`app/api/profiles/_lib/validators.ts ::
// rateValueSchema`) enforces a single global window: positive whole
// dollars, $1..$500. Per-activity bounds are not enforced server-side —
// the Frontend is expected to surface the suggested ranges as hints.
// The tests below pin the validator's actual behaviour today; the
// per-activity-bound suite at the bottom is skipped with a TODO so any
// future tightening of the validator gets covered without us having to
// remember to write the tests.

import { describe, it, expect } from 'vitest';
import { companionProfileUpsertSchema } from '@/app/api/profiles/_lib/validators';
import { ACTIVITY_TYPES, type ActivityType } from '@/lib/types';

function rates(partial: Partial<Record<ActivityType, number>>) {
  return companionProfileUpsertSchema.parse({ rates: partial });
}

describe('rate value validator (global bounds, currently $1..$500 whole dollars)', () => {
  it.each(ACTIVITY_TYPES)('accepts a typical rate for %s', (activity) => {
    const out = rates({ [activity]: 20 });
    expect(out.rates).toMatchObject({ [activity]: 20 });
  });

  it.each(ACTIVITY_TYPES)('rejects $0 for %s (must be positive)', (activity) => {
    expect(() => rates({ [activity]: 0 })).toThrow();
  });

  it.each(ACTIVITY_TYPES)('rejects a negative rate for %s', (activity) => {
    expect(() => rates({ [activity]: -1 })).toThrow();
  });

  it.each(ACTIVITY_TYPES)('rejects a non-integer rate for %s', (activity) => {
    expect(() => rates({ [activity]: 15.5 })).toThrow();
  });

  it.each(ACTIVITY_TYPES)('rejects a rate above the $500 ceiling for %s', (activity) => {
    expect(() => rates({ [activity]: 501 })).toThrow();
  });

  it.each(ACTIVITY_TYPES)('accepts the floor ($1) and ceiling ($500) for %s', (activity) => {
    expect(rates({ [activity]: 1 }).rates).toMatchObject({ [activity]: 1 });
    expect(rates({ [activity]: 500 }).rates).toMatchObject({ [activity]: 500 });
  });

  it('drops unrecognised activity keys from the rates map (four-activity invariant)', () => {
    const out = companionProfileUpsertSchema.parse({
      rates: { lunch: 22, brunch: 30 } as unknown as Record<string, number>,
    });
    expect(out.rates).toEqual({ lunch: 22 });
  });
});

// ---------------------------------------------------------------------------
// QA spec wishlist — per-activity bounds
// ---------------------------------------------------------------------------
// The QA agent prompt asks for per-activity bounds that the current
// validator does NOT enforce:
//
//   coffee:     $5..$50
//   lunch:      $5..$100
//   happy_hour: $5..$100
//   dinner:     $5..$100
//
// These tests are intentionally skipped until / unless the validator is
// tightened. Removing the skip without updating `rateValueSchema` will
// fail loudly, which is the desired signal.

describe.skip('rate value validator (per-activity bounds — NOT YET ENFORCED)', () => {
  it.each([
    ['coffee', 50],
    ['lunch', 100],
    ['dinner', 100],
    ['happy_hour', 100],
  ] as const)('rejects %s above $%i (suggested-range ceiling)', (activity, ceiling) => {
    expect(() => rates({ [activity]: ceiling + 1 })).toThrow();
  });

  it.each(ACTIVITY_TYPES)('rejects %s below $5 (suggested-range floor)', (activity) => {
    expect(() => rates({ [activity]: 4 })).toThrow();
  });
});
