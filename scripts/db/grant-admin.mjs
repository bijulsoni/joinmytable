#!/usr/bin/env node
/* eslint-disable no-console */

// Grant (or revoke) admin console access.
//
// is_admin is intentionally NOT user-settable — the only way to flip it
// is this service-role script. Run it once to promote your own account
// after you've signed up normally, so your password never lives in
// source or config; it stays in your password manager.
//
// Usage:
//   set -a; source .env.local; set +a            # or .env.production.local
//   node scripts/db/grant-admin.mjs --email you@example.com
//   node scripts/db/grant-admin.mjs --email you@example.com --revoke
//   node scripts/db/grant-admin.mjs --list        # who currently has it

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(2);
}

function parseArgs(argv) {
  const out = { email: null, revoke: false, list: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--email' && next) {
      out.email = next.trim().toLowerCase();
      i++;
    } else if (a === '--revoke') {
      out.revoke = true;
    } else if (a === '--list') {
      out.list = true;
    } else if (a === '--help' || a === '-h') {
      console.log(
        [
          'Usage:',
          '  grant-admin --email <email>            # grant admin',
          '  grant-admin --email <email> --revoke   # revoke admin',
          '  grant-admin --list                     # list admins',
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

async function main() {
  const args = parseArgs(process.argv);

  if (args.list) {
    const { data, error } = await admin
      .from('users')
      .select('email, name, created_at')
      .eq('is_admin', true)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('List failed:', error.message);
      process.exit(2);
    }
    if (!data || data.length === 0) {
      console.log('No admins yet. Grant one with --email.');
      return;
    }
    console.log(`\nAdmins (${data.length}):\n`);
    for (const u of data) console.log(`  ${u.name ?? '?'}  <${u.email}>`);
    console.log('');
    return;
  }

  if (!args.email) {
    console.error('Pass --email <email>, or --list. See --help.');
    process.exit(2);
  }

  const { data: user, error: lookupErr } = await admin
    .from('users')
    .select('id, email, name, is_admin')
    .eq('email', args.email)
    .maybeSingle();
  if (lookupErr) {
    console.error('Lookup failed:', lookupErr.message);
    process.exit(2);
  }
  if (!user) {
    console.error(`No user found for "${args.email}". They must sign up first.`);
    process.exit(2);
  }

  const { error: updErr } = await admin
    .from('users')
    .update({ is_admin: !args.revoke })
    .eq('id', user.id);
  if (updErr) {
    console.error('Update failed:', updErr.message);
    process.exit(2);
  }

  console.log(
    args.revoke
      ? `🚫  Admin revoked for ${user.email}.`
      : `✅  ${user.email} is now an admin. Visit /admin.`,
  );
}

main().catch((err) => {
  console.error('\n💥 grant-admin failed:', err.message);
  console.error(err.stack);
  process.exit(2);
});
