import type { Metadata } from 'next';
import { authAdminClient } from '@/lib/auth/db';
import { MintInviteForm } from './MintInviteForm';
import { InviteCodesTable, type InviteRow } from './InviteCodesTable';
import shared from '../styles.module.css';

export const metadata: Metadata = { title: 'Invites · Admin' };

// Attribution + minting are both low-traffic admin actions where stale
// numbers are confusing, so always render fresh. (The layout already
// gates this route through requireAdmin().)
export const dynamic = 'force-dynamic';

interface InviteCodeRow {
  id: string;
  code: string;
  note: string | null;
  max_uses: number | null;
  used_count: number | null;
  expires_at: string | null;
  created_at: string;
}

interface EnrichedCode extends InviteCodeRow {
  redemptions: number;
}

// Mirrors scripts/db/show-invite-stats.mjs formatExpires: relative-ish,
// "never" when null, surfaces expired codes.
function formatExpires(iso: string | null): { text: string; expired: boolean } {
  if (!iso) return { text: 'never', expired: false };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { text: iso, expired: false };
  const ms = d.getTime() - Date.now();
  if (ms < 0) return { text: `expired ${d.toLocaleDateString()}`, expired: true };
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) return { text: 'today', expired: false };
  if (days < 30) return { text: `in ${days}d`, expired: false };
  return {
    text: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    expired: false,
  };
}

function formatCreated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function AdminInvitesPage() {
  const admin = authAdminClient();

  // Read codes + all redemptions concurrently, then group redemption
  // counts per code in JS (invite_redemptions is small at beta scale, so
  // a full scan is fine — same approach as show-invite-stats.mjs).
  const [codesRes, redemptionsRes] = await Promise.all([
    admin
      .from('invite_codes')
      .select('id, code, note, max_uses, used_count, expires_at, created_at')
      .order('created_at', { ascending: false }),
    admin.from('invite_redemptions').select('invite_code_id'),
  ]);

  const codes: InviteCodeRow[] = codesRes.data ?? [];
  const redemptionRows: { invite_code_id: string }[] = redemptionsRes.data ?? [];

  const redemptionsByCode = new Map<string, number>();
  for (const r of redemptionRows) {
    redemptionsByCode.set(r.invite_code_id, (redemptionsByCode.get(r.invite_code_id) ?? 0) + 1);
  }

  // Most-redeemed first, then newest — keeps high-converting channels at
  // the top and freshly-minted unused codes just below.
  const enriched: EnrichedCode[] = codes
    .map((c) => ({ ...c, redemptions: redemptionsByCode.get(c.id) ?? 0 }))
    .sort((a, b) => {
      if (b.redemptions !== a.redemptions) return b.redemptions - a.redemptions;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const totalSignups = enriched.reduce((acc, c) => acc + c.redemptions, 0);

  // Pre-format display strings on the server so the interactive client
  // table has nothing locale/timezone-dependent to hydrate.
  const rows: InviteRow[] = enriched.map((c) => {
    const expires = formatExpires(c.expires_at);
    return {
      id: c.id,
      code: c.code,
      note: c.note,
      usesLabel: `${c.redemptions}/${c.max_uses === null ? '∞' : String(c.max_uses)}`,
      expiresText: expires.text,
      expiresExpired: expires.expired,
      createdText: formatCreated(c.created_at),
    };
  });

  return (
    <div className={shared.page}>
      <h1 className={shared.h1}>Invites</h1>
      <p className={shared.lede}>
        Mint shareable invite codes for each marketing channel, then track how many sign-ups each
        one brings in.
      </p>

      <MintInviteForm />

      <div>
        <p className={shared.lede} style={{ margin: '0 0 0.75rem' }}>
          {enriched.length} code{enriched.length === 1 ? '' : 's'} · {totalSignups} sign-up
          {totalSignups === 1 ? '' : 's'} attributed
        </p>

        {rows.length === 0 ? (
          <div className={shared.tableWrap}>
            <p className={shared.empty}>No invite codes yet. Mint your first one above.</p>
          </div>
        ) : (
          <>
            <p className={shared.help} style={{ margin: '0 0 0.5rem' }}>
              Tap any code to view &amp; copy its share messages again.
            </p>
            <InviteCodesTable rows={rows} />
          </>
        )}
      </div>
    </div>
  );
}
