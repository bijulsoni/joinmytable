import type { Metadata } from 'next';
import Link from 'next/link';
import { authAdminClient } from '@/lib/auth/db';
import shared from '../styles.module.css';
import styles from './styles.module.css';

export const metadata: Metadata = { title: 'Feedback · Admin' };

// Always read fresh — feedback trickles in during the beta and a stale
// inbox is worse than a slightly slower page load.
export const dynamic = 'force-dynamic';

// Mirrors the in-app reporter (components/app/ReportIssueDialog.tsx) and
// scripts/db/show-feedback.mjs: same four categories, same emoji labels.
type Category = 'bug' | 'idea' | 'complaint' | 'other';
type TimeWindow = 'all' | '7d' | '30d';

const CATEGORIES: Category[] = ['bug', 'idea', 'complaint', 'other'];

// Short labels for the filter chips + table pills. The dialog uses fuller
// phrasings; here we keep them terse for a dense internal tool.
const CATEGORY_LABEL: Record<Category, string> = {
  bug: 'Bug',
  idea: 'Idea',
  complaint: 'Complaint',
  other: 'Other',
};

const CATEGORY_ICON: Record<Category, string> = {
  bug: '🐞',
  idea: '💡',
  complaint: '😕',
  other: '💬',
};

// Days each non-"all" window covers. Drives the created_at floor.
const WINDOW_DAYS: Record<Exclude<TimeWindow, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
};

const WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

// Cap the read — admin is a human reading prose, not a data export.
const MAX_ROWS = 200;

// One row out of feedback_reports. Columns confirmed against
// scripts/db/show-feedback.mjs + app/api/feedback/route.ts.
interface FeedbackRow {
  id: string;
  user_id: string | null;
  category: string;
  body: string;
  url: string | null;
  created_at: string;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
}

// "just now / 5m ago / 3h ago / 2d ago / Mar 4, 2026" — same ladder as the
// CLI inbox script so the two surfaces read identically.
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Full, unambiguous timestamp for the cell's title attribute on hover.
function fullWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Keep the Page column from blowing out the table on long query strings.
function truncate(value: string, max = 48): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Narrow an arbitrary searchParam to a known category, else null (= "all").
function parseCategory(raw: string | string[] | undefined): Category | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && (CATEGORIES as string[]).includes(value) ? (value as Category) : null;
}

function parseWindow(raw: string | string[] | undefined): TimeWindow {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '7d' || value === '30d' ? value : 'all';
}

// Build the ?category=…&window=… href for a filter link, omitting defaults
// so the URL stays clean.
function filterHref(category: Category | null, window: TimeWindow): string {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (window !== 'all') params.set('window', window);
  const qs = params.toString();
  return qs ? `?${qs}` : '/admin/feedback';
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  // Next 15: searchParams is a Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const activeCategory = parseCategory(sp.category);
  const activeWindow = parseWindow(sp.window);

  const admin = authAdminClient();

  let query = admin
    .from('feedback_reports')
    .select('id, user_id, category, body, url, created_at')
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (activeCategory) query = query.eq('category', activeCategory);
  if (activeWindow !== 'all') {
    const since = new Date(
      Date.now() - WINDOW_DAYS[activeWindow] * 24 * 60 * 60 * 1000,
    ).toISOString();
    query = query.gte('created_at', since);
  }

  const { data: reportsData } = await query;
  const reports = (reportsData ?? []) as FeedbackRow[];

  // Resolve reporters in a single batch lookup rather than N queries — same
  // data show-feedback.mjs surfaces, just gathered up front.
  const userIds = [...new Set(reports.map((r) => r.user_id).filter((id): id is string => !!id))];
  const usersById = new Map<string, UserRow>();
  if (userIds.length > 0) {
    const { data: usersData } = await admin
      .from('users')
      .select('id, name, email')
      .in('id', userIds);
    for (const u of (usersData ?? []) as UserRow[]) usersById.set(u.id, u);
  }

  const total = reports.length;
  const countLabel = total >= MAX_ROWS ? `${MAX_ROWS}+` : `${total}`;

  return (
    <div className={shared.page}>
      <h1 className={shared.h1}>Feedback</h1>
      <p className={shared.lede}>
        {countLabel} report{total === 1 ? '' : 's'} from the in-app reporter
        {activeCategory ? ` · ${CATEGORY_LABEL[activeCategory].toLowerCase()}` : ''}
        {activeWindow !== 'all' ? ` · last ${WINDOW_DAYS[activeWindow]} days` : ''}.
      </p>

      {/* Server-driven filters: plain links that set the querystring. No
          client JS — the page re-renders with the new searchParams. */}
      <div className={styles.filterBar}>
        <div className={styles.chips} role="group" aria-label="Category">
          <Link
            href={filterHref(null, activeWindow)}
            className={`${styles.chip} ${activeCategory === null ? styles.chipActive : ''}`}
            aria-current={activeCategory === null ? 'true' : undefined}
          >
            All
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={filterHref(c, activeWindow)}
              className={`${styles.chip} ${activeCategory === c ? styles.chipActive : ''}`}
              aria-current={activeCategory === c ? 'true' : undefined}
            >
              <span aria-hidden>{CATEGORY_ICON[c]}</span> {CATEGORY_LABEL[c]}
            </Link>
          ))}
        </div>

        <div className={styles.windows} role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <Link
              key={w.value}
              href={filterHref(activeCategory, w.value)}
              className={`${styles.chip} ${activeWindow === w.value ? styles.chipActive : ''}`}
              aria-current={activeWindow === w.value ? 'true' : undefined}
            >
              {w.label}
            </Link>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <div className={shared.empty}>
          {activeCategory || activeWindow !== 'all'
            ? 'No feedback matches these filters.'
            : 'No feedback yet. ✨'}
        </div>
      ) : (
        <div className={shared.tableWrap}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Category</th>
                <th>From</th>
                <th>Page</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const category = (CATEGORIES as string[]).includes(r.category)
                  ? (r.category as Category)
                  : null;
                const user = r.user_id ? usersById.get(r.user_id) : undefined;
                return (
                  <tr key={r.id}>
                    <td className={styles.whenCell} title={fullWhen(r.created_at)}>
                      {formatWhen(r.created_at)}
                    </td>
                    <td>
                      <span className={shared.pill}>
                        <span aria-hidden>{category ? CATEGORY_ICON[category] : '•'}</span>{' '}
                        {category ? CATEGORY_LABEL[category] : r.category}
                      </span>
                    </td>
                    <td className={styles.fromCell}>
                      {user ? (
                        <>
                          {user.name ? <span className={styles.fromName}>{user.name}</span> : null}
                          {user.email ? (
                            <span className={styles.fromEmail}>{user.email}</span>
                          ) : null}
                          {!user.name && !user.email ? (
                            <span className={shared.help}>unknown user</span>
                          ) : null}
                        </>
                      ) : (
                        <span className={shared.help}>anonymous</span>
                      )}
                    </td>
                    <td className={styles.pageCell}>
                      {r.url ? (
                        <span className={styles.pageUrl} title={r.url}>
                          {truncate(r.url)}
                        </span>
                      ) : (
                        <span className={shared.help}>—</span>
                      )}
                    </td>
                    <td className={styles.messageCell}>{r.body}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
