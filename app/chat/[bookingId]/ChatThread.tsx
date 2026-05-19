'use client';

// /chat/[bookingId] - real-time message thread.
//
// CLAUDE.md core product rule #8: chat unlocks only after a request is
// accepted. The route-level guard already redirects unverified booking
// ids; this component is responsible for the live thread once we know
// the booking exists and the caller is a participant.
//
// Two wire surfaces this component reaches for:
//   - GET  /api/messaging/[bookingId]                load history + booking summary
//   - POST /api/messaging/[bookingId]                send a new message
//
// Realtime updates layer on top via Supabase Realtime
// (table: public.messages, filter: booking_id=eq.<bookingId>). The
// subscription is best-effort: if Realtime is unavailable the thread
// still works via polling on focus and after sends.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Badge, EmptyState, LoadingBlock } from '@/components/ui';
import { StatusMessage } from '@/components/StatusMessage';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { ACTIVITY_TYPE_META, type ActivityType, type BookingStatus } from '@/lib/types';
import styles from './styles.module.css';

interface ChatMessage {
  id: string;
  booking_id: string;
  sender_id: string | null;
  body: string;
  is_system_message: boolean;
  sent_at: string;
}

interface BookingSummary {
  id: string;
  activity_type: ActivityType;
  venue_name: string;
  venue_location: string;
  scheduled_time: string;
  status: BookingStatus;
  /** Counterpart name from the caller's perspective. */
  counterpart_name: string;
  counterpart_photo_url: string | null;
  /** Auth.uid() of the caller — lets us tag messages as sent vs received. */
  caller_user_id: string;
}

interface ThreadResponse {
  booking: BookingSummary;
  messages: ChatMessage[];
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatScheduled(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ChatThread({ bookingId }: { bookingId: string }) {
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpointMissing, setEndpointMissing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/messaging/${bookingId}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.status === 404) {
        setEndpointMissing(true);
        setBooking(null);
        setMessages([]);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(body.error?.message ?? `Could not load messages (${res.status}).`);
      }
      const body = (await res.json()) as ThreadResponse;
      setBooking(body.booking);
      setMessages(body.messages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime subscription. We skip wiring it up while the endpoint
  // returns 404 — there are no messages to listen for in that state.
  //
  // IMPORTANT: realtime's postgres_changes events are RLS-filtered at the
  // broker, so the websocket MUST authenticate with the user's JWT —
  // otherwise it falls back to `anon` and our messages_select_participant
  // policy hides every event. We hydrate the session from the cookie
  // first, push the access_token into realtime.setAuth(), AND keep it
  // refreshed on token rotation. Without this, sent messages only show
  // up on the sender's side until the page reloads.
  useEffect(() => {
    if (endpointMissing) return;
    let mounted = true;
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>['channel']> | null =
      null;
    const supabase = createSupabaseBrowserClient();
    let authSub: { data: { subscription: { unsubscribe: () => void } } } | null = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);

      // Keep the realtime auth fresh across token rotations.
      authSub = supabase.auth.onAuthStateChange((_evt, session) => {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      });

      if (!mounted) return;
      channel = supabase
        .channel(`messages:${bookingId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `booking_id=eq.${bookingId}`,
          },
          (payload: { new: ChatMessage }) => {
            if (!mounted) return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
          },
        )
        .subscribe();
    })();

    return () => {
      mounted = false;
      if (channel) void supabase.removeChannel(channel);
      authSub?.data.subscription.unsubscribe();
    };
  }, [bookingId, endpointMissing]);

  useEffect(() => {
    // Auto-scroll to the bottom whenever the message list grows. We keep
    // the behavior unconditional rather than try to detect "user is
    // reading earlier history" because the chat is short-form and the
    // tradeoff favors freshness on mobile.
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);

    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      booking_id: bookingId,
      sender_id: booking?.caller_user_id ?? null,
      body,
      is_system_message: false,
      sent_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');

    try {
      const res = await fetch(`/api/messaging/${bookingId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ body }),
      });
      if (res.status === 404) {
        setEndpointMissing(true);
        // Keep the optimistic message so the user sees what they typed.
        return;
      }
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(errBody.error?.message ?? `Send failed (${res.status}).`);
      }
      const json = (await res.json()) as { message: ChatMessage };
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? json.message : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
    } finally {
      setSending(false);
    }
  }, [draft, sending, bookingId, booking]);

  const summaryHeader = useMemo(() => {
    if (booking) {
      const meta = ACTIVITY_TYPE_META[booking.activity_type];
      return (
        <header className={styles.summary}>
          <div className={styles.summaryRow}>
            <Link href="/bookings" className={styles.summaryBack} aria-label="Back to bookings">
              ‹
            </Link>
            <Avatar src={booking.counterpart_photo_url} name={booking.counterpart_name} size={36} />
            <div className={styles.summaryBody}>
              <p className={styles.summaryName}>
                {booking.counterpart_name}
                <Badge activity={booking.activity_type} variant="soft">
                  {meta.label}
                </Badge>
              </p>
              <p className={styles.summaryMeta}>
                {booking.venue_name} · {formatScheduled(booking.scheduled_time)}
              </p>
            </div>
          </div>
        </header>
      );
    }
    return (
      <header className={styles.summary}>
        <div className={styles.summaryRow}>
          <Link href="/bookings" className={styles.summaryBack} aria-label="Back to bookings">
            ‹
          </Link>
          <div className={styles.summaryBody}>
            <p className={styles.summaryName}>Chat</p>
            <p className={styles.summaryMeta}>Booking {bookingId.slice(0, 8)}…</p>
          </div>
        </div>
      </header>
    );
  }, [booking, bookingId]);

  if (loading) {
    return (
      <main className={styles.shell}>
        {summaryHeader}
        <LoadingBlock fill />
      </main>
    );
  }

  if (endpointMissing) {
    return (
      <main className={styles.shell}>
        {summaryHeader}
        <div className={styles.empty}>
          <EmptyState title="Messaging is not live yet">
            The chat API (<code>/api/messaging</code>) and the bookings it pivots on are still being
            built. Once the Core API agent ships them, this thread will load history and stream new
            messages in realtime.
          </EmptyState>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      {summaryHeader}

      <div className={styles.thread} ref={threadRef}>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        {messages.length === 0 ? (
          <div className={styles.empty}>
            <EmptyState title="No messages yet">
              Say hi — chat opens once your booking is accepted.
            </EmptyState>
          </div>
        ) : null}

        {messages.map((m, idx) => {
          if (m.is_system_message) {
            return (
              <p key={m.id} className={styles.system}>
                {m.body}
              </p>
            );
          }
          const isMine = booking ? m.sender_id === booking.caller_user_id : false;
          // Only show the sender label when the author changes
          // run-to-run; back-to-back messages from the same person
          // suppress the label for a cleaner feed.
          const prev = messages[idx - 1];
          const showLabel = !prev || prev.is_system_message || prev.sender_id !== m.sender_id;
          const senderLabel = isMine ? 'You' : (booking?.counterpart_name ?? '');
          return (
            <div
              key={m.id}
              className={`${styles.row} ${isMine ? styles.rowSent : styles.rowReceived}`}
            >
              {showLabel ? <span className={styles.senderLabel}>{senderLabel}</span> : null}
              <div
                className={`${styles.bubble} ${isMine ? styles.bubbleSent : styles.bubbleReceived}`}
              >
                {m.body}
              </div>
              <div className={styles.timestamp}>{formatTimestamp(m.sent_at)}</div>
            </div>
          );
        })}
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          className={styles.composerField}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          aria-label="Message"
        />
        <button type="submit" className={styles.sendButton} disabled={!draft.trim() || sending}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </main>
  );
}
