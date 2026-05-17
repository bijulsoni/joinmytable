import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BottomNav, BottomNavSpacer, Button, EmptyState } from '@/components/ui';
import { getSessionUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Messages',
};

// /chat - chat index. Chat lives per-booking (CLAUDE.md rule #8 — chat
// unlocks only after a request is accepted), so the index just routes
// the user to their bookings list where each accepted booking has a
// chat link.
export default async function ChatIndexPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login?next=/chat');
  }

  return (
    <>
      <main
        style={{
          minHeight: '100dvh',
          background: 'var(--color-background)',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Messages</h1>
        <EmptyState
          title="Chats live with your bookings"
          action={
            <Button as={Link} href="/bookings" variant="primary">
              Go to bookings
            </Button>
          }
        >
          Each accepted booking has its own thread. Open a booking to chat with your seeker or
          companion.
        </EmptyState>
      </main>
      <BottomNavSpacer />
      <BottomNav />
    </>
  );
}
