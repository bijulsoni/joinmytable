import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/app';
import { Button, EmptyState } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Messages',
};

// Chat lives per-booking (CLAUDE.md rule #8 — chat unlocks only after a
// request is accepted), so this index just routes users into their
// bookings list where each accepted booking has a chat link.
export default async function ChatIndexPage() {
  return (
    <AppShell loginRedirectTo="/chat">
      <main
        style={{
          padding: '1.5rem 1.25rem',
          maxWidth: '40rem',
          margin: '0 auto',
        }}
      >
        <h1
          style={{
            margin: '0 0 0.5rem 0',
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 500,
            letterSpacing: '-0.02em',
          }}
        >
          Messages
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
          Each booking has its own thread. Open a booking from the list to chat.
        </p>
        <EmptyState
          title="Chats live with your bookings"
          action={
            <Button as={Link} href="/bookings" variant="primary">
              Go to bookings
            </Button>
          }
        >
          Open a confirmed booking to chat with your seeker or companion.
        </EmptyState>
      </main>
    </AppShell>
  );
}
