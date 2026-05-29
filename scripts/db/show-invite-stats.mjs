#!/usr/bin/env node
/* eslint-disable no-console */

// Invite-code attribution report.
//
// Lists every invite code with: code, note (channel label), cap, how
// many sign-ups it's brought in, and when it expires. Sorted by
// redemption count (most-used first) so the highest-converting
// channels float to the top.
//
// invite_codes and invite_redemptions are both RLS-locked tables; this
// script uses the service-role key to surface them. Same pattern as
// scripts/db/show-feedback.mjs.
//
// Usage:
//   set -a; source .env.local; set +a
//   node scripts/db/show-invite-stats.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(2);
}

function formatExpires(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const ms = d.getTime() - now;
  if (ms < 0) return `expired ${d.toLocaleDateString()}`;
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) return 'expires today';
  if (days < 30) return `in ${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatUses(usedCount, maxUses, redemptionCount) {
  const cap = maxUses === null ? 'unlimited' : String(maxUses);
  // used_count and the redemption count should match in normal
  // operation, but they can diverge if a release-on-failure path ran
  // (used_count decremented but audit row untouched). Show both when
  // they differ so the divergence is visible.
  const used = usedCount === redemptionCount ? `${redemptionCount}` : `${redemptionCount}/${usedCount}`;
  return `${used}/${cap}`;
}

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: codes, error: codesErr } = await admin
    .from('invite_codes')
    .select('id, code, note, max_uses, used_count, expires_at, created_at')
    .order('created_at', { ascending: false });
  if (codesErr) {
    console.error('Read invite_codes failed:', codesErr.message);
    process.exit(2);
  }
  if (!codes || codes.length === 0) {
    console.log('No invite codes yet. Mint some with scripts/db/mint-invite-codes.mjs. ✨');
    return;
  }

  // Count redemptions per code in one round trip — invite_redemptions
  // is small, full scan is fine. (At beta scale "small" = a few
  // thousand rows max.)
  const { data: redemptions, error: redErr } = await admin
    .from('invite_redemptions')
    .select('invite_code_id');
  if (redErr) {
    console.error('Read invite_redemptions failed:', redErr.message);
    process.exit(2);
  }
  const redemptionsByCode = new Map();
  for (const r of redemptions ?? []) {
    redemptionsByCode.set(r.invite_code_id, (redemptionsByCode.get(r.invite_code_id) ?? 0) + 1);
  }

  // Sort: most-redeemed first, then unused codes after (sorted by
  // newest first to keep mint-then-share UX natural — your freshest
  // unused codes are at the top of the unused section).
  const enriched = codes.map((c) => ({
    ...c,
    redemptions: redemptionsByCode.get(c.id) ?? 0,
  }));
  enriched.sort((a, b) => {
    if (b.redemptions !== a.redemptions) return b.redemptions - a.redemptions;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const totalSignups = enriched.reduce((acc, c) => acc + c.redemptions, 0);
  console.log(
    `\n${enriched.length} code(s)  ·  ${totalSignups} sign-up${totalSignups === 1 ? '' : 's'} attributed\n`,
  );

  for (const c of enriched) {
    const usesLabel = formatUses(c.used_count, c.max_uses, c.redemptions);
    const expiresLabel = formatExpires(c.expires_at);
    const noteLabel = c.note ? `"${c.note}"` : '(no note)';
    console.log(`  ${c.code.padEnd(18)}  ${usesLabel.padEnd(16)}  ${expiresLabel.padEnd(20)}  ${noteLabel}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('\n💥 show-invite-stats failed:', err.message);
  console.error(err.stack);
  process.exit(2);
});
