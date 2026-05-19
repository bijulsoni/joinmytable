'use client';

// Chat-dock state. Lives on every signed-in page via AppShell so the
// open chats persist across route changes (you can browse /plans or
// /discover while keeping a conversation popped open at the bottom).
//
// State is mirrored into sessionStorage so it also survives soft
// navigations / refreshes within a tab — closing the tab clears it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'jmt-chat-dock-v1';
const MAX_OPEN = 3;

export interface DockChat {
  bookingId: string;
  minimized: boolean;
}

interface DockState {
  openChats: DockChat[];
}

interface DockContextValue extends DockState {
  openChat: (bookingId: string) => void;
  closeChat: (bookingId: string) => void;
  toggleMinimize: (bookingId: string) => void;
  minimizeAll: () => void;
}

const Ctx = createContext<DockContextValue | null>(null);

function readInitial(): DockState {
  if (typeof window === 'undefined') return { openChats: [] };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { openChats: [] };
    const parsed = JSON.parse(raw) as DockState;
    if (!parsed || !Array.isArray(parsed.openChats)) return { openChats: [] };
    return {
      openChats: parsed.openChats
        .filter((c) => typeof c?.bookingId === 'string')
        .slice(0, MAX_OPEN),
    };
  } catch {
    return { openChats: [] };
  }
}

export function ChatDockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DockState>(() => ({ openChats: [] }));

  // Hydrate from sessionStorage on mount.
  useEffect(() => {
    setState(readInitial());
  }, []);

  // Persist on change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota / privacy-mode errors.
    }
  }, [state]);

  const openChat = useCallback((bookingId: string) => {
    setState((prev) => {
      const exists = prev.openChats.find((c) => c.bookingId === bookingId);
      if (exists) {
        // Already in dock; ensure it's maximized + bring to front.
        const rest = prev.openChats.filter((c) => c.bookingId !== bookingId);
        return { openChats: [...rest, { bookingId, minimized: false }] };
      }
      const next = [...prev.openChats, { bookingId, minimized: false }];
      // Cap at MAX_OPEN; drop the oldest if exceeded.
      while (next.length > MAX_OPEN) next.shift();
      return { openChats: next };
    });
  }, []);

  const closeChat = useCallback((bookingId: string) => {
    setState((prev) => ({
      openChats: prev.openChats.filter((c) => c.bookingId !== bookingId),
    }));
  }, []);

  const toggleMinimize = useCallback((bookingId: string) => {
    setState((prev) => ({
      openChats: prev.openChats.map((c) =>
        c.bookingId === bookingId ? { ...c, minimized: !c.minimized } : c,
      ),
    }));
  }, []);

  const minimizeAll = useCallback(() => {
    setState((prev) => ({
      openChats: prev.openChats.map((c) => ({ ...c, minimized: true })),
    }));
  }, []);

  const value = useMemo<DockContextValue>(
    () => ({
      openChats: state.openChats,
      openChat,
      closeChat,
      toggleMinimize,
      minimizeAll,
    }),
    [state.openChats, openChat, closeChat, toggleMinimize, minimizeAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChatDock(): DockContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Outside the provider — safe no-op so server-rendered preview
    // doesn't crash. Real callers always sit inside AppShell.
    return {
      openChats: [],
      openChat: () => {},
      closeChat: () => {},
      toggleMinimize: () => {},
      minimizeAll: () => {},
    };
  }
  return ctx;
}
