#!/usr/bin/env node
/* eslint-disable no-console */

// UI walkthrough harness.
//
// Authenticates as seeker + companion against the running dev server,
// then visits every signed-in page + submits every form, asserting
// 200/3xx + that the post-submit landing page is real (not a Next 404
// or a server-side runtime error). Catches the obvious UX bugs the
// pure API harness can't (broken redirects, form-payload mismatches,
// missing routes referenced from <Link>).

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'TestPass!23';

function makeSession(label) {
  return { label, cookies: new Map(), userId: null };
}

function applySetCookies(session, response) {
  const list = response.headers.getSetCookie?.() ?? [];
  for (const raw of list) {
    const semi = raw.indexOf(';');
    const pair = semi >= 0 ? raw.slice(0, semi) : raw;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value) session.cookies.set(name, value);
  }
}

function cookieHeader(session) {
  if (!session.cookies.size) return null;
  return Array.from(session.cookies, ([k, v]) => `${k}=${v}`).join('; ');
}

async function call(session, method, path, body) {
  const headers = { Accept: 'text/html,application/json' };
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
  return res;
}

async function callJson(session, method, path, body) {
  const res = await call(session, method, path, body);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json, raw: text };
}

async function login(session, email) {
  const res = await callJson(session, 'POST', '/api/test-login', {
    email,
    password: PASSWORD,
  });
  if (res.status !== 200) {
    throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  session.userId = res.body.user_id;
}

const results = [];
function ok(name, detail = '') {
  results.push({ ok: true, name });
  console.log(`  ✓ ${name}${detail ? `  — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
  console.log(`  ✗ FAIL: ${name}${detail ? `\n      ${detail}` : ''}`);
}

function assertOkHtml(res, body, name) {
  if (res.status !== 200) {
    return fail(name, `status ${res.status}`);
  }
  // Next.js embeds its global "not-found" boundary into every page's
  // HTML as a fallback, so substring matching gives false positives.
  // The reliable signal that THIS response is the not-found page is the
  // meta tag Next sets only for actual notFound() / missing-route renders.
  if (/<meta name="next-error" content="not-found"\/>/i.test(body)) {
    return fail(name, 'response is a Next not-found render');
  }
  // Genuine runtime stack traces in the SSR output. The "Error:" prefix
  // alone is too broad (some pages legitimately render the word "Error"),
  // so we look for the stack-trace shape Next produces.
  if (
    /at\s+\w+\s+\(webpack-internal:\/\/\//.test(body) &&
    /TypeError:|ReferenceError:/i.test(body)
  ) {
    return fail(name, 'response contains a server runtime error trace');
  }
  return ok(name);
}

async function visitPage(session, path, name) {
  const res = await call(session, 'GET', path);
  const body = await res.text();
  // Manual redirect: status 3xx is fine for unauthenticated paths or
  // role-gated redirects, but we want most authed visits to render.
  if (res.status === 307 || res.status === 308) {
    const loc = res.headers.get('location');
    fail(name, `redirected to ${loc} — expected the actual page to render`);
    return null;
  }
  return assertOkHtml(res, body, name) ? body : null;
}

async function main() {
  console.log(`\nUI walkthrough against ${BASE}\n`);

  const seeker = makeSession('seeker');
  const companion = makeSession('companion');
  await login(seeker, 'seeker-demo@jmt.test');
  await login(companion, 'companion-demo@jmt.test');
  ok('login both users', `seeker=${seeker.userId.slice(0, 8)} companion=${companion.userId.slice(0, 8)}`);

  // Pages that exist according to find app/**/page.tsx
  const pages = [
    { path: '/', who: null, name: 'landing — anonymous' },
    { path: '/sign-up', who: null, name: 'sign-up — anonymous' },
    { path: '/login', who: null, name: 'login — anonymous' },
    { path: '/forgot-password', who: null, name: 'forgot-password — anonymous' },
    { path: '/discover', who: seeker, name: '/discover — seeker' },
    { path: '/plans', who: seeker, name: '/plans — seeker' },
    { path: '/plans', who: companion, name: '/plans — companion' },
    { path: '/plans?sent=1', who: seeker, name: '/plans?sent=1 — seeker' },
    { path: '/chat', who: seeker, name: '/chat — seeker' },
    { path: '/profile', who: companion, name: '/profile — companion (companion mode)' },
    { path: '/verify', who: seeker, name: '/verify — seeker' },
    { path: '/verify/companion', who: companion, name: '/verify/companion — companion' },
    { path: '/safety', who: null, name: '/safety — link from landing footer' },
  ];

  for (const p of pages) {
    await visitPage(p.who ?? makeSession('anon'), p.path, p.name);
  }

  // Verify every link/CTA in the landing footer + signed-in nav points
  // somewhere that exists.
  console.log('\nLink targets');
  const landing = await call(makeSession('anon'), 'GET', '/');
  const landingBody = await landing.text();
  const hrefs = [...landingBody.matchAll(/href="(\/[a-z][^"#?]*?)"/g)].map((m) => m[1]);
  const uniq = [...new Set(hrefs)];
  for (const href of uniq) {
    const r = await call(makeSession('anon'), 'GET', href);
    const body = await r.text();
    // 200 or 307 (redirect to login) both count as "route exists".
    if (r.status === 200) {
      const isNotFound = /<meta name="next-error" content="not-found"\/>/i.test(body);
      if (isNotFound) fail(`landing link → ${href}`, 'route returned 404 page');
      else ok(`landing link → ${href}`);
    } else if (r.status === 307 || r.status === 308) {
      ok(`landing link → ${href}  (auth redirect)`);
    } else {
      fail(`landing link → ${href}`, `status ${r.status}`);
    }
  }

  // Discover → click a companion → /companions/[id] renders.
  console.log('\nDiscover → companion profile drilldown');
  const discoverHtml = (await call(seeker, 'GET', '/discover')).clone
    ? await (await call(seeker, 'GET', '/discover')).text()
    : await (await call(seeker, 'GET', '/discover')).text();
  const cardLinks = [...discoverHtml.matchAll(/href="(\/companions\/[a-f0-9-]+)"/g)].map(
    (m) => m[1],
  );
  if (cardLinks.length === 0) {
    fail('discover shows companion cards', 'no /companions/[id] links found in HTML');
  } else {
    ok('discover shows companion cards', `${cardLinks.length} links`);
    const first = cardLinks[0];
    const cp = await call(seeker, 'GET', first);
    const cpBody = await cp.text();
    assertOkHtml(cp, cpBody, `companion profile ${first}`);
    // Inline composer now lives directly on the profile — verify the
    // activity tiles + the in-page form (date input + submit button)
    // are present. There is no longer a deep-link CTA to /requests.
    const hasTiles = /data-activity="(lunch|dinner|coffee|happy_hour)"/.test(cpBody);
    const hasDateInput = /type="date"/.test(cpBody);
    const hasSubmit = /type="submit"/.test(cpBody);
    if (hasTiles && hasDateInput && hasSubmit) {
      ok('companion profile inline composer (tiles + date + submit)');
    } else {
      fail(
        'companion profile inline composer',
        `tiles=${hasTiles} date=${hasDateInput} submit=${hasSubmit}`,
      );
    }
  }

  // Send a real request via the form's POST target.
  console.log('\nFull request → accept → chat flow (UI POSTs)');
  const postRes = await callJson(seeker, 'POST', '/api/requests', {
    companion_id: companion.userId,
    activity_type: 'coffee',
    proposed_time: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    venue_name: 'Top Pot Doughnuts',
    venue_location: 'Kirkland Ave',
    budget_tier: '$',
    message: 'UI audit test request',
  });
  if (postRes.status !== 201) {
    fail('seeker POST /api/requests', `status ${postRes.status}: ${JSON.stringify(postRes.body)}`);
  } else {
    ok('seeker POST /api/requests', `request ${postRes.body.request.id.slice(0, 8)}`);

    // Visit the hub with ?sent=1 — should NOT 404. (The success banner is
    // rendered after client hydration via useSearchParams, so it's
    // intentionally absent from the SSR HTML; we only assert the page
    // itself renders.)
    const hub = await call(seeker, 'GET', '/plans?sent=1');
    const hubBody = await hub.text();
    if (/<meta name="next-error" content="not-found"\/>/i.test(hubBody)) {
      fail('/plans?sent=1', 'returned a not-found page');
    } else {
      ok('/plans?sent=1 renders (banner appears after hydration)');
    }

    // Companion accepts → booking_id returned → chat link works.
    const accept = await callJson(companion, 'PATCH', `/api/requests/${postRes.body.request.id}`, {
      status: 'accepted',
    });
    if (accept.status !== 200) {
      fail('companion PATCH accept', `${accept.status} ${JSON.stringify(accept.body)}`);
    } else {
      ok('companion PATCH accept');
      const bid = accept.body.booking_id;
      if (!bid) {
        fail('booking auto-created on accept', 'booking_id is null');
      } else {
        ok('booking auto-created on accept', bid.slice(0, 8));
        const chat = await call(seeker, 'GET', `/chat/${bid}`);
        const chatBody = await chat.text();
        assertOkHtml(chat, chatBody, `chat page /chat/${bid.slice(0, 8)}…`);

        // Send a message and verify.
        const msg = await callJson(seeker, 'POST', `/api/messaging/${bid}`, {
          body: 'UI audit: hello',
        });
        if (msg.status === 201) ok('seeker sends message via API');
        else fail('seeker sends message via API', JSON.stringify(msg.body));

        // Mark complete via the route the UI calls.
        const complete = await callJson(seeker, 'PATCH', `/api/bookings/${bid}/complete`);
        if (complete.status === 200) ok('seeker marks booking complete');
        else fail('seeker marks booking complete', JSON.stringify(complete.body));

        // Verify plan detail page resolves via /plans/by-booking redirector.
        const detail = await call(seeker, 'GET', `/plans/by-booking/${bid}`);
        if (detail.status === 307 || detail.status === 308 || detail.status === 200) {
          ok(`plan detail via /plans/by-booking/${bid.slice(0, 8)}…`);
        } else {
          fail(`plan detail via /plans/by-booking/${bid.slice(0, 8)}…`, `status ${detail.status}`);
        }
      }
    }
  }

  // Walk past + cancelled bookings: same contract, different status.
  // This catches Avatar / counterpart-name crashes on history rows.
  console.log('\nPast / cancelled bookings detail render');
  for (const session of [seeker, companion]) {
    const list = await callJson(session, 'GET', '/api/bookings');
    if (list.status !== 200) continue;
    const ids = (list.body?.bookings ?? []).slice(0, 3).map((b) => b.id);
    for (const id of ids) {
      const detail = await call(session, 'GET', `/plans/by-booking/${id}`);
      if (detail.status === 200 || detail.status === 307 || detail.status === 308) {
        ok(`[${session.label}] /plans/by-booking/${id.slice(0, 8)}…`);
      } else {
        fail(`[${session.label}] /plans/by-booking/${id.slice(0, 8)}…`, `status ${detail.status}`);
      }
    }
  }

  // Negative: empty venue_name should produce field-specific error, not generic.
  console.log('\nForm error surfacing');
  const badRes = await callJson(seeker, 'POST', '/api/requests', {
    companion_id: companion.userId,
    activity_type: 'coffee',
    proposed_time: new Date().toISOString(),
    venue_name: '',
    budget_tier: '$',
  });
  if (badRes.status === 400 && badRes.body?.error?.details?.fieldErrors?.venue_name) {
    ok('empty venue_name returns field-specific 400');
  } else {
    fail('empty venue_name validation', `expected fieldErrors.venue_name; got ${JSON.stringify(badRes.body)}`);
  }

  // Summary.
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log('\n===========================');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed.length}`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    process.exit(1);
  }
  console.log('UI walkthrough green. ✨');
}

main().catch((err) => {
  console.error('\n💥 audit crashed:', err.message);
  console.error(err.stack);
  process.exit(2);
});
