'use client';

// Interactive activity tiles on the companion profile.
//
// Renders one tile per activity the companion offers. Each tile is a
// tap target showing the activity icon, label, and fee. Selecting a
// tile updates the sticky CTA's text + deep link so the seeker can go
// straight to the request form for that specific activity.

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { ActivityIcon } from '@/components/activity';
import { ACTIVITY_TYPE_META, type ActivityType } from '@/lib/types';
import styles from './styles.module.css';

interface Props {
  companionId: string;
  offered: ActivityType[];
  rates: Partial<Record<ActivityType, number>>;
  /** First activity to highlight by default. */
  initial?: ActivityType;
}

export function ActivityPicker({ companionId, offered, rates, initial }: Props) {
  const [selected, setSelected] = useState<ActivityType>(initial ?? offered[0]!);

  return (
    <>
      <div className={styles.activityTiles} role="radiogroup" aria-label="Pick an activity">
        {offered.map((activity) => {
          const meta = ACTIVITY_TYPE_META[activity];
          const rate = rates[activity];
          const isSelected = selected === activity;
          return (
            <button
              key={activity}
              type="button"
              role="radio"
              aria-checked={isSelected}
              data-activity={activity}
              className={`${styles.activityTile} ${isSelected ? styles.activityTileSelected : ''}`}
              onClick={() => setSelected(activity)}
            >
              <span className={styles.activityTileIcon}>
                <ActivityIcon activity={activity} width={20} height={20} />
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

      <div className={styles.stickyCta} data-activity={selected}>
        <Button
          as={Link}
          href={`/requests?companion=${companionId}&activity=${selected}`}
          fullWidth
        >
          Request {ACTIVITY_TYPE_META[selected].label.toLowerCase()}
          {typeof rates[selected] === 'number' ? ` · $${rates[selected]}` : ''}
        </Button>
      </div>
    </>
  );
}
