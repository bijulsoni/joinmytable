import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BottomNav, BottomNavSpacer } from '@/components/ui';
import { getSessionUser } from '@/lib/auth/session';
import { ChatThread } from './ChatThread';

export const metadata: Metadata = {
  title: 'Chat',
};

interface RouteContext {
  params: Promise<{ bookingId: string }>;
}

// /chat/[bookingId] - in-app messaging for a single booking.
//
// Auth-gated at the route boundary; the API enforces booking
// participation (RLS via `is_booking_participant`). CLAUDE.md core rule
// #12: contact details are kept in-app until the booking is confirmed,
// so this is the only surface where seekers and companions talk.
export default async function ChatPage(ctx: RouteContext) {
  const { bookingId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=/chat/${bookingId}`);
  }

  return (
    <>
      <ChatThread bookingId={bookingId} />
      <BottomNavSpacer />
      <BottomNav />
    </>
  );
}
