import type { Metadata } from 'next';
import { AppShell } from '@/components/app';
import { ChatThread } from './ChatThread';

export const metadata: Metadata = {
  title: 'Chat',
};

interface RouteContext {
  params: Promise<{ bookingId: string }>;
}

export default async function ChatPage(ctx: RouteContext) {
  const { bookingId } = await ctx.params;
  return (
    <AppShell loginRedirectTo={`/chat/${bookingId}`}>
      <ChatThread bookingId={bookingId} />
    </AppShell>
  );
}
