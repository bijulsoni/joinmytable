// Unit tests for the /api/profiles zod validators.
//
// Validators are the API's first authorization fence: they reject
// malformed GeoJSON, unrecognised activity types, mis-bounded rates,
// etc. before any database call happens. The tests below pin the bounds
// documented in CONTRACT.md and the CHECK constraints in the migrations
// (supabase/migrations/20260515000200_users.sql and 20260515000300).

import { describe, it, expect } from 'vitest';
import {
  availabilityCreateSchema,
  availabilityUpdateSchema,
  companionProfileUpsertSchema,
  photoAddSchema,
  photoRemoveSchema,
  uuidSchema,
} from '@/app/api/profiles/_lib/validators';

const SF = { type: 'Point' as const, coordinates: [-122.4194, 37.7749] };

describe('companionProfileUpsertSchema', () => {
  it('rejects an empty payload (requires at least one field)', () => {
    expect(() => companionProfileUpsertSchema.parse({})).toThrow();
  });

  it('accepts a partial payload with just a bio', () => {
    const out = companionProfileUpsertSchema.parse({ bio: 'hello' });
    expect(out.bio).toBe('hello');
  });

  it('accepts an explicit null bio (clearing the field)', () => {
    const out = companionProfileUpsertSchema.parse({ bio: null });
    expect(out.bio).toBeNull();
  });

  it('caps bio at 4000 characters', () => {
    expect(() => companionProfileUpsertSchema.parse({ bio: 'x'.repeat(4001) })).toThrow();
    expect(() => companionProfileUpsertSchema.parse({ bio: 'x'.repeat(4000) })).not.toThrow();
  });

  it('caps service_area at 200 characters', () => {
    expect(() => companionProfileUpsertSchema.parse({ service_area: 'x'.repeat(201) })).toThrow();
  });

  it('accepts a valid GeoJSON Point and rejects out-of-range coordinates', () => {
    expect(companionProfileUpsertSchema.parse({ location: SF }).location).toMatchObject({
      type: 'Point',
    });
    expect(() =>
      companionProfileUpsertSchema.parse({
        location: { type: 'Point', coordinates: [-181, 0] },
      }),
    ).toThrow();
    expect(() =>
      companionProfileUpsertSchema.parse({
        location: { type: 'Point', coordinates: [0, 91] },
      }),
    ).toThrow();
  });

  it('rejects a non-Point GeoJSON envelope', () => {
    expect(() =>
      companionProfileUpsertSchema.parse({
        location: { type: 'LineString', coordinates: [[0, 0]] },
      }),
    ).toThrow();
  });

  it('drops unrecognised activity keys silently (four-activity invariant)', () => {
    const out = companionProfileUpsertSchema.parse({
      activities: {
        lunch: true,
        dinner: false,
        breakfast: true, // not an ActivityType
      } as unknown as Record<string, boolean>,
    });
    expect(out.activities).toEqual({ lunch: true, dinner: false });
    expect(out.activities).not.toHaveProperty('breakfast');
  });

  it('drops unrecognised rate keys silently', () => {
    const out = companionProfileUpsertSchema.parse({
      rates: { lunch: 22, brunch: 30 } as unknown as Record<string, number>,
    });
    expect(out.rates).toEqual({ lunch: 22 });
  });

  it('rejects non-integer rates', () => {
    expect(() => companionProfileUpsertSchema.parse({ rates: { lunch: 22.5 } })).toThrow();
  });

  it('rejects rates below $1 and above $500', () => {
    expect(() => companionProfileUpsertSchema.parse({ rates: { lunch: 0 } })).toThrow();
    expect(() => companionProfileUpsertSchema.parse({ rates: { lunch: -5 } })).toThrow();
    expect(() => companionProfileUpsertSchema.parse({ rates: { lunch: 501 } })).toThrow();
  });
});

describe('availabilityCreateSchema', () => {
  it('accepts a well-formed recurring window', () => {
    const out = availabilityCreateSchema.parse({
      day_or_date: 'Mon',
      time_range: '12:00-13:30',
      activity_types: ['lunch'],
    });
    expect(out).toEqual({
      day_or_date: 'Mon',
      time_range: '12:00-13:30',
      activity_types: ['lunch'],
    });
  });

  it('accepts a one-off date window', () => {
    const out = availabilityCreateSchema.parse({
      day_or_date: '2026-06-04',
      time_range: '18:30-20:00',
      activity_types: ['dinner', 'happy_hour'],
    });
    expect(out.activity_types).toEqual(['dinner', 'happy_hour']);
  });

  it('rejects empty day_or_date / time_range', () => {
    expect(() =>
      availabilityCreateSchema.parse({
        day_or_date: '',
        time_range: '12:00-13:00',
        activity_types: ['lunch'],
      }),
    ).toThrow();
    expect(() =>
      availabilityCreateSchema.parse({
        day_or_date: 'Mon',
        time_range: '',
        activity_types: ['lunch'],
      }),
    ).toThrow();
  });

  it('caps day_or_date and time_range at 40 chars', () => {
    expect(() =>
      availabilityCreateSchema.parse({
        day_or_date: 'x'.repeat(41),
        time_range: '12:00',
        activity_types: ['lunch'],
      }),
    ).toThrow();
  });

  it('rejects activity_types containing values outside the four MVP types', () => {
    expect(() =>
      availabilityCreateSchema.parse({
        day_or_date: 'Mon',
        time_range: '12:00-13:00',
        activity_types: ['brunch'],
      }),
    ).toThrow();
  });

  it('rejects an empty activity_types array', () => {
    expect(() =>
      availabilityCreateSchema.parse({
        day_or_date: 'Mon',
        time_range: '12:00-13:00',
        activity_types: [],
      }),
    ).toThrow();
  });

  it('de-duplicates repeated activity_types values', () => {
    const out = availabilityCreateSchema.parse({
      day_or_date: 'Mon',
      time_range: '12:00-13:00',
      activity_types: ['lunch', 'lunch', 'dinner'],
    });
    expect(out.activity_types).toEqual(['lunch', 'dinner']);
  });
});

describe('availabilityUpdateSchema', () => {
  it('requires at least one field', () => {
    expect(() => availabilityUpdateSchema.parse({})).toThrow();
  });

  it('accepts a partial patch with just day_or_date', () => {
    const out = availabilityUpdateSchema.parse({ day_or_date: 'Tue' });
    expect(out.day_or_date).toBe('Tue');
  });

  it('accepts a partial patch with just activity_types', () => {
    const out = availabilityUpdateSchema.parse({ activity_types: ['coffee'] });
    expect(out.activity_types).toEqual(['coffee']);
  });

  it('still validates fields that are present', () => {
    expect(() => availabilityUpdateSchema.parse({ activity_types: ['brunch'] })).toThrow();
  });
});

describe('photoAddSchema / photoRemoveSchema', () => {
  it('require a valid URL', () => {
    expect(() => photoAddSchema.parse({ url: 'not-a-url' })).toThrow();
    expect(() => photoRemoveSchema.parse({ url: 'not-a-url' })).toThrow();
    expect(photoAddSchema.parse({ url: 'https://cdn.example/photo.webp' }).url).toBe(
      'https://cdn.example/photo.webp',
    );
  });

  it('caps URL length at 2048 chars', () => {
    const big = 'https://cdn.example/' + 'x'.repeat(2050);
    expect(() => photoAddSchema.parse({ url: big })).toThrow();
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
