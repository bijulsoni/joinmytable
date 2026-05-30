import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSessionUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BottomNav, BottomNavSpacer } from '@/components/ui';
import { UserMenu } from './UserMenu';
import { BetaBadge } from './BetaBadge';
import { BetaWelcomeBanner } from './BetaWelcomeBanner';
import { ChatNotifications } from './ChatNotifications';
import { RequestNotifications } from './RequestNotifications';
import { ChatDockProvider } from '@/lib/chat/dock-context';
import { ChatDock } from '@/components/chat/ChatDock';
import styles from './AppShell.module.css';

// Shared app shell for every signed-in route.
//
//   - Top header: wordmark on the left, primary nav on the desktop center,
//     user menu (Profile / Verification / Sign out) on the right.
//   - Sticky on scroll, frosted background.
//   - On mobile, primary nav lives in the BottomNav (hidden on desktop);
//     the user menu is always in the header.
//
// Use as a wrapper inside every signed-in page so navigation feels
// consistent. Replaces ad-hoc page chrome.

interface AppShellProps {
  children: React.ReactNode;
  /**
   * When true, redirects to /login if no session. Defaults to true since
   * AppShell is intended for signed-in routes.
   */
  requireAuth?: boolean;
  /** Optional path to redirect to after login. */
  loginRedirectTo?: string;
}

function initialsOf(name: string | null | undefined, fallback: string): string {
  const n = (name ?? '').trim();
  if (!n) return fallback.slice(0, 2).toUpperCase();
  const parts = n.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export async function AppShell({ children, requireAuth = true, loginRedirectTo }: AppShellProps) {
  const user = await requireSessionUser(
    loginRedirectTo ? `/login?next=${encodeURIComponent(loginRedirectTo)}` : '/login',
  );
  if (!requireAuth) {
    // The require call above will redirect; ignore the unauth branch.
  }

  const name = user.profile?.name ?? user.email;
  const initials = initialsOf(user.profile?.name ?? null, user.email);

  // Fetch the user's own hero photo for the avatar pill. RLS allows
  // self-select on companion_profiles so this works without admin.
  // Null when the user hasn't uploaded any photos yet — UserMenu
  // falls back to initials in that case.
  let photoUrl: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: cp } = await supabase
      .from('companion_profiles')
      .select('photo_urls')
      .eq('user_id', user.id)
      .maybeSingle();
    const photos = (cp as { photo_urls: string[] | null } | null)?.photo_urls ?? null;
    photoUrl = photos?.[0] ?? null;
  } catch {
    // Header avatar is decorative; never block the page on this lookup.
  }

  return (
    <ChatDockProvider>
      <div className={styles.appShell}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Link href="/discover" className={styles.wordmark}>
              <span className={styles.wordmarkMark}>◖</span>
              Konnly
              <BetaBadge />
            </Link>
            <nav className={styles.nav} aria-label="Primary">
              <Link href="/discover" className={styles.navLink}>
                Discover
              </Link>
              <Link href="/plans" className={styles.navLink}>
                Plans
              </Link>
              <Link href="/chat" className={styles.navLink}>
                Chat
              </Link>
            </nav>
            <div className={styles.right}>
              <UserMenu
                name={name}
                email={user.email}
                initials={initials}
                photoUrl={photoUrl}
                isAdmin={user.profile?.is_admin ?? false}
              />
            </div>
          </div>
        </header>
        <main className={styles.main}>{children}</main>
        <BetaWelcomeBanner />
        <BottomNavSpacer />
        <BottomNav />
        <ChatNotifications userId={user.id} />
        <RequestNotifications userId={user.id} />
        <ChatDock />
      </div>
    </ChatDockProvider>
  );
}
