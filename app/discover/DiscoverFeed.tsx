'use client';

// Feed-first discovery surface.
//
//   - Server pre-fetches all verified companions and passes them as a
//     prop. The default view is read-only: photos, names, ratings,
//     activity tags. No location prompt, no required search.
//
//   - Filters (activity + service-area keyword) are collapsed by default.
//     Expanding "Refine" lets the user narrow the feed entirely
//     client-side over the prefetched list.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { ActivityIcon } from '@/components/activity';
import { ACTIVITY_TYPE_META, ACTIVITY_TYPES, type ActivityType } from '@/lib/types';
import styles from './styles.module.css';

export interface FeedCompanion {
  user_id: string;
  name: string;
  bio: string | null;
  service_area: string | null;
  photo_url: string | null;
  rating_avg: number | null;
  activities: ActivityType[];
  rates: Partial<Record<ActivityType, number>>;
  verified: boolean;
}

interface Props {
  companions: FeedCompanion[];
  fetchError: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function DiscoverFeed({ companions, fetchError }: Props) {
  const [activityFilter, setActivityFilter] = useState<ActivityType | null>(null);
  const [areaQuery, setAreaQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    return companions.filter((c) => {
      if (activityFilter && !c.activities.includes(activityFilter)) return false;
      if (
        areaQuery.trim() &&
        !(c.service_area ?? '').toLowerCase().includes(areaQuery.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [companions, activityFilter, areaQuery]);

  const total = companions.length;

  return (
    <div className={styles.feedShell}>
      <header className={styles.feedHero}>
        <div className={styles.heroEyebrow}>
          <span className={styles.heroEyebrowDot} />
          {total} verified companion{total === 1 ? '' : 's'} ready to share a table
        </div>
        <h1 className={styles.heroTitle}>
          Find your <span className={styles.heroTitleAccent}>table&nbsp;mate</span>.
        </h1>
        <p className={styles.heroLede}>
          Browse companions near you. Tap into a profile to see their full availability, rates, and
          send a request.
        </p>
      </header>

      <section className={styles.activityRail} aria-label="Filter by activity">
        <button
          type="button"
          className={`${styles.chip} ${activityFilter === null ? styles.chipActive : ''}`}
          aria-pressed={activityFilter === null}
          onClick={() => setActivityFilter(null)}
        >
          All activities
        </button>
        {ACTIVITY_TYPES.map((a) => (
          <button
            key={a}
            type="button"
            data-activity={a}
            className={`${styles.chip} ${activityFilter === a ? styles.chipActive : ''}`}
            aria-pressed={activityFilter === a}
            onClick={() => setActivityFilter(activityFilter === a ? null : a)}
          >
            <ActivityIcon activity={a} width={16} height={16} />
            {ACTIVITY_TYPE_META[a].label}
          </button>
        ))}
      </section>

      <details
        className={styles.refineDetails}
        open={filtersOpen}
        onToggle={(e) => setFiltersOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className={styles.refineSummary}>
          <span aria-hidden>⚙</span> Refine by area
        </summary>
        <div className={styles.refineBody}>
          <label className={styles.refineLabel}>
            <span>Service area</span>
            <input
              type="text"
              className={styles.refineInput}
              placeholder="e.g. Mission, SoMa, Downtown"
              value={areaQuery}
              onChange={(e) => setAreaQuery(e.target.value)}
            />
          </label>
          <p className={styles.refineHint}>
            Filters the feed client-side over already-loaded companions. Full geo search lands in
            the next phase.
          </p>
        </div>
      </details>

      {fetchError ? (
        <div className={styles.errorBanner}>
          We couldn&apos;t load companions just now. {fetchError}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon} aria-hidden>
            ☕
          </div>
          <h2 className={styles.emptyTitle}>No companions match these filters</h2>
          <p className={styles.emptyText}>Try a different activity or clear the area filter.</p>
          <button
            type="button"
            className={styles.emptyResetButton}
            onClick={() => {
              setActivityFilter(null);
              setAreaQuery('');
            }}
          >
            Reset filters
          </button>
        </div>
      ) : (
        <ul className={styles.grid}>
          {filtered.map((c) => (
            <li key={c.user_id} className={styles.cardItem}>
              <Link
                href={`/companions/${c.user_id}`}
                className={styles.card}
                aria-label={`${c.name}'s profile`}
              >
                <div className={styles.cardPhoto}>
                  {c.photo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={c.photo_url} alt="" className={styles.cardImg} />
                  ) : (
                    <div
                      className={styles.cardInitials}
                      data-activity={c.activities[0] ?? 'lunch'}
                      aria-hidden
                    >
                      {initials(c.name)}
                    </div>
                  )}
                  {c.verified ? (
                    <span className={styles.verifiedBadge} title="Verified">
                      ✓ Verified
                    </span>
                  ) : null}
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardName}>{c.name}</h3>
                  {c.service_area ? (
                    <p className={styles.cardArea}>
                      <span aria-hidden>📍</span> {c.service_area}
                    </p>
                  ) : null}
                  {c.bio ? <p className={styles.cardBio}>{c.bio}</p> : null}
                  <div className={styles.cardActivities}>
                    {c.activities.map((a) => (
                      <Badge key={a} activity={a}>
                        {ACTIVITY_TYPE_META[a].label}
                        {c.rates[a] !== undefined ? ` · $${c.rates[a]}` : ''}
                      </Badge>
                    ))}
                  </div>
                  {c.rating_avg !== null && c.rating_avg > 0 ? (
                    <p className={styles.cardRating}>
                      <span className={styles.starFilled} aria-hidden>
                        ★
                      </span>
                      {c.rating_avg.toFixed(1)}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
