import type { Metadata } from 'next';
import { requireSessionUser } from '@/lib/auth/session';
import { ModeSwitcher } from './ModeSwitcher';
import styles from '../styles.module.css';

export const metadata: Metadata = {
  title: 'Modes',
};

export default async function ModePage() {
  const user = await requireSessionUser();
  const profile = user.profile;

  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Choose your modes</h1>
      <p className={styles.subheading}>
        Switch between seeker and companion any time.
      </p>
      <ModeSwitcher
        initialIsSeeker={profile?.is_seeker ?? true}
        initialIsCompanion={profile?.is_companion ?? false}
      />
    </div>
  );
}
