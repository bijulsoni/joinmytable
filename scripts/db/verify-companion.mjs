#!/usr/bin/env node
/* eslint-disable no-console */

// Manual companion verification — the beta path.
//
// During the closed beta, you (Bijul) are the verification reviewer.
// The flow:
//   1. A user signs up + sets up a companion profile + uploads photos
//      via /profile.
//   2. You review their profile (photos, bio, name) — by visiting the
//      app or querying the DB directly.
//   3. If they look legit, run:
//        node scripts/db/verify-companion.mjs --email someone@example.com
//      Or by user_id:
//        node scripts/db/verify-companion.mjs --user-id 33333333-...
//
//   That sets:
//     - companion_profiles.verified_at = now()  (gates discoverability)
//     - users.verification_status = 'verified'  (account-level signal)
//
//   And optionally revokes:
//        node scripts/db/verify-companion.mjs --email ... --revoke
//
// To list pending verifications (everyone with a companion_profiles
// row whose verified_at is null):
//   node scripts/db/verify-companion.mjs --list
//
// All commands run against the live DB via service role. Use carefully.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(2);
}

function parseArgs(argv) {
  const out = { email: null, userId: null, list: false, revoke: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--email' && next) {
      out.email = next.trim().toLowerCase();
      i++;
    } else if (a === '--user-id' && next) {
      out.userId = next.trim();
      i++;
    } else if (a === '--list') {
      out.list = true;
    } else if (a === '--revoke') {
      out.revoke = true;
    } else if (a === '--help' || a === '-h') {
      console.log(
        [
          'Usage:',
          '  verify-companion --list',
          '  verify-companion --email <email>           # mark verified',
          '  verify-companion --user-id <uuid>          # mark verified',
          '  verify-companion --email <email> --revoke  # un-verify',
        ].join('\n'),
      );
      process.exit(0);
    }
  }
  return out;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listPending() {
  const { data, error } = await admin
    .from('companion_profiles')
    .select('user_id, bio, service_area, photo_urls, created_at, users:users!inner(name, email)')
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('List failed:', error.message);
    process.exit(2);
  }
  if (!data || data.length === 0) {
    console.log('No pending companion profiles. ✨');
    return;
  }
  console.log(`Pending (${data.length}):\n`);
  for (const row of data) {
    const u = row.users ?? {};
    const photoCount = (row.photo_urls ?? []).length;
    console.log(`  ${row.user_id}`);
    console.log(`    ${u.name ?? '?'}  <${u.email ?? '?'}>`);
    console.log(`    service: ${row.service_area ?? '—'}`);
    console.log(`    photos: ${photoCount}`);
    console.log(`    created: ${row.created_at}`);
    console.log(`    bio: ${(row.bio ?? '').slice(0, 120) || '—'}`);
    console.log('');
  }
}

async function resolveUserId({ email, userId }) {
  if (userId) return userId;
  const { data, error } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (error) {
    console.error('Lookup failed:', error.message);
    process.exit(2);
  }
  if (!data) {
    console.error(`No user found for email "${email}".`);
    process.exit(2);
  }
  return data.id;
}

async function setVerified(userId, revoke) {
  const verifiedAt = revoke ? null : new Date().toISOString();
  const userStatus = revoke ? 'unverified' : 'verified';

  const { error: cpErr } = await admin
    .from('companion_profiles')
    .update({ verified_at: verifiedAt })
    .eq('user_id', userId);
  if (cpErr) {
    console.error('companion_profiles update failed:', cpErr.message);
    process.exit(2);
  }

  const { error: uErr } = await admin
    .from('users')
    .update({ verification_status: userStatus })
    .eq('id', userId);
  if (uErr) {
    console.error('users update failed:', uErr.message);
    process.exit(2);
  }

  console.log(
    revoke
      ? `🚫  Verification revoked for ${userId}.`
      : `✅  ${userId} is now verified.`,
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.list) {
    await listPending();
    return;
  }
  if (!args.email && !args.userId) {
    console.error('Pass --email or --user-id, or --list. See --help.');
    process.exit(2);
  }
  const userId = await resolveUserId(args);
  await setVerified(userId, args.revoke);
}

main().catch((err) => {
  console.error('\n💥 verify failed:', err.message);
  console.error(err.stack);
  process.exit(2);
});
