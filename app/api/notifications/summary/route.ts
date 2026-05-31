import 'server-only';

// GET /api/notifications/summary
//
// The "what did I miss while I was away" digest. Powers the login prompt
// (components/app/LoginDigest) so a user who was offline when a message
// or request arrived sees it immediately on next sign-in — instead of
// having to dig into /chat or /requests to discover it.
//
// Two signals, both bidirectional where it makes sense:
//   - unread messages: any message in one of my bookings, sent by the
//     OTHER participant after my last_read_at for that booking (or with
//     no read mark yet). Marking read happens in GET /api/messaging/[id].
//   - pending requests: inbound meal_requests still in 'requested' — i.e.
//     someone invited me (as companion) and I haven't responded.
//
// RLS scopes everything: messages are visible only for bookings I'm in,
// meal_requests only where I'm a participant.

import { NextResponse } from 'next/server';
import { apiError, requireAuth } from '@/app/api/_lib';

interface UnreadMessageRow {
  booking_id: string;
  sender_id: string | null;
  body: string;
  sent_at: string;
}
interface ReadRow {
  booking_id: string;
  last_read_at: string;
}
interface PendingRequestRow {
  id: string;
  activity_type: string;
  seeker_id: string;
  created_at: string;
}

const ACTIVITY_LABEL: Record<string, string> = {
  coffee: 'coffee',
  lunch: 'lunch',
  dinner: 'dinner',
  happy_hour: 'happy hour',
};

export async function GET() {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  // --- Unread messages -----------------------------------------------------
  // RLS limits these to bookings I participate in. Exclude my own messages
  // and system messages. Newest first, bounded.
  const { data: msgsRaw, error: msgErr } = await caller.supabase
    .from('messages')
    .select('booking_id, sender_id, body, sent_at')
    .eq('is_system_message', false)
    .neq('sender_id', caller.userId)
    .order('sent_at', { ascending: false })
    .limit(300);
  if (msgErr) {
    return apiError('internal_error', `Could not load messages: ${msgErr.message}`);
  }
  const messages = (msgsRaw ?? []) as UnreadMessageRow[];

  const { data: readsRaw } = await caller.supabase
    .from('message_reads')
    .select('booking_id, last_read_at');
  const lastReadByBooking = new Map<string, number>();
  for (const r of (readsRaw ?? []) as ReadRow[]) {
    lastReadByBooking.set(r.booking_id, new Date(r.last_read_at).getTime());
  }

  const unread = messages.filter((m) => {
    const readAt = lastReadByBooking.get(m.booking_id);
    return readAt === undefined || new Date(m.sent_at).getTime() > readAt;
  });
  const unreadThreadIds = new Set(unread.map((m) => m.booking_id));

  // Resolve the newest unread sender's name for a friendlier prompt.
  let latestMessage: { name: string; preview: string; bookingId: string } | null = null;
  const newest = unread[0];
  if (newest) {
    let name = 'Someone';
    if (newest.sender_id) {
      const { data: u } = await caller.supabase
        .from('users')
        .select('name')
        .eq('id', newest.sender_id)
        .maybeSingle();
      name = (u as { name: string | null } | null)?.name?.trim() || 'Someone';
    }
    latestMessage = {
      name,
      preview: newest.body.replace(/\s+/g, ' ').slice(0, 80),
      bookingId: newest.booking_id,
    };
  }

  // --- Pending inbound requests (someone invited me) -----------------------
  const { data: reqRaw, error: reqErr } = await caller.supabase
    .from('meal_requests')
    .select('id, activity_type, seeker_id, created_at')
    .eq('companion_id', caller.userId)
    .eq('status', 'requested')
    .order('created_at', { ascending: false })
    .limit(50);
  if (reqErr) {
    return apiError('internal_error', `Could not load requests: ${reqErr.message}`);
  }
  const pending = (reqRaw ?? []) as PendingRequestRow[];

  let latestRequest: { name: string; activity: string } | null = null;
  const newestReq = pending[0];
  if (newestReq) {
    const { data: u } = await caller.supabase
      .from('users')
      .select('name')
      .eq('id', newestReq.seeker_id)
      .maybeSingle();
    latestRequest = {
      name: (u as { name: string | null } | null)?.name?.trim() || 'Someone',
      activity: ACTIVITY_LABEL[newestReq.activity_type] ?? newestReq.activity_type,
    };
  }

  return NextResponse.json({
    unreadMessages: unread.length,
    unreadThreads: unreadThreadIds.size,
    pendingRequests: pending.length,
    latestMessage,
    latestRequest,
  });
}
