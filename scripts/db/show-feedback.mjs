#!/usr/bin/env node
/* eslint-disable no-console */

// Read the in-app "Report an issue" inbox.
//
// Feedback is collected in public.feedback_reports — RLS forbids client
// reads, so this script uses the service-role key to surface them.
//
// Usage:
//   set -a; source .env.local; set +a
//   node scripts/db/show-feedback.mjs                  # last 20 reports
//   node scripts/db/show-feedback.mjs --limit 50
//   node scripts/db/show-feedback.mjs --category bug
//   node scripts/db/show-feedback.mjs --since 7d        # last 7 days

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(2);
}

function parseArgs(argv) {
  const out = { limit: 20, category: null, sinceDays: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--limit' && next) {
      const n = parseInt(next, 10);
      out.limit = Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 20;
      i++;
    } else if (a === '--category' && next) {
      if (['bug', 'idea', 'complaint', 'other'].includes(next)) out.category = next;
      i++;
    } else if (a === '--since' && next) {
      const m = next.match(/^(\d+)d$/);
      if (m) out.sinceDays = parseInt(m[1], 10);
      i++;
    } else if (a === '--help' || a === '-h') {
      console.log(
        [
          'Usage:',
          '  show-feedback                       # last 20 reports',
          '  show-feedback --limit 50',
          '  show-feedback --category bug        # bug | idea | complaint | other',
          '  show-feedback --since 7d            # last N days',
        ].join('\n'),
      );
      process.exit(0);
    }
  }
  return out;
}

const CATEGORY_ICON = {
  bug: '🐞',
  idea: '💡',
  complaint: '😕',
  other: '💬',
};

function formatWhen(iso) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function wrapBody(body, width = 76, indent = '    ') {
  const words = String(body ?? '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = line ? line + ' ' + w : w;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let q = admin
    .from('feedback_reports')
    .select('id, user_id, category, body, url, created_at, user:users!feedback_reports_user_id_fkey(email, name)')
    .order('created_at', { ascending: false })
    .limit(args.limit);
  if (args.category) q = q.eq('category', args.category);
  if (args.sinceDays) {
    const since = new Date(Date.now() - args.sinceDays * 24 * 60 * 60 * 1000).toISOString();
    q = q.gte('created_at', since);
  }

  const { data, error } = await q;
  if (error) {
    console.error('Read failed:', error.message);
    process.exit(2);
  }
  if (!data || data.length === 0) {
    console.log('No feedback yet. ✨');
    return;
  }

  console.log(
    `\n${data.length} report${data.length === 1 ? '' : 's'}${
      args.category ? `  (category: ${args.category})` : ''
    }${args.sinceDays ? `  (last ${args.sinceDays}d)` : ''}\n`,
  );

  for (const r of data) {
    const icon = CATEGORY_ICON[r.category] ?? '•';
    const u = r.user ?? null;
    const who = u?.name ? `${u.name}  <${u.email}>` : (u?.email ?? r.user_id);
    console.log(`${icon}  ${r.category.padEnd(10)} ${formatWhen(r.created_at)}`);
    console.log(`    from: ${who}`);
    if (r.url) console.log(`    page: ${r.url}`);
    console.log(wrapBody(r.body));
    console.log('');
  }
}

main().catch((err) => {
  console.error('\n💥 show-feedback failed:', err.message);
  console.error(err.stack);
  process.exit(2);
});
