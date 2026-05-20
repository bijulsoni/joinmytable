#!/usr/bin/env node
/* eslint-disable no-console */

// Mint invite codes for the beta.
//
// Codes are short, human-shareable strings like "TABLE-7Q3R-N8" — three
// dash-separated groups, alphanumeric, easy to dictate over the phone.
// Each code carries a max_uses cap (defaults to 1 so each share is
// single-use) and optional expiry + note.
//
// Usage:
//   set -a; source .env.local; set +a
//   node scripts/db/mint-invite-codes.mjs                  # 5 single-use codes
//   node scripts/db/mint-invite-codes.mjs --count 10
//   node scripts/db/mint-invite-codes.mjs --count 1 --max-uses 50 --note "twitter thread"
//   node scripts/db/mint-invite-codes.mjs --expires-days 14
//
// Prints the codes to stdout, one per line — ready to copy/paste into
// DMs to your friend circle.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(2);
}

function parseArgs(argv) {
  const out = { count: 5, maxUses: 1, expiresDays: null, note: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--count' && next) {
      out.count = Math.max(1, Math.min(200, parseInt(next, 10) || 1));
      i++;
    } else if (a === '--max-uses' && next) {
      const n = parseInt(next, 10);
      out.maxUses = Number.isFinite(n) && n > 0 ? n : 1;
      i++;
    } else if (a === '--expires-days' && next) {
      const n = parseInt(next, 10);
      out.expiresDays = Number.isFinite(n) && n > 0 ? n : null;
      i++;
    } else if (a === '--note' && next) {
      out.note = String(next);
      i++;
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: mint-invite-codes [--count N] [--max-uses N] [--expires-days N] [--note "..."]');
      process.exit(0);
    }
  }
  return out;
}

// Alphabet: no 0/O, no 1/I/L — so dictation works.
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomSegment(len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  }
  return s;
}

function mintCode() {
  // TABLE-XXXX-XX is short enough to dictate, distinctive enough to
  // not be confused for anything else in the wild.
  return `TABLE-${randomSegment(4)}-${randomSegment(2)}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const expiresAt =
    args.expiresDays === null
      ? null
      : new Date(Date.now() + args.expiresDays * 24 * 60 * 60 * 1000).toISOString();

  console.log(
    `\nMinting ${args.count} code(s)  ·  max_uses=${args.maxUses}  ·  ` +
      `expires=${expiresAt ?? 'never'}${args.note ? `  ·  note="${args.note}"` : ''}\n`,
  );

  const rows = [];
  for (let i = 0; i < args.count; i++) {
    rows.push({
      code: mintCode(),
      note: args.note,
      max_uses: args.maxUses,
      expires_at: expiresAt,
    });
  }

  const { data, error } = await admin
    .from('invite_codes')
    .insert(rows)
    .select('code');
  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(2);
  }
  for (const r of data ?? []) {
    console.log(r.code);
  }
  console.log(`\n${(data ?? []).length} code(s) created. Share away. ✨`);
}

main().catch((err) => {
  console.error('\n💥 mint failed:', err.message);
  console.error(err.stack);
  process.exit(2);
});
