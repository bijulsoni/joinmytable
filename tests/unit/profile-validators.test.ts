// Unit tests for the /api/profiles zod validators.
//
// Validators are the API's first authorization fence: they reject
// out-of-band rate values, malformed GeoJSON, mis-ordered availability
// windows, etc. before any database call happens. The tests below pin
// the bounds documented in CONTRACT.md and the corresponding CHECK
// constraints in supabase/migrations/20260515000200_users.sql.

import { describe, it, expect } from 'vitest';
import {
  availabilityCreateSchema,
  availabilityUpdateSchema,
  companionProfileUpsertSchema,
  photoSetSchema,
  uuidSchema,
} from '@/app/api/profiles/_lib/validators';

const VALID_POINT = { type: 'Point', coordinates: [-122.4194, 37.7749] } as const;

function baseProfile() {
  return {
    rate_cents: 2500,
    service_area_center: { ...VALID_POINT },
    service_radius_m: 5000,
  };
}

describe('companionProfileUpsertSchema', () => {
  it('accepts a minimal valid payload and applies defaults', () => {
    const result = companionProfileUpsertSchema.parse(baseProfile());
    expect(result.headline).toBeNull();
    expect(result.bio_long).toBeNull();
    expect(result.rate_currency).toBe('USD');
    expect(result.meal_types).toEqual(['lunch', 'dinner']);
  });

  it('mirrors the rate_cents CHECK bounds (500 .. 20000)', () => {
    expect(() =>
      companionProfileUpsertSchema.parse({ ...baseProfile(), rate_cents: 499 }),
    ).toThrow();
    expect(() =>
      companionProfileUpsertSchema.parse({ ...baseProfile(), rate_cents: 20001 }),
    ).toThrow();
    expect(() =>
      companionProfileUpsertSchema.parse({ ...baseProfile(), rate_cents: 1234.5 }),
    ).toThrow();
    expect(companionProfileUpsertSchema.parse({ ...baseProfile(), rate_cents: 500 }).rate_cents).toBe(500);
    expect(companionProfileUpsertSchema.parse({ ...baseProfile(), rate_cents: 20000 }).rate_cents).toBe(20000);
  });

  it('mirrors the service_radius_m CHECK bounds (500 .. 100_000)', () => {
    expect(() =>
      companionProfileUpsertSchema.parse({ ...baseProfile(), service_radius_m: 499 }),
    ).toThrow();
    expect(() =>
      companionProfileUpsertSchema.parse({ ...baseProfile(), service_radius_m: 100_001 }),
    ).toThrow();
  });

  it('rejects non-uppercase currency codes', () => {
    expect(() =>
      companionProfileUpsertSchema.parse({ ...baseProfile(), rate_currency: 'usd' }),
    ).toThrow();
  });

  it('rejects empty meal_types and unknown meal types', () => {
    expect(() =>
      companionProfileUpsertSchema.parse({ ...baseProfile(), meal_types: [] }),
    ).toThrow();
    expect(() =>
      companionProfileUpsertSchema.parse({ ...baseProfile(), meal_types: ['breakfast'] }),
    ).toThrow();
  });

  it('rejects coordinates outside WGS-84 ranges', () => {
    expect(() =>
      companionProfileUpsertSchema.parse({
        ...baseProfile(),
        service_area_center: { type: 'Point', coordinates: [-181, 0] },
      }),
    ).toThrow();
    expect(() =>
      companionProfileUpsertSchema.parse({
        ...baseProfile(),
        service_area_center: { type: 'Point', coordinates: [0, 91] },
      }),
    ).toThrow();
  });

  it('rejects payloads that are not GeoJSON Points', () => {
    expect(() =>
      companionProfileUpsertSchema.parse({
        ...baseProfile(),
        service_area_center: { type: 'LineString', coordinates: [[0, 0]] },
      }),
    ).toThrow();
  });

  it('caps headline and bio_long at the column limits', () => {
    const longHeadline = 'x'.repeat(121);
    const longBio = 'x'.repeat(4001);
    expect(() =>
      companionProfileUpsertSchema.parse({ ...baseProfile(), headline: longHeadline }),
    ).toThrow();
    expect(() =>
      companionProfileUpsertSchema.parse({ ...baseProfile(), bio_long: longBio }),
    ).toThrow();
  });
});

describe('availabilityCreateSchema', () => {
  it('accepts a well-formed window', () => {
    const result = availabilityCreateSchema.parse({
      day_of_week: 1,
      start_time: '12:00',
      end_time: '13:30',
      meal_type: 'lunch',
      timezone: 'America/Los_Angeles',
    });
    expect(result.day_of_week).toBe(1);
  });

  it('rejects when end_time <= start_time', () => {
    expect(() =>
      availabilityCreateSchema.parse({
        day_of_week: 1,
        start_time: '13:00',
        end_time: '12:30',
        meal_type: 'lunch',
        timezone: 'UTC',
      }),
    ).toThrow();
    expect(() =>
      availabilityCreateSchema.parse({
        day_of_week: 1,
        start_time: '12:00',
        end_time: '12:00',
        meal_type: 'lunch',
        timezone: 'UTC',
      }),
    ).toThrow();
  });

  it('rejects day_of_week outside 0..6', () => {
    expect(() =>
      availabilityCreateSchema.parse({
        day_of_week: 7,
        start_time: '12:00',
        end_time: '13:00',
        meal_type: 'lunch',
        timezone: 'UTC',
      }),
    ).toThrow();
  });

  it('rejects malformed time strings and timezones', () => {
    expect(() =>
      availabilityCreateSchema.parse({
        day_of_week: 1,
        start_time: '24:00',
        end_time: '25:00',
        meal_type: 'lunch',
        timezone: 'UTC',
      }),
    ).toThrow();
    expect(() =>
      availabilityCreateSchema.parse({
        day_of_week: 1,
        start_time: '12:00',
        end_time: '13:00',
        meal_type: 'lunch',
        timezone: 'not a tz',
      }),
    ).toThrow();
  });
});

describe('availabilityUpdateSchema', () => {
  it('requires at least one field', () => {
    expect(() => availabilityUpdateSchema.parse({})).toThrow();
  });

  it('accepts a partial patch with one field', () => {
    expect(availabilityUpdateSchema.parse({ day_of_week: 3 }).day_of_week).toBe(3);
  });

  it('re-validates start/end ordering when both are present', () => {
    expect(() =>
      availabilityUpdateSchema.parse({ start_time: '13:00', end_time: '12:00' }),
    ).toThrow();
  });

  it('does NOT re-validate ordering when only one of start/end is present (route handles join)', () => {
    expect(() => availabilityUpdateSchema.parse({ start_time: '13:00' })).not.toThrow();
    expect(() => availabilityUpdateSchema.parse({ end_time: '13:00' })).not.toThrow();
  });
});

describe('photoSetSchema', () => {
  it('requires a non-empty bounded path', () => {
    expect(() => photoSetSchema.parse({ avatar_path: '' })).toThrow();
    expect(() => photoSetSchema.parse({ avatar_path: 'x'.repeat(513) })).toThrow();
    expect(photoSetSchema.parse({ avatar_path: 'foo/bar.webp' }).avatar_path).toBe('foo/bar.webp');
  });
});

describe('uuidSchema', () => {
  it('matches canonical lowercase and uppercase UUIDs', () => {
    expect(uuidSchema.safeParse('11111111-2222-3333-4444-555555555555').success).toBe(true);
    expect(uuidSchema.safeParse('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE').success).toBe(true);
  });

  it('rejects malformed ids', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(uuidSchema.safeParse('11111111222233334444555555555555').success).toBe(false);
  });
});
