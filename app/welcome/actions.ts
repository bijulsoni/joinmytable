'use server';

// Server action backing /welcome's Continue button.
//
// Writes the optional onboarding fields to companion_profiles (creating
// the row if needed) then stamps users.onboarded_at = now(). All
// fields except activities/rates are optional — Continue always
// proceeds, even with an empty form.

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { ACTIVITY_TYPES, type ActivityType, GENDERS } from '@/lib/types';

const log = logger.child({ module: 'auth.welcome' });

const ActivitySchema = z.record(z.string(), z.boolean());
const RatesSchema = z.record(z.string(), z.number().int().min(1).max(500));
const PointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number().gte(-180).lte(180), z.number().gte(-90).lte(90)]),
});
const GenderSchema = z.enum(GENDERS as unknown as [string, ...string[]]);

const InputSchema = z.object({
  bio: z.string().max(4000).nullable(),
  service_area: z.string().max(200).nullable(),
  location: PointSchema.nullable(),
  // Optional preference fields. null = prefer not to say / open to all.
  gender: GenderSchema.nullable(),
  interested_in: z.array(GenderSchema).max(3).nullable(),
  paidCompanionOn: z.boolean(),
  activities: ActivitySchema,
  rates: RatesSchema,
});

export type WelcomeInput = z.infer<typeof InputSchema>;

export type WelcomeResult = { ok: true } | { ok: false; error: string };

// Out-of-region waitlist capture. Called by the region gate on /welcome
// when a brand-new user's geolocation falls outside the open service
// area. We already know they're authenticated (they just signed up), so
// we capture the email we have plus their coords + reverse-geocoded city
// to prioritize which region to open next. Upsert on email so repeated
// attempts don't error or duplicate.
const WaitlistSchema = z.object({
  email: z.string().email(),
  lat: z.number().gte(-90).lte(90).nullable(),
  lng: z.number().gte(-180).lte(180).nullable(),
  city: z.string().max(200).nullable(),
});

export async function joinWaitlistAction(input: {
  email: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
}): Promise<WelcomeResult> {
  const parsed = WaitlistSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Enter a valid email.' };
  }
  const admin = createSupabaseAdminClient() as unknown as {
    from: (table: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  const { error } = await admin.from('waitlist').upsert(
    {
      email: parsed.data.email.toLowerCase(),
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      city: parsed.data.city,
      source: 'region_gate',
    },
    { onConflict: 'email' },
  );
  if (error) {
    log.error({ err: error.message }, 'waitlist upsert failed');
    return { ok: false, error: 'Could not add you to the waitlist. Please try again.' };
  }
  return { ok: true };
}

export async function completeWelcomeAction(input: WelcomeInput): Promise<WelcomeResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid form data.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, error: 'Not signed in.' };
  }
  const userId = auth.user.id;

  // Build the companion_profiles payload. Bio + service_area + location
  // always go in if provided. activities/rates only when companion mode
  // is on (otherwise we want them OFF on the row so /discover doesn't
  // surface a half-set-up profile).
  const cpPayload: Record<string, unknown> = {};
  if (parsed.data.bio !== null) cpPayload.bio = parsed.data.bio;
  if (parsed.data.service_area !== null) cpPayload.service_area = parsed.data.service_area;
  if (parsed.data.location !== null) {
    const [lng, lat] = parsed.data.location.coordinates;
    cpPayload.location = `SRID=4326;POINT(${lng} ${lat})`;
  }
  if (parsed.data.paidCompanionOn) {
    cpPayload.activities = ACTIVITY_TYPES.reduce<Partial<Record<ActivityType, boolean>>>(
      (acc, a) => {
        acc[a] = Boolean(parsed.data.activities[a]);
        return acc;
      },
      {},
    );
    cpPayload.rates = ACTIVITY_TYPES.reduce<Partial<Record<ActivityType, number>>>((acc, a) => {
      if (parsed.data.activities[a] && parsed.data.rates[a]) acc[a] = parsed.data.rates[a];
      return acc;
    }, {});
  } else {
    cpPayload.activities = { lunch: false, dinner: false, coffee: false, happy_hour: false };
    cpPayload.rates = {};
  }

  // Upsert the companion_profiles row keyed by user_id. RLS for
  // companion_profiles allows the owner to write their own row.
  // The typed `Database` overlay collapses the chained insert/update
  // payload to `never` on supabase-js 2.105; cast through a loose
  // adapter — the DB enforces shape via its own constraints.
  type LooseClient = {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: unknown,
        ) => {
          maybeSingle: () => Promise<{ data: { user_id: string } | null; error: unknown }>;
        };
      };
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  if (Object.keys(cpPayload).length > 0) {
    const looseSupabase = supabase as unknown as LooseClient;
    const { data: existing } = await looseSupabase
      .from('companion_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const { error } = await looseSupabase
        .from('companion_profiles')
        .update(cpPayload)
        .eq('user_id', userId);
      if (error) {
        log.error({ err: error.message, userId }, 'companion_profile update failed');
        return { ok: false, error: error.message };
      }
    } else {
      const { error } = await looseSupabase
        .from('companion_profiles')
        .insert({ user_id: userId, ...cpPayload });
      if (error) {
        log.error({ err: error.message, userId }, 'companion_profile insert failed');
        return { ok: false, error: error.message };
      }
    }
  }

  // Stamp onboarded_at on the users row. Service-role client because
  // users.onboarded_at isn't in the RLS-update column allow-list
  // (defensive — users shouldn't be able to set it client-side).
  const admin = createSupabaseAdminClient() as unknown as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  // Persist preferences + stamp onboarded_at in one write. gender +
  // interested_in live on `users` (not companion_profiles) and feed the
  // soft discovery ranking. Written via the admin client alongside
  // onboarded_at — both are out of the RLS self-update allow-list.
  // interested_in is de-duped; null stays null ("open to all").
  const dedupedInterest =
    parsed.data.interested_in && parsed.data.interested_in.length > 0
      ? Array.from(new Set(parsed.data.interested_in))
      : null;
  const { error: stampErr } = await admin
    .from('users')
    .update({
      onboarded_at: new Date().toISOString(),
      gender: parsed.data.gender,
      interested_in: dedupedInterest,
    })
    .eq('id', userId);
  if (stampErr) {
    log.error({ err: stampErr.message, userId }, 'onboarded_at stamp failed');
    return { ok: false, error: stampErr.message };
  }

  return { ok: true };
}
