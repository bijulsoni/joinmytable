import type { Metadata } from 'next';
import { authAdminClient } from '@/lib/auth/db';
import VerificationActions from './VerificationActions';
import shared from '../styles.module.css';
import styles from './styles.module.css';

export const metadata: Metadata = { title: 'Verifications · Admin' };

// Signed image URLs expire after 1h and the pending set changes as we
// approve/reject, so always render fresh — no caching.
export const dynamic = 'force-dynamic';

// Signed URLs live for one hour: long enough to click through and review,
// short enough that a stray paste doesn't leak the document forever.
const SIGNED_URL_TTL = 60 * 60;

type PendingUser = {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string | null;
  /** 'new' = brand-new applicant (verification_status='pending').
   *  'id_upgrade' = already-Basic companion who uploaded a government ID
   *  and is awaiting full-ID review (stays discoverable meanwhile). */
  kind: 'new' | 'id_upgrade';
};

type Applicant = PendingUser & {
  bio: string | null;
  serviceArea: string | null;
  idUrl: string | null;
  selfieUrl: string | null;
};

// Lightweight "x ago" — no shared helper exists, and this is the only
// place that needs it. Granularity is intentionally coarse.
function relativeTime(iso: string | null): string {
  if (!iso) return 'an unknown time';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'an unknown time';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const units: Array<[label: string, secs: number]> = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [label, secs] of units) {
    const value = Math.floor(seconds / secs);
    if (value >= 1) return `${value} ${label}${value === 1 ? '' : 's'}`;
  }
  return 'moments';
}

// Resolve a pending user's uploaded ID + selfie into 1-hour signed URLs.
// Filenames are id-<ts>.<ext> and selfie-<ts>.<ext> under a <userId>/ prefix
// in the `verification` bucket — exactly as listPending() does in
// scripts/db/verify-companion.mjs.
async function loadApplicant(
  admin: ReturnType<typeof authAdminClient>,
  user: PendingUser,
): Promise<Applicant> {
  // Companion profile is optional — they may have applied before filling
  // out a full profile.
  const { data: cp } = await admin
    .from('companion_profiles')
    .select('bio, service_area')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: files } = await admin.storage
    .from('verification')
    .list(user.id, { sortBy: { column: 'created_at', order: 'desc' } });

  const list: Array<{ name: string }> = files ?? [];
  const idFile = list.find((f) => f.name.startsWith('id-'));
  const selfieFile = list.find((f) => f.name.startsWith('selfie-'));

  async function sign(name: string | undefined): Promise<string | null> {
    if (!name) return null;
    const { data: signed } = await admin.storage
      .from('verification')
      .createSignedUrl(`${user.id}/${name}`, SIGNED_URL_TTL);
    return signed?.signedUrl ?? null;
  }

  const [idUrl, selfieUrl] = await Promise.all([sign(idFile?.name), sign(selfieFile?.name)]);

  return {
    ...user,
    bio: cp?.bio ?? null,
    serviceArea: cp?.service_area ?? null,
    idUrl,
    selfieUrl,
  };
}

export default async function VerificationsPage() {
  const admin = authAdminClient();

  // Two streams feed the review queue:
  //   1) Brand-new applicants — users.verification_status = 'pending'.
  const { data: pendingRaw } = await admin
    .from('users')
    .select('id, name, email, created_at')
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);

  //   2) Already-Basic companions who uploaded a government ID and are
  //      awaiting full-ID review. They stay 'verified' (so they keep their
  //      Explore visibility) and therefore never appear via the status
  //      filter above — id_submitted_at (set, with id_verified_at NULL) is
  //      the signal that surfaces them here.
  const { data: upgradeProfiles } = await admin
    .from('companion_profiles')
    .select('user_id, id_submitted_at')
    .not('id_submitted_at', 'is', null)
    .is('id_verified_at', null)
    .order('id_submitted_at', { ascending: true })
    .limit(50);

  const upgradeIds = (upgradeProfiles ?? [])
    .map((p: { user_id: string | null }) => p.user_id)
    .filter((x: string | null): x is string => Boolean(x));

  let upgradeUsersRaw: Array<Omit<PendingUser, 'kind'>> = [];
  if (upgradeIds.length > 0) {
    const { data } = await admin
      .from('users')
      .select('id, name, email, created_at')
      .in('id', upgradeIds);
    upgradeUsersRaw = (data as Array<Omit<PendingUser, 'kind'>> | null) ?? [];
  }

  // Merge + dedupe by id. A 'pending' (new) applicant takes precedence over
  // an id_upgrade tag if somehow both apply.
  const byId = new Map<string, PendingUser>();
  for (const u of upgradeUsersRaw) {
    byId.set(u.id, { ...u, kind: 'id_upgrade' });
  }
  for (const u of (pendingRaw as Array<Omit<PendingUser, 'kind'>> | null) ?? []) {
    byId.set(u.id, { ...u, kind: 'new' });
  }
  const queue = [...byId.values()];

  const applicants = await Promise.all(queue.map((u) => loadApplicant(admin, u)));

  return (
    <div className={shared.page}>
      <h1 className={shared.h1}>Verifications</h1>
      <p className={shared.lede}>
        Approve <strong>Basic</strong> on a good selfie (gets them into Explore), or{' '}
        <strong>Full ID</strong> when a government ID checks out against the selfie (lets them
        accept meets). Reject sends them back to unverified.
      </p>

      {applicants.length === 0 ? (
        <div className={`${shared.card} ${shared.empty}`}>No pending verifications ✨</div>
      ) : (
        applicants.map((a) => (
          <div key={a.id} className={shared.card}>
            <div className={styles.applicant}>
              <div className={styles.head}>
                <span className={styles.name}>{a.name ?? 'Unnamed applicant'}</span>
                <span className={styles.meta}>
                  {a.email ?? 'no email'} · applied {relativeTime(a.created_at)} ago
                </span>
              </div>

              {a.kind === 'id_upgrade' ? (
                <p className={styles.context}>
                  <strong>Full-ID review</strong> — already live as Basic. They added a government
                  ID; approve <strong>Full ID</strong> to let them accept meets.
                </p>
              ) : null}

              {a.serviceArea ? (
                <p className={styles.context}>
                  <strong>Service area:</strong> {a.serviceArea}
                </p>
              ) : null}
              {a.bio ? <p className={styles.context}>{a.bio}</p> : null}

              <div className={styles.images}>
                <div className={styles.tile}>
                  <span className={styles.tileLabel}>Government ID</span>
                  {a.idUrl ? (
                    <a
                      className={styles.thumbLink}
                      href={a.idUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className={styles.thumb}
                        src={a.idUrl}
                        alt={`ID for ${a.name ?? a.id}`}
                      />
                    </a>
                  ) : (
                    <div className={styles.missing}>(no upload)</div>
                  )}
                </div>

                <div className={styles.tile}>
                  <span className={styles.tileLabel}>Selfie</span>
                  {a.selfieUrl ? (
                    <a
                      className={styles.thumbLink}
                      href={a.selfieUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className={styles.thumb}
                        src={a.selfieUrl}
                        alt={`Selfie for ${a.name ?? a.id}`}
                      />
                    </a>
                  ) : (
                    <div className={styles.missing}>(no upload)</div>
                  )}
                </div>
              </div>

              <div className={styles.footer}>
                <VerificationActions userId={a.id} email={a.email} hasId={a.idUrl !== null} />
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
