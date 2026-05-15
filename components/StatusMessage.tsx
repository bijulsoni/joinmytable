// Inline status banner used across Frontend-owned screens. The auth
// segment has its own visually-identical version scoped via CSS Modules;
// this one is the shared variant available outside `app/(auth)/`.

import type { ReactNode } from 'react';

type Tone = 'error' | 'notice' | 'success';

const palette: Record<Tone, { bg: string; border: string; fg: string }> = {
  error: { bg: '#fdecec', border: '#f5b5b5', fg: '#7d1a1a' },
  notice: { bg: '#eef4ff', border: '#c6d6ff', fg: '#1a3a7d' },
  success: { bg: '#e8f6ec', border: '#b9e1c4', fg: '#1a5d2c' },
};

export interface StatusMessageProps {
  tone: Tone;
  children: ReactNode;
  /** Override the implicit a11y role (`alert` for errors, `status` otherwise). */
  role?: 'alert' | 'status';
}

export function StatusMessage({ tone, children, role }: StatusMessageProps) {
  const colors = palette[tone];
  const resolvedRole = role ?? (tone === 'error' ? 'alert' : 'status');
  return (
    <div
      role={resolvedRole}
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.fg,
        padding: '0.625rem 0.75rem',
        borderRadius: 8,
        fontSize: '0.875rem',
      }}
    >
      {children}
    </div>
  );
}
