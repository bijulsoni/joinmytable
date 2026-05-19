'use client';

// Drop-in button that opens a chat in the floating dock instead of
// navigating to the full-page /chat/[bookingId] route. Use anywhere a
// user expects "click → talk to this person now."

import { useChatDock } from '@/lib/chat/dock-context';
import { Button } from '@/components/ui';

interface Props {
  bookingId: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  fullWidth?: boolean;
}

export function OpenChatButton({
  bookingId,
  children = 'Open chat →',
  variant = 'primary',
  fullWidth,
}: Props) {
  const { openChat } = useChatDock();
  return (
    <Button
      type="button"
      variant={variant}
      fullWidth={fullWidth}
      onClick={() => openChat(bookingId)}
    >
      {children}
    </Button>
  );
}
