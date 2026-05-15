import type { ReactNode } from 'react';
import styles from './styles.module.css';

// Layout for the auth segment - sign-up, login, password reset, and the
// verification flow. Kept minimal so it composes with the root layout
// without duplicating <html>/<body>.

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.brand}>JoinMyTable</div>
      {children}
    </div>
  );
}
