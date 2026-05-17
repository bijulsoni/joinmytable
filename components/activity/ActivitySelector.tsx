'use client';

// Activity-type picker used everywhere a screen needs the user to choose
// one or more of the four MVP activities (CLAUDE.md core rule #1).
//
// Modes:
//   - `mode="single"`  - returns the picked ActivityType (or null when
//     `allowDeselect` is set and the user taps the active tile again).
//   - `mode="multi"`   - returns the current ActivityType[] selection.
//
// Pass `available` to restrict the visible tiles (used on the request
// form, where we only show activities the companion offers).

import { ACTIVITY_TYPE_META, ACTIVITY_TYPES, type ActivityType } from '@/lib/types';
import { ActivityIcon } from './ActivityIcon';
import styles from './ActivitySelector.module.css';

interface SingleProps {
  mode?: 'single';
  value: ActivityType | null;
  onChange: (next: ActivityType | null) => void;
  available?: readonly ActivityType[];
  allowDeselect?: boolean;
  className?: string;
  showFeeHint?: boolean;
}

interface MultiProps {
  mode: 'multi';
  value: readonly ActivityType[];
  onChange: (next: ActivityType[]) => void;
  available?: readonly ActivityType[];
  className?: string;
  showFeeHint?: boolean;
}

type ActivitySelectorProps = SingleProps | MultiProps;

function isSelected(props: ActivitySelectorProps, activity: ActivityType): boolean {
  if (props.mode === 'multi') {
    return props.value.includes(activity);
  }
  return props.value === activity;
}

function toggleMulti(current: readonly ActivityType[], activity: ActivityType): ActivityType[] {
  return current.includes(activity)
    ? current.filter((a) => a !== activity)
    : [...current, activity];
}

export function ActivitySelector(props: ActivitySelectorProps) {
  const visible = (props.available ?? ACTIVITY_TYPES).filter((a) =>
    (ACTIVITY_TYPES as readonly ActivityType[]).includes(a),
  );

  return (
    <div
      className={[styles.grid, props.className ?? ''].filter(Boolean).join(' ')}
      role={props.mode === 'multi' ? 'group' : 'radiogroup'}
      aria-label="Activity type"
    >
      {visible.map((activity) => {
        const meta = ACTIVITY_TYPE_META[activity];
        const selected = isSelected(props, activity);
        return (
          <button
            key={activity}
            type="button"
            data-activity={activity}
            className={styles.tile}
            aria-pressed={selected}
            role={props.mode === 'multi' ? 'checkbox' : 'radio'}
            aria-checked={selected}
            onClick={() => {
              if (props.mode === 'multi') {
                props.onChange(toggleMulti(props.value, activity));
              } else if (selected && props.allowDeselect) {
                props.onChange(null);
              } else {
                props.onChange(activity);
              }
            }}
          >
            <span className={styles.iconWrap}>
              <ActivityIcon activity={activity} />
            </span>
            <span className={styles.label}>{meta.label}</span>
            {props.showFeeHint ? (
              <p className={styles.meta}>
                Suggested ${meta.suggestedFeeUsd.min}–${meta.suggestedFeeUsd.max}
              </p>
            ) : (
              <p className={styles.meta}>
                {meta.durationMinutes.min}–{meta.durationMinutes.max} min ·{' '}
                {meta.venue === 'cafe'
                  ? 'café'
                  : meta.venue === 'bar_or_restaurant'
                    ? 'bar or restaurant'
                    : 'restaurant'}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
