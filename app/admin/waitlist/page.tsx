import type { Metadata } from 'next';
import { authAdminClient } from '@/lib/auth/db';
import shared from '../styles.module.css';
import styles from './styles.module.css';

export const metadata: Metadata = { title: 'Waitlist · Admin' };

// Always read fresh — the waitlist is a live demand signal during the
// region-by-region rollout, and a stale list could send us to the wrong
// city next. Cheap query, worth the round-trip.
export const dynamic = 'force-dynamic';

// Cap the read — admin is a human eyeballing demand, not a data export.
// Plenty of headroom for the early beta; the city summary still surfaces
// the signal even if we ever brush the ceiling.
const MAX_ROWS = 500;

// How many cities to surface in the "top cities" summary. The whole point
// is to pick the *next* region, so a short, scannable ranking beats a long
// tail of one-offs.
const TOP_CITIES = 8;

// Fallback bucket for rows where reverse-geocoding didn't yield a label
// (city is nullable — e.g. the user denied precise location).
const UNKNOWN_CITY = 'Unknown';

// One row out of public.waitlist. Columns confirmed against
// supabase/migrations/20260529000500_waitlist.sql.
interface WaitlistRow {
  id: string;
  email: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
  created_at: string;
}

// A city + how many people from it are waiting — the next-region ranking.
interface CityCount {
  city: string;
  count: number;
}

// "just now / 5m ago / 3h ago / 2d ago / Mar 4, 2026" — same ladder as the
// feedback inbox so the two admin surfaces read identically.
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

// "34.05, -118.24" — round to 2 decimals (≈1km) since this is a coarse
// demand heatmap, not navigation. Both must be present to render a pair.
function formatCoords(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

// Tally rows by city (null → "Unknown") and return the busiest first. Ties
// break alphabetically so the ordering is stable between reloads.
function topCities(rows: WaitlistRow[], limit: number): CityCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.city?.trim() || UNKNOWN_CITY;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([city, count]): CityCount => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
    .slice(0, limit);
}

export default async function AdminWaitlistPage() {
  const admin = authAdminClient();

  // Service role only — RLS denies anon/authenticated SELECT on this table.
  const { data } = await admin
    .from('waitlist')
    .select('id, email, lat, lng, city, created_at')
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  const rows = (data ?? []) as WaitlistRow[];
  const total = rows.length;
  const countLabel = total >= MAX_ROWS ? `${MAX_ROWS}+` : `${total}`;
  const cities = topCities(rows, TOP_CITIES);

  return (
    <div className={shared.page}>
      <h1 className={shared.h1}>Waitlist</h1>
      <p className={shared.lede}>
        {countLabel} {total === 1 ? 'person' : 'people'} outside the open service area who asked to
        be notified — the demand signal for deciding which region to open next.
      </p>

      {/* Top cities: the key signal for prioritizing the next region. Lives
          above the table so it's the first thing you read. */}
      {cities.length > 0 ? (
        <div className={shared.card}>
          <h2 className={shared.h2}>Top cities</h2>
          <p className={shared.help}>
            Where the waitlist is concentrated. Open the busiest region next.
          </p>
          <div className={styles.cities}>
            {cities.map((c) => (
              <span key={c.city} className={shared.pill}>
                {c.city} <span className={styles.cityCount}>· {c.count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {total === 0 ? (
        <div className={shared.empty}>No one on the waitlist yet.</div>
      ) : (
        <div className={shared.tableWrap}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Email</th>
                <th>City</th>
                <th>Coords</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const coords = formatCoords(row.lat, row.lng);
                return (
                  <tr key={row.id}>
                    <td className={styles.whenCell} title={fullWhen(row.created_at)}>
                      {formatWhen(row.created_at)}
                    </td>
                    <td>{row.email}</td>
                    <td>{row.city ?? <span className={shared.help}>—</span>}</td>
                    <td className={styles.coordsCell}>
                      {coords ?? <span className={shared.help}>—</span>}
                    </td>
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
