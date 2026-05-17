// Unit tests for the four-activity invariant.
//
// CLAUDE.md core product rule #1: only four activity types in the MVP
// (lunch, dinner, coffee, happy_hour). This file is the single source of
// truth for that union (`@/lib/types/activity.ts`); the tests below pin
// the value list, the type-guard, and the suggested-fee metadata that
// the Frontend renders and the Core API uses to default rates.
//
// Any change to the activity vocabulary must be made in one place and
// reflected here.

import { describe, it, expect } from 'vitest';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, isActivityType, type ActivityType } from '@/lib/types';
import { activityTypeSchema, activityTypesArraySchema } from '@/app/api/_lib/validators';

const EXPECTED: ActivityType[] = ['lunch', 'dinner', 'coffee', 'happy_hour'];

describe('ACTIVITY_TYPES', () => {
  it('contains exactly the four MVP activity types in stable order', () => {
    expect(Array.from(ACTIVITY_TYPES)).toEqual(EXPECTED);
  });

  it('has no duplicates', () => {
    expect(new Set(ACTIVITY_TYPES).size).toBe(ACTIVITY_TYPES.length);
  });
});

describe('isActivityType', () => {
  it.each(EXPECTED)('accepts %s', (value) => {
    expect(isActivityType(value)).toBe(true);
  });

  it.each(['brunch', 'breakfast', 'tea', 'happy hour', 'LUNCH', '', null, undefined, 42])(
    'rejects %j',
    (value) => {
      expect(isActivityType(value as unknown)).toBe(false);
    },
  );
});

describe('activityTypeSchema (zod)', () => {
  it.each(EXPECTED)('accepts %s', (value) => {
    expect(activityTypeSchema.parse(value)).toBe(value);
  });

  it.each(['brunch', 'BREAKFAST', 'happy hour'])('rejects %s', (value) => {
    expect(() => activityTypeSchema.parse(value)).toThrow();
  });
});

describe('activityTypesArraySchema', () => {
  it('rejects empty arrays', () => {
    expect(() => activityTypesArraySchema.parse([])).toThrow();
  });

  it('rejects values outside the four allowed types', () => {
    expect(() => activityTypesArraySchema.parse(['lunch', 'brunch'])).toThrow();
  });

  it('de-duplicates valid input', () => {
    expect(activityTypesArraySchema.parse(['lunch', 'lunch', 'dinner'])).toEqual([
      'lunch',
      'dinner',
    ]);
  });

  it('accepts every valid combination', () => {
    expect(activityTypesArraySchema.parse(EXPECTED)).toEqual(EXPECTED);
  });
});

describe('ACTIVITY_TYPE_META', () => {
  it('has an entry for every activity type and only those', () => {
    expect(Object.keys(ACTIVITY_TYPE_META).sort()).toEqual([...EXPECTED].sort());
  });

  it.each([
    ['coffee', 10, 15, 'cafe'],
    ['lunch', 20, 25, 'restaurant'],
    ['happy_hour', 20, 25, 'bar_or_restaurant'],
    ['dinner', 20, 25, 'restaurant'],
  ] as const)('%s maps to suggested fee range $%i-$%i in a %s', (activity, min, max, venue) => {
    const meta = ACTIVITY_TYPE_META[activity];
    expect(meta.value).toBe(activity);
    expect(meta.suggestedFeeUsd).toEqual({ min, max });
    expect(meta.venue).toBe(venue);
    expect(meta.durationMinutes.min).toBeGreaterThan(0);
    expect(meta.durationMinutes.max).toBeGreaterThanOrEqual(meta.durationMinutes.min);
  });

  it('keeps min <= max on every fee range', () => {
    for (const a of EXPECTED) {
      const { min, max } = ACTIVITY_TYPE_META[a].suggestedFeeUsd;
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThanOrEqual(min);
    }
  });
});
