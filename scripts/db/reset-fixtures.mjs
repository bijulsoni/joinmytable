#!/usr/bin/env node
/* eslint-disable no-console */

// One-shot DB cleanup for local/dev: wipe every row from the dynamic
// tables (meal_requests, bookings, payments, messages, reviews) so you
// can start manual testing from a known-empty state. Auth users and
// companion_profiles are preserved.
//
// FK order matters — children first, parents last:
//   reviews → messages → payments → bookings → meal_requests
//
// After the wipe, the demo companion's rating_avg gets repinned to 4.95
// (otherwise the cascaded review delete leaves it at 0, which hides the
// "top-rated" framing on /discover).
//
// Safety: requires CONFIRM=yes in the environment, so a stray run can't
// silently nuke a real DB. Uses the service-role key (bypasses RLS),
// which must be set in .env.local.
//
// Usage:
//   set -a; source .env.local; set +a
//   CONFIRM=yes node scripts/db/reset-fixtures.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(2);
}

if (process.env.CONFIRM !== 'yes') {
  console.error(
    'Refusing to run without CONFIRM=yes. This script wipes every row from\n' +
      'meal_requests, bookings, payments, messages, and reviews. Re-run as:\n' +
      '  CONFIRM=yes node scripts/db/reset-fixtures.mjs',
  );
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Returns the row count for a table, before-and-after.
async function count(table) {
  const { count: c, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`count(${table}): ${error.message}`);
  return c ?? 0;
}

async function wipe(table) {
  // Supabase's PostgREST requires a filter on .delete(). Use an
  // always-true predicate to delete everything.
  const { error } = await admin.from(table).delete().not('id', 'is', null);
  if (error) throw new Error(`wipe(${table}): ${error.message}`);
}

async function main() {
  console.log(`\nReset against ${SUPABASE_URL}\n`);

  const tables = ['reviews', 'messages', 'payments', 'bookings', 'meal_requests'];
  const before = {};
  for (const t of tables) before[t] = await count(t);
  console.log('Before:');
  for (const t of tables) console.log(`  ${t.padEnd(16)} ${before[t]}`);

  for (const t of tables) {
    process.stdout.write(`Wiping ${t}… `);
    await wipe(t);
    process.stdout.write('done\n');
  }

  // Repin the demo companion rating so /discover still looks right.
  const { error: repinErr } = await admin
    .from('companion_profiles')
    .update({ rating_avg: 4.95 })
    .eq('user_id', (await demoCompanionId()) ?? '00000000-0000-0000-0000-000000000000');
  if (repinErr) {
    console.warn(`Rating repin warning: ${repinErr.message}`);
  } else {
    console.log('Demo companion rating_avg restored to 4.95.');
  }

  const after = {};
  for (const t of tables) after[t] = await count(t);
  console.log('\nAfter:');
  for (const t of tables) console.log(`  ${t.padEnd(16)} ${after[t]}`);

  console.log('\nReset complete. ✨');
}

async function demoCompanionId() {
  const { data, error } = await admin
    .from('users')
    .select('id')
    .eq('email', 'companion-demo@jmt.test')
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}

main().catch((err) => {
  console.error('\n💥 reset failed:', err.message);
  console.error(err.stack);
  process.exit(2);
});
