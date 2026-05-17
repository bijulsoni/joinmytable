// GET /api/search/venues
//
// Thin wrapper around `searchVenues` from `@/lib/mapbox`. Validates
// query params and returns an array of public-venue results filtered to
// the categories appropriate for the requested activity type
// (CLAUDE.md core product rule #2).
//
// Query string
//   q              required, 1..120 chars, free-text query
//   lat            required, finite number in [-90, 90]
//   lng            required, finite number in [-180, 180]
//   activity_type  required, one of ActivityType ('lunch' | 'dinner' |
//                  'coffee' | 'happy_hour')
//
// Responses
//   200  { venues: Venue[] }
//   400  { error: { code: 'invalid_input', message, details } }
//   500  { error: { code: 'internal_error', message } }

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { searchVenues, type Venue } from '@/lib/mapbox';
import { ACTIVITY_TYPES } from '@/lib/types';

const log = logger.child({ module: 'api/search/venues' });

const QuerySchema = z.object({
  q: z.string().trim().min(1, 'q must not be empty').max(120, 'q is too long'),
  lat: z.coerce.number({ invalid_type_error: 'lat must be a number' }).finite().min(-90).max(90),
  lng: z.coerce.number({ invalid_type_error: 'lng must be a number' }).finite().min(-180).max(180),
  activity_type: z.enum(ACTIVITY_TYPES as readonly [string, ...string[]]),
});

function invalidInput(details: unknown): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'invalid_input',
        message: 'Query parameters failed validation.',
        details,
      },
    },
    { status: 400 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const raw = {
    q: searchParams.get('q') ?? undefined,
    lat: searchParams.get('lat') ?? undefined,
    lng: searchParams.get('lng') ?? undefined,
    activity_type: searchParams.get('activity_type') ?? undefined,
  };

  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    return invalidInput(parsed.error.flatten());
  }

  const { q, lat, lng, activity_type } = parsed.data;

  try {
    const venues: Venue[] = await searchVenues(
      q,
      lat,
      lng,
      activity_type as (typeof ACTIVITY_TYPES)[number],
    );
    return NextResponse.json({ venues });
  } catch (err) {
    // `searchVenues` is documented as non-throwing; this catch is
    // belt-and-braces so a regression in the helper does not surface
    // as an unhandled 500-by-runtime.
    log.error({ err }, 'searchVenues threw unexpectedly');
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Venue search failed.',
        },
      },
      { status: 500 },
    );
  }
}
