'use client';

// One-page request composer on the companion profile.
//
// Replaces the old two-step "pick activity → deep link to /requests" flow.
// User picks an activity tile, the form for that activity reveals below,
// and a single sticky "Send request" CTA posts straight to /api/requests
// then navigates to /plans. Saves three transitions vs. the old flow.
//
// The form fields stay hidden until the first activity tap so the screen
// isn't cluttered with empty inputs on entry. Once revealed they persist
// across activity switches — only the fee preview + CTA label re-skin.

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Textarea } from '@/components/ui';
import { ActivityIcon } from '@/components/activity';
import { StatusMessage } from '@/components/StatusMessage';
import { ACTIVITY_TYPE_META, BUDGET_TIERS, type ActivityType, type BudgetTier } from '@/lib/types';
import styles from './styles.module.css';

interface Props {
  companionId: string;
  companionFirstName: string;
  offered: ActivityType[];
  rates: Partial<Record<ActivityType, number>>;
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: {
      fieldErrors?: Record<string, string[]>;
      formErrors?: string[];
    };
  };
}

const FIELD_LABELS: Record<string, string> = {
  companion_id: 'Companion',
  activity_type: 'Activity',
  proposed_time: 'Date & time',
  venue_name: 'Venue name',
  venue_location: 'Neighborhood or address',
  budget_tier: 'Budget tier',
  message: 'Message',
};

function toDateString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayLocal(): string {
  return toDateString(new Date());
}

// Pick a sensible default date+time. If the canonical-of-the-day moment
// for the activity (12:30 lunch, 7pm dinner, etc.) is already past, snap
// to tomorrow. Always returns a wall-clock moment at least ~1h away.
function nextSensibleDefault(timeStr: string): { date: string; time: string } {
  const now = new Date();
  const parts = timeStr.split(':').map((s) => Number(s));
  const h = parts[0] ?? 12;
  const m = parts[1] ?? 0;
  const today = new Date(now);
  today.setHours(h, m, 0, 0);
  const targetDate =
    today.getTime() < now.getTime() + 60 * 60 * 1000
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
      : now;
  return { date: toDateString(targetDate), time: timeStr };
}

function combineDateTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const composed = new Date(`${date}T${time}`);
  if (Number.isNaN(composed.getTime())) return null;
  return composed.toISOString();
}

function isFutureDateTime(date: string, time: string): boolean {
  const composed = new Date(`${date}T${time}`);
  if (Number.isNaN(composed.getTime())) return false;
  return composed.getTime() > Date.now() + 60 * 1000;
}

function formatFieldErrors(
  details: NonNullable<ApiErrorBody['error']>['details'] | undefined,
): string | null {
  if (!details) return null;
  const parts: string[] = [];
  for (const [field, errs] of Object.entries(details.fieldErrors ?? {})) {
    if (!Array.isArray(errs) || errs.length === 0) continue;
    parts.push(`${FIELD_LABELS[field] ?? field}: ${errs[0]}`);
  }
  for (const err of details.formErrors ?? []) parts.push(err);
  return parts.length ? parts.join(' · ') : null;
}

// Canonical "of the day" time per activity, used to seed the date+time
// inputs the first time an activity is picked.
const ACTIVITY_DEFAULT_TIME: Record<ActivityType, string> = {
  coffee: '10:00',
  lunch: '12:30',
  happy_hour: '17:30',
  dinner: '19:00',
};

export function RequestComposer({ companionId, companionFirstName, offered, rates }: Props) {
  const router = useRouter();
  const [activity, setActivity] = useState<ActivityType | null>(null);

  const seedDefault = useMemo(() => nextSensibleDefault('12:30'), []);
  const [date, setDate] = useState(seedDefault.date);
  const [time, setTime] = useState(seedDefault.time);
  const [venueName, setVenueName] = useState('');
  const [venueLocation, setVenueLocation] = useState('');
  const [budget, setBudget] = useState<BudgetTier>('$$');
  const [message, setMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleActivityPick = useCallback(
    (next: ActivityType) => {
      const isSwitching = activity !== null && activity !== next;
      setActivity(next);
      // Only re-seed the date/time when this is the first tap — we don't
      // want to clobber a user who picked a custom moment then switched
      // tile to compare fees.
      if (activity === null) {
        const seeded = nextSensibleDefault(ACTIVITY_DEFAULT_TIME[next]);
        setDate(seeded.date);
        setTime(seeded.time);
      } else if (isSwitching) {
        // No-op — keep whatever the user already entered.
      }
    },
    [activity],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitError(null);

      if (!activity) {
        setSubmitError('Pick an activity.');
        return;
      }
      const proposedTime = combineDateTime(date, time);
      if (!proposedTime) {
        setSubmitError('Pick a valid date and time.');
        return;
      }
      if (!isFutureDateTime(date, time)) {
        setSubmitError('Pick a date and time in the future.');
        return;
      }
      if (!venueName.trim()) {
        setSubmitError('Venue name is required.');
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch('/api/requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            companion_id: companionId,
            activity_type: activity,
            proposed_time: proposedTime,
            venue_name: venueName.trim(),
            venue_location: venueLocation.trim() || undefined,
            budget_tier: budget,
            message: message.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
          const fieldDetail = formatFieldErrors(body.error?.details);
          throw new Error(fieldDetail ?? body.error?.message ?? `Request failed (${res.status}).`);
        }
        router.push('/plans?sent=1');
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Could not send your request.');
      } finally {
        setSubmitting(false);
      }
    },
    [activity, companionId, date, time, venueName, venueLocation, budget, message, router],
  );

  const fee = activity ? rates[activity] : undefined;
  const ctaLabel = activity
    ? `Send request — ${ACTIVITY_TYPE_META[activity].label.toLowerCase()}${
        typeof fee === 'number' ? ` · $${fee}` : ''
      }`
    : 'Pick an activity to continue';

  return (
    <>
      <div className={styles.activityTiles} role="radiogroup" aria-label="Pick an activity">
        {offered.map((a) => {
          const meta = ACTIVITY_TYPE_META[a];
          const rate = rates[a];
          const isSelected = activity === a;
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={isSelected}
              data-activity={a}
              className={`${styles.activityTile} ${isSelected ? styles.activityTileSelected : ''}`}
              onClick={() => handleActivityPick(a)}
            >
              <span className={styles.activityTileIcon}>
                <ActivityIcon activity={a} width={20} height={20} />
              </span>
              <span className={styles.activityTileLabel}>{meta.label}</span>
              <span className={styles.activityTilePrice}>
                {typeof rate === 'number' ? `$${rate}` : '—'}
                <span className={styles.activityTilePriceSuffix}> / session</span>
              </span>
              {isSelected ? (
                <span className={styles.activityTileCheck} aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <form
        className={styles.composerForm}
        onSubmit={handleSubmit}
        noValidate
        aria-hidden={activity === null}
        data-revealed={activity !== null}
      >
        {submitError ? <StatusMessage tone="error">{submitError}</StatusMessage> : null}

        <div className={styles.composerSection}>
          <span className={styles.composerSectionLabel}>When</span>
          <div className={styles.composerDateRow}>
            <Input
              type="date"
              label={<span className="sr-only">Date</span>}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={todayLocal()}
              required
              disabled={activity === null}
            />
            <Input
              type="time"
              label={<span className="sr-only">Time</span>}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              disabled={activity === null}
            />
          </div>
        </div>

        <Input
          label="Venue name"
          help="Public venue only — café, restaurant, or bar."
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          required
          disabled={activity === null}
          placeholder={
            activity
              ? `e.g. ${
                  ACTIVITY_TYPE_META[activity].venue === 'cafe' ? 'Blue Bottle' : 'a local spot'
                }`
              : 'A public venue'
          }
        />

        <Input
          label="Neighborhood or address"
          help="Helps your companion confirm the spot works for them."
          optional
          value={venueLocation}
          onChange={(e) => setVenueLocation(e.target.value)}
          disabled={activity === null}
          placeholder="e.g. Hayes Valley, San Francisco"
        />

        <div className={styles.composerSection}>
          <span className={styles.composerSectionLabel}>
            Budget tier (your max for the activity bill)
          </span>
          <div className={styles.composerBudgetRow} role="group" aria-label="Budget tier">
            {BUDGET_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                className={styles.composerBudgetButton}
                aria-pressed={budget === tier}
                onClick={() => setBudget(tier)}
                disabled={activity === null}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          label="Message"
          optional
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={activity === null}
          placeholder={
            activity
              ? `Anything ${companionFirstName} should know — dietary needs, a topic to chat about.`
              : 'Anything they should know.'
          }
        />

        {activity ? (
          <Card variant="flat" padded>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <span style={{ fontWeight: 600 }}>{ACTIVITY_TYPE_META[activity].label} fee</span>
              <span style={{ fontWeight: 700 }}>{typeof fee === 'number' ? `$${fee}` : '—'}</span>
            </div>
            <p
              style={{
                margin: '0.5rem 0 0',
                fontSize: '0.8125rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              You also cover the activity bill at the venue. The companion fee is held in escrow
              until after your meet.
            </p>
          </Card>
        ) : null}

        <div className={styles.stickyCta}>
          <Button
            type="submit"
            fullWidth
            loading={submitting}
            disabled={activity === null || submitting}
          >
            {ctaLabel}
          </Button>
        </div>
      </form>
    </>
  );
}
