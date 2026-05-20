#!/usr/bin/env node
/* eslint-disable no-console */


// E2E test harness for JoinMyTable Phase 2 + Phase 3 APIs.
//
// Authenticates two real seeded users (seeker-demo + companion-demo)
// against a running dev server, then walks through the full booking
// loop and a battery of negative scenarios. Asserts on responses + DB
// state at every step.
//
// Usage:
//   1. Ensure the dev server is up:    npm run dev
//   2. set -a; source .env.local; set +a
//   3. node scripts/e2e-test.mjs
//
// Prints PASS / FAIL per scenario, exits non-zero on any failure.

import { createClient } from '@supabase/supabase-js';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = 'TestPass!23';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ----- tiny session abstraction with per-user cookie jar ----------------

function newSession(label) {
  return { label, cookies: new Map(), userId: null, email: null };
}

function applySetCookies(session, response) {
  // Node 22's Headers.getSetCookie returns the multi-Set-Cookie list.
  const list = response.headers.getSetCookie?.() ?? [];
  for (const raw of list) {
    const semi = raw.indexOf(';');
    const pair = semi >= 0 ? raw.slice(0, semi) : raw;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value === '' || /expires=/i.test(raw)) {
      // Drop cookie if cleared or expired; for our purposes, simple is fine.
      if (value === '') session.cookies.delete(name);
      else session.cookies.set(name, value);
    } else {
      session.cookies.set(name, value);
    }
  }
}

function cookieHeader(session) {
  if (!session.cookies.size) return null;
  return Array.from(session.cookies, ([k, v]) => `${k}=${v}`).join('; ');
}

async function call(session, method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const cookie = cookieHeader(session);
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  applySetCookies(session, res);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, body: json };
}

async function login(session, email) {
  const res = await call(session, 'POST', '/api/test-login', { email, password: PASSWORD });
  if (res.status !== 200) {
    throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  session.userId = res.body.user_id;
  session.email = email;
  return session;
}

// ----- assertion helpers ----------------------------------------------

const results = [];

function pass(name, detail) {
  results.push({ ok: true, name, detail });
  console.log(`  ✓ ${name}${detail ? `  — ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.log(`  ✗ FAIL: ${name}${detail ? `\n      ${detail}` : ''}`);
}

function expect(cond, name, failDetail) {
  if (cond) pass(name);
  else fail(name, failDetail);
  return cond;
}

function expectStatus(res, expected, name) {
  return expect(
    res.status === expected,
    name,
    `expected ${expected}, got ${res.status}: ${JSON.stringify(res.body)}`,
  );
}

// ----- DB cleanup helpers --------------------------------------------

async function cleanupForUserPair(seekerId, companionId) {
  // Wipe any prior reviews/messages/payments/bookings/requests between
  // these two so each run starts from a clean state. Uses admin client
  // (bypasses RLS).
  const { data: requests } = await admin
    .from('meal_requests')
    .select('id')
    .or(
      `and(seeker_id.eq.${seekerId},companion_id.eq.${companionId}),and(seeker_id.eq.${companionId},companion_id.eq.${seekerId})`,
    );
  const requestIds = (requests ?? []).map((r) => r.id);
  if (requestIds.length) {
    const { data: bookings } = await admin
      .from('bookings')
      .select('id')
      .in('request_id', requestIds);
    const bookingIds = (bookings ?? []).map((b) => b.id);
    if (bookingIds.length) {
      await admin.from('reviews').delete().in('booking_id', bookingIds);
      await admin.from('messages').delete().in('booking_id', bookingIds);
      await admin.from('payments').delete().in('booking_id', bookingIds);
      await admin.from('bookings').delete().in('id', bookingIds);
    }
    await admin.from('meal_requests').delete().in('id', requestIds);
  }
}

// ----- scenarios ------------------------------------------------------

async function main() {
  console.log(`\nE2E test run against ${BASE}\n`);

  // Sessions.
  const seeker = newSession('seeker');
  const companion = newSession('companion');

  console.log('Setup');
  await login(seeker, 'seeker-demo@jmt.test');
  await login(companion, 'companion-demo@jmt.test');
  pass('login both users', `seeker=${seeker.userId.slice(0, 8)} companion=${companion.userId.slice(0, 8)}`);

  // Clean prior runs. We also clean on the way OUT in a finally below
  // so the demo accounts are pristine between runs — manual testing
  // shouldn't have to dodge leftover bookings the harness created.
  await cleanupForUserPair(seeker.userId, companion.userId);
  pass('clean prior run');

  // ---------- Phase 2: search -----------------------------------------
  console.log('\nPhase 2: search');
  {
    const res = await call(seeker, 'GET', '/api/search/companions?limit=10');
    expectStatus(res, 200, 'GET /api/search/companions returns 200');
    expect(Array.isArray(res.body?.companions), 'response has companions array');
    expect((res.body?.companions ?? []).length > 0, 'returns at least one companion');
    const allVerified = (res.body?.companions ?? []).every((c) => c.verified === true);
    expect(allVerified, 'every returned companion is verified');
  }
  {
    // Activity filter.
    const res = await call(seeker, 'GET', '/api/search/companions?activity_type=coffee&limit=20');
    expectStatus(res, 200, 'filter by activity_type=coffee');
    const okShape = (res.body?.companions ?? []).every((c) => c.activities?.includes('coffee'));
    expect(okShape, 'every result offers coffee');
  }
  {
    // Anonymous request — should 401 (search requires auth).
    const anon = newSession('anon');
    const res = await call(anon, 'GET', '/api/search/companions');
    expectStatus(res, 401, 'anonymous search returns 401');
  }
  {
    // Invalid lat without lng → 400.
    const res = await call(seeker, 'GET', '/api/search/companions?lat=47.6');
    expectStatus(res, 400, 'lat without lng rejected');
  }

  // ---------- Phase 3: happy path coffee request ----------------------
  console.log('\nPhase 3: happy path coffee request');

  let requestId = null;
  {
    const res = await call(seeker, 'POST', '/api/requests', {
      companion_id: companion.userId,
      activity_type: 'coffee',
      proposed_time: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      venue_name: 'Café Ladro',
      venue_location: '108 Kirkland Ave, Kirkland, WA',
      budget_tier: '$$',
      message: 'Hey, would love to meet for coffee tomorrow!',
    });
    expectStatus(res, 201, 'seeker POST /api/requests for coffee');
    requestId = res.body?.request?.id;
    expect(typeof requestId === 'string', 'response includes request.id');
    expect(res.body?.request?.status === 'requested', 'initial status is requested');
    if (!requestId) {
      throw new Error('Cannot proceed without a created request — aborting harness.');
    }
  }

  {
    // Companion sees it in their inbound list.
    const res = await call(companion, 'GET', '/api/requests');
    expectStatus(res, 200, 'companion GET /api/requests');
    const inboundIds = (res.body?.inbound ?? []).map((r) => r.id);
    expect(inboundIds.includes(requestId), 'companion sees request in inbound');
  }

  {
    // Seeker sees it in outbound.
    const res = await call(seeker, 'GET', '/api/requests');
    expectStatus(res, 200, 'seeker GET /api/requests');
    const outboundIds = (res.body?.outbound ?? []).map((r) => r.id);
    expect(outboundIds.includes(requestId), 'seeker sees request in outbound');
  }

  {
    // Seeker tries to PATCH (should fail — only companion can).
    const res = await call(seeker, 'PATCH', `/api/requests/${requestId}`, {
      status: 'accepted',
    });
    expectStatus(res, 403, 'seeker cannot accept their own request');
  }

  let bookingId = null;
  {
    // Companion accepts → auto-creates the booking.
    const res = await call(companion, 'PATCH', `/api/requests/${requestId}`, {
      status: 'accepted',
    });
    expectStatus(res, 200, 'companion PATCH /api/requests/[id] accepted');
    expect(res.body?.request?.status === 'accepted', 'status now accepted');
    expect(typeof res.body?.booking_id === 'string', 'booking auto-created on accept');
    bookingId = res.body?.booking_id ?? null;
  }

  {
    // Double-accept rejected.
    const res = await call(companion, 'PATCH', `/api/requests/${requestId}`, {
      status: 'accepted',
    });
    expectStatus(res, 409, 'double-accept rejected (409)');
  }

  // ---------- Bookings: confirm + pay (mock) --------------------------
  console.log('\nBookings: confirm + chat + complete + review');
  {
    expect(typeof bookingId === 'string', 'auto-created bookingId available');
    if (!bookingId) throw new Error('Cannot proceed without auto-created booking.');
  }

  {
    // Idempotency: explicit POST /api/bookings on same request returns 409.
    const res = await call(seeker, 'POST', '/api/bookings', {
      request_id: requestId,
      venue_name: 'Other',
      venue_location: 'Other',
      scheduled_time: new Date().toISOString(),
      budget_tier: '$',
    });
    expectStatus(res, 409, 'double-book on accepted request rejected');
  }

  {
    // Companion lists bookings — should see it.
    const res = await call(companion, 'GET', '/api/bookings');
    expectStatus(res, 200, 'companion GET /api/bookings');
    const ids = (res.body?.bookings ?? []).map((b) => b.id);
    expect(ids.includes(bookingId), 'companion sees booking in their list');
  }

  {
    // Single-booking GET.
    const res = await call(seeker, 'GET', `/api/bookings/${bookingId}`);
    expectStatus(res, 200, 'seeker GET /api/bookings/[id]');
    expect(res.body?.booking?.counterpart_name === 'Demo Companion', 'counterpart name resolved');
  }

  // ---------- Messaging ----------------------------------------------
  console.log('\nMessaging');
  {
    // Both see the system message from booking confirmation.
    const res = await call(seeker, 'GET', `/api/messaging/${bookingId}`);
    expectStatus(res, 200, 'seeker GET /api/messaging/[bookingId]');
    const system = (res.body?.messages ?? []).filter((m) => m.is_system_message);
    expect(system.length >= 1, 'system "Booking confirmed" message present');
  }

  {
    // Seeker sends a message.
    const res = await call(seeker, 'POST', `/api/messaging/${bookingId}`, {
      body: 'Hey! Looking forward to it.',
    });
    expectStatus(res, 201, 'seeker sends a message');
    expect(res.body?.message?.sender_id === seeker.userId, 'sender_id is seeker');
  }

  {
    // Companion replies.
    const res = await call(companion, 'POST', `/api/messaging/${bookingId}`, {
      body: 'See you there!',
    });
    expectStatus(res, 201, 'companion sends a message');
  }

  {
    // Anonymous can't read.
    const anon = newSession('anon');
    const res = await call(anon, 'GET', `/api/messaging/${bookingId}`);
    expect(res.status === 401, 'anon cannot read messages', `got ${res.status}`);
  }

  {
    // Empty message body rejected.
    const res = await call(seeker, 'POST', `/api/messaging/${bookingId}`, { body: '   ' });
    expectStatus(res, 400, 'empty message body rejected');
  }

  // ---------- Complete + review --------------------------------------
  console.log('\nComplete + review');
  {
    const res = await call(seeker, 'PATCH', `/api/bookings/${bookingId}/complete`);
    expectStatus(res, 200, 'seeker marks booking complete');
    expect(res.body?.booking?.status === 'completed', 'status is completed');
  }

  {
    // Verify escrow released in DB.
    const { data } = await admin.from('payments').select('escrow_status').eq('booking_id', bookingId).single();
    expect(data?.escrow_status === 'released', 'escrow released after completion');
  }

  {
    // Seeker reviews companion.
    const res = await call(seeker, 'POST', '/api/reviews', {
      booking_id: bookingId,
      rating: 5,
      comment: 'Lovely conversation, great recommendations.',
    });
    expectStatus(res, 201, 'seeker submits review');
    expect(res.body?.review?.rating === 5, 'review rating saved');
  }

  {
    // Duplicate review rejected.
    const res = await call(seeker, 'POST', '/api/reviews', {
      booking_id: bookingId,
      rating: 4,
    });
    expectStatus(res, 409, 'duplicate review rejected');
  }

  {
    // Companion reviews seeker.
    const res = await call(companion, 'POST', '/api/reviews', {
      booking_id: bookingId,
      rating: 5,
      comment: 'Great seeker, easy to chat with.',
    });
    expectStatus(res, 201, 'companion submits review');
  }

  {
    // Public reviews list shows the seeker→companion review.
    const res = await call(seeker, 'GET', `/api/reviews/companion/${companion.userId}`);
    expectStatus(res, 200, 'GET /api/reviews/companion/[id]');
    const ours = (res.body?.reviews ?? []).find((r) => r.booking_id === bookingId);
    expect(ours !== undefined, 'our review is in the public list');
  }

  {
    // rating_avg trigger fired.
    const { data } = await admin
      .from('companion_profiles')
      .select('rating_avg')
      .eq('user_id', companion.userId)
      .single();
    expect(Number(data?.rating_avg) >= 1, 'rating_avg recomputed by trigger');
  }

  // ---------- Negative path: decline ---------------------------------
  console.log('\nNegative paths');
  {
    // Fresh request — decline path.
    const post = await call(seeker, 'POST', '/api/requests', {
      companion_id: companion.userId,
      activity_type: 'lunch',
      proposed_time: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
      venue_name: 'Honey Court',
      venue_location: 'Bellevue, WA',
      budget_tier: '$$',
    });
    expectStatus(post, 201, 'second request created');
    const id = post.body?.request?.id;
    const patch = await call(companion, 'PATCH', `/api/requests/${id}`, { status: 'declined' });
    expectStatus(patch, 200, 'companion declines');
    expect(patch.body?.request?.status === 'declined', 'status is declined');
    expect(patch.body?.booking_id === null, 'declined request did not auto-create a booking');
    // No booking should be creatable on declined requests.
    const tryBook = await call(seeker, 'POST', '/api/bookings', {
      request_id: id,
      venue_name: 'X',
      venue_location: 'Y',
      scheduled_time: new Date().toISOString(),
      budget_tier: '$',
    });
    expectStatus(tryBook, 409, 'cannot book a declined request');
  }

  {
    // Self-request rejected.
    const res = await call(seeker, 'POST', '/api/requests', {
      companion_id: seeker.userId,
      activity_type: 'coffee',
      proposed_time: new Date().toISOString(),
      venue_name: 'Anywhere',
      venue_location: 'Anywhere',
      budget_tier: '$',
    });
    expectStatus(res, 400, 'self-request rejected');
  }

  {
    // Activity not offered. Demo companion offers everything (we
    // normalize this in the seed), so find a companion who doesn't
    // offer one of the four and use them for this negative.
    const { data } = await admin
      .from('companion_profiles')
      .select('user_id, activities, verified_at')
      .not('verified_at', 'is', null);
    const candidate = (data ?? []).find((cp) => {
      const a = cp.activities ?? {};
      return !(a.coffee && a.lunch && a.dinner && a.happy_hour);
    });
    if (candidate) {
      const acts = candidate.activities ?? {};
      const notOffered = ['coffee', 'lunch', 'dinner', 'happy_hour'].find((a) => !acts[a]);
      const res = await call(seeker, 'POST', '/api/requests', {
        companion_id: candidate.user_id,
        activity_type: notOffered,
        proposed_time: new Date(Date.now() + 5 * 86400 * 1000).toISOString(),
        venue_name: 'TBD',
        venue_location: 'TBD',
        budget_tier: '$',
      });
      expectStatus(res, 400, `requesting ${notOffered} (not offered) rejected`);
    } else {
      pass('no companion lacks an activity — skipping unsupported-activity check');
    }
  }

  {
    // After the role-merge: anyone signed in can send a request — the
    // distinction between seeker and companion is gone at the API. The
    // assertion now exercises the happy path from the companion side
    // (proposed_time must be in the future per the new validator).
    const res = await call(companion, 'POST', '/api/requests', {
      companion_id: seeker.userId,
      activity_type: 'coffee',
      proposed_time: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString(),
      venue_name: 'Wherever',
      venue_location: 'Wherever',
      budget_tier: '$',
    });
    // Either succeeds (201) or fails because the target user isn't a
    // verified discoverable companion: 403 (no verified profile) or 404
    // (no companion profile at all). All are valid post-merge outcomes;
    // we just assert it's not the old "seeker_mode_required" 409.
    if (res.status === 201 || res.status === 403 || res.status === 404) {
      pass(
        `signed-in user can attempt a request regardless of mode — status ${res.status} is valid`,
      );
    } else {
      fail(
        'cross-role POST /api/requests',
        `expected 201 / 403 / 404, got ${res.status}: ${JSON.stringify(res.body)}`,
      );
    }
  }

  // ---------- Negative path: cancellation ----------------------------
  console.log('\nCancellation path');
  {
    const post = await call(seeker, 'POST', '/api/requests', {
      companion_id: companion.userId,
      activity_type: 'coffee',
      proposed_time: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      venue_name: 'Top Pot',
      venue_location: '6855 Kirkland Way, Kirkland WA',
      budget_tier: '$',
    });
    const accept = await call(companion, 'PATCH', `/api/requests/${post.body.request.id}`, { status: 'accepted' });
    expectStatus(accept, 200, 'second request accepted (auto-books)');
    const newBookingId = accept.body?.booking_id;
    expect(typeof newBookingId === 'string', 'second booking id present');
    const cancelRes = await call(seeker, 'PATCH', `/api/bookings/${newBookingId}/cancel`);
    expectStatus(cancelRes, 200, 'seeker cancels booking');
    expect(cancelRes.body?.booking?.status === 'cancelled', 'status cancelled');
    const { data: pay } = await admin
      .from('payments')
      .select('escrow_status')
      .eq('booking_id', newBookingId)
      .single();
    expect(pay?.escrow_status === 'refunded', 'escrow refunded after cancel');
    // Cannot message on cancelled booking.
    const tryMsg = await call(seeker, 'POST', `/api/messaging/${newBookingId}`, { body: 'hi' });
    expectStatus(tryMsg, 409, 'cannot message a cancelled booking');
    // Cannot complete a cancelled booking.
    const tryComp = await call(seeker, 'PATCH', `/api/bookings/${newBookingId}/complete`);
    expectStatus(tryComp, 409, 'cannot complete a cancelled booking');
  }

  // ---------- Review on non-completed booking ------------------------
  console.log('\nReview gates');
  {
    const post = await call(seeker, 'POST', '/api/requests', {
      companion_id: companion.userId,
      activity_type: 'coffee',
      proposed_time: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      venue_name: 'Some café',
      venue_location: 'Anywhere',
      budget_tier: '$',
    });
    const accept = await call(companion, 'PATCH', `/api/requests/${post.body.request.id}`, { status: 'accepted' });
    const newBookingId = accept.body?.booking_id;
    const tryReview = await call(seeker, 'POST', '/api/reviews', {
      booking_id: newBookingId,
      rating: 5,
    });
    expectStatus(tryReview, 409, 'cannot review a non-completed booking');
  }

  // ---------- RLS sanity (direct Supabase, not the API) ---------------
  console.log('\nRLS sanity (anonymous + cross-user)');
  {
    const anonClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data: m1 } = await anonClient.from('meal_requests').select('*').limit(1);
    expect((m1 ?? []).length === 0, 'anon cannot SELECT meal_requests directly');

    const { data: m2 } = await anonClient.from('payments').select('*').limit(1);
    expect((m2 ?? []).length === 0, 'anon cannot SELECT payments directly');

    const { data: m3 } = await anonClient.from('bookings').select('*').limit(1);
    expect((m3 ?? []).length === 0, 'anon cannot SELECT bookings directly');

    const { data: m4 } = await anonClient.from('messages').select('*').limit(1);
    expect((m4 ?? []).length === 0, 'anon cannot SELECT messages directly');

    // Anon insert into meal_requests must be blocked by RLS.
    const { error: insertErr } = await anonClient.from('meal_requests').insert({
      seeker_id: seeker.userId,
      companion_id: companion.userId,
      activity_type: 'coffee',
      proposed_time: new Date().toISOString(),
    });
    expect(insertErr !== null, 'anon cannot INSERT meal_requests', `expected error, got: ${JSON.stringify(insertErr)}`);

    // Anon cannot INSERT bookings (service-role only).
    const { error: bookErr } = await anonClient.from('bookings').insert({
      request_id: '00000000-0000-0000-0000-000000000000',
      activity_type: 'coffee',
      venue_name: 'x',
      venue_location: 'y',
      scheduled_time: new Date().toISOString(),
      budget_tier: '$',
      companion_fee: 12,
    });
    expect(bookErr !== null, 'anon cannot INSERT bookings');
  }

  {
    // Cross-user data leak check: pick another seeker who's not us, and
    // verify that the demo seeker session can only see meal_requests
    // where they're a participant.
    const { data: otherSeeker } = await admin
      .from('users')
      .select('id')
      .eq('is_seeker', true)
      .neq('id', seeker.userId)
      .limit(1)
      .single();
    if (otherSeeker) {
      const res = await call(seeker, 'GET', '/api/requests');
      const all = res.body?.requests ?? [];
      const leaked = all.some(
        (r) => r.seeker_id !== seeker.userId && r.companion_id !== seeker.userId,
      );
      expect(!leaked, 'seeker cannot see other seekers\' requests via /api/requests');
    } else {
      pass('no other seeker available — skipping cross-user leak check');
    }
  }

  // ---------- Final summary -----------------------------------------
  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log('\n===========================');
  console.log(`PASS: ${passed.length}`);
  console.log(`FAIL: ${failed.length}`);

  // Leave the DB pristine for the next manual session. Skip this with
  // KEEP_E2E_DATA=1 when debugging what the harness produced.
  if (process.env.KEEP_E2E_DATA) {
    console.log('\n(KEEP_E2E_DATA set — leaving harness-generated rows in place.)');
  } else {
    try {
      await cleanupForUserPair(seeker.userId, companion.userId);
      console.log('Post-run cleanup: demo seeker ↔ companion rows wiped.');
    } catch (err) {
      console.error('Post-run cleanup failed:', err.message);
    }
  }

  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    process.exit(1);
  }
  console.log('All scenarios green. ✨');
}

main().catch((err) => {
  console.error('\n💥 harness crashed:', err.message);
  console.error(err.stack);
  process.exit(2);
});
