'use client';

// Reusable chat pane: header + messages + composer.
//
// Used inside the floating dock window and from any future surface
// (mobile full-screen, side-drawer, etc.). Owns its own data fetch +
// realtime subscription per bookingId so multiple panes can run side
// by side without stepping on each other.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import styles from './ChatPane.module.css';

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
  activity_type: string;
  venue_name: string;
  scheduled_time: string;
  status: string;
  counterpart_name: string;
  counterpart_photo_url: string | null;
  caller_user_id: string;
}

interface Props {
  bookingId: string;
  onMinimize: () => void;
  onClose: () => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function ChatPane({ bookingId, onMinimize, onClose }: Props) {
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/messaging/${bookingId}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `Could not load chat (${res.status}).`);
      }
      const body = (await res.json()) as { booking: BookingSummary; messages: ChatMessage[] };
      setBooking(body.booking);
      setMessages(body.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load chat.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>['channel']> | null =
      null;
    const supabase = createSupabaseBrowserClient();
    let authSub: { data: { subscription: { unsubscribe: () => void } } } | null = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);
      authSub = supabase.auth.onAuthStateChange((_evt, session) => {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      });
      if (!mounted) return;
      channel = supabase
        .channel(`chat-pane:${bookingId}`)
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
  }, [bookingId]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const apiBody = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(apiBody.error?.message ?? `Could not send (${res.status}).`);
      }
      // Replace optimistic with server row.
      const apiBody = (await res.json()) as { message: ChatMessage };
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? apiBody.message : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
      // Roll back optimistic.
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }, [draft, sending, bookingId, booking]);

  return (
    <section className={styles.pane} aria-label="Chat conversation">
      <header className={styles.header}>
        <button
          type="button"
          className={styles.headerName}
          onClick={onMinimize}
          aria-label="Minimize chat"
        >
          <Avatar name={booking?.counterpart_name ?? 'Loading'} size={28} />
          <span className={styles.headerTitle}>{booking?.counterpart_name ?? 'Loading…'}</span>
        </button>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerBtn}
            onClick={onMinimize}
            aria-label="Minimize chat"
            title="Minimize"
          >
            –
          </button>
          <button
            type="button"
            className={styles.headerBtn}
            onClick={onClose}
            aria-label="Close chat"
            title="Close"
          >
            ✕
          </button>
        </div>
      </header>

      <div className={styles.body} ref={threadRef}>
        {loading ? (
          <p className={styles.empty}>Loading…</p>
        ) : error ? (
          <p className={styles.error}>{error}</p>
        ) : messages.length === 0 ? (
          <p className={styles.empty}>No messages yet. Say hi.</p>
        ) : (
          messages.map((m, idx) => {
            if (m.is_system_message) {
              return (
                <p key={m.id} className={styles.system}>
                  {m.body}
                </p>
              );
            }
            const isMine = booking ? m.sender_id === booking.caller_user_id : false;
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
                  className={`${styles.bubble} ${
                    isMine ? styles.bubbleSent : styles.bubbleReceived
                  }`}
                >
                  {m.body}
                </div>
                <span className={styles.timestamp}>{formatTimestamp(m.sent_at)}</span>
              </div>
            );
          })
        )}
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
    </section>
  );
}
