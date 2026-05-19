import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiServerClient, requireAuth } from '@/app/api/_lib';
import { activityTypeSchema } from '@/app/api/_lib/validators';
import { ACTIVITY_TYPES, type ActivityType } from '@/lib/types';

// GET /api/search/companions
//
// Geo-aware companion search. Wraps the search_companions(...) PostGIS
// function published in migration 20260516000100. RLS still applies
// (function is SECURITY INVOKER) so callers only see verified profiles
// per companion_profiles_select_verified.
//
// Query params:
//   lat            number?  WGS-84 latitude  (paired with lng)
//   lng            number?  WGS-84 longitude (paired with lat)
//   radius_km      number?  default 25; ignored unless lat+lng provided
//   activity_type  enum?    lunch | dinner | coffee | happy_hour
//   min_rating     number?  0..5
//   limit          number?  1..120, default 60
//
// Response:
//   { companions: SearchCompanionDTO[] }

const QuerySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90).optional(),
  lng: z.coerce.number().gte(-180).lte(180).optional(),
  radius_km: z.coerce.number().positive().max(500).default(25),
  activity_type: activityTypeSchema.optional(),
  min_rating: z.coerce.number().gte(0).lte(5).optional(),
  limit: z.coerce.number().int().min(1).max(120).default(60),
});

export interface SearchCompanionDTO {
  user_id: string;
  name: string;
  bio: string | null;
  service_area: string | null;
  photo_url: string | null;
  rating_avg: number | null;
  activities: ActivityType[];
  rates: Partial<Record<ActivityType, number>>;
  verified: boolean;
  distance_km: number | null;
}

interface RpcRow {
  user_id: string;
  name: string | null;
  bio: string | null;
  service_area: string | null;
  photo_urls: string[] | null;
  activities: Record<string, boolean> | null;
  rates: Record<string, number> | null;
  rating_avg: number | string | null;
  verified_at: string | null;
  distance_km: number | string | null;
}

function pickActivities(raw: Record<string, boolean> | null): ActivityType[] {
  if (!raw) return [];
  return ACTIVITY_TYPES.filter((a) => raw[a] === true);
}

function pickRates(raw: Record<string, number> | null): Partial<Record<ActivityType, number>> {
  if (!raw) return {};
  const out: Partial<Record<ActivityType, number>> = {};
  for (const a of ACTIVITY_TYPES) {
    const v = raw[a];
    if (typeof v === 'number' && v > 0) out[a] = v;
  }
  return out;
}

function toDto(row: RpcRow): SearchCompanionDTO {
  return {
    user_id: row.user_id,
    name: row.name ?? 'A companion',
    bio: row.bio,
    service_area: row.service_area,
    photo_url: row.photo_urls?.[0] ?? null,
    rating_avg: row.rating_avg === null ? null : Number(row.rating_avg),
    activities: pickActivities(row.activities),
    rates: pickRates(row.rates),
    verified: row.verified_at !== null,
    distance_km: row.distance_km === null ? null : Number(row.distance_km),
  };
}

export async function GET(request: NextRequest) {
  // Discovery requires auth — core product rule "unverified companions cannot
  // be discovered or booked" is RLS-enforced for *who can be discovered*, but
  // we also want a session for analytics/abuse-control going forward.
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    lat: url.searchParams.get('lat') ?? undefined,
    lng: url.searchParams.get('lng') ?? undefined,
    radius_km: url.searchParams.get('radius_km') ?? undefined,
    activity_type: url.searchParams.get('activity_type') ?? undefined,
    min_rating: url.searchParams.get('min_rating') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    return apiError('invalid_input', 'Invalid search parameters.', parsed.error.flatten());
  }

  // lat without lng (or vice-versa) is meaningless — reject so we don't
  // silently ignore one half of the coordinate.
  if ((parsed.data.lat === undefined) !== (parsed.data.lng === undefined)) {
    return apiError('invalid_input', 'Provide both lat and lng, or neither.');
  }

  const supabase = await apiServerClient();
  const { data, error } = await supabase.rpc('search_companions', {
    search_lat: parsed.data.lat ?? null,
    search_lng: parsed.data.lng ?? null,
    radius_km: parsed.data.radius_km,
    activity_filter: parsed.data.activity_type ?? null,
    min_rating: parsed.data.min_rating ?? null,
    result_limit: parsed.data.limit,
  });

  if (error) {
    return apiError('internal_error', `Search failed: ${error.message}`);
  }

  // Exclude the caller from their own discovery feed — both a seeker
  // browsing for companions and a dual-mode user should never see
  // themselves listed.
  const callerId = guard.caller.userId;
  const companions = ((data ?? []) as RpcRow[])
    .filter((row) => row.user_id !== callerId)
    .map(toDto);
  return NextResponse.json({ companions });
}
