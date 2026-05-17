// Re-export of the project-level Spinner under the /components/ui
// namespace so consumers can import everything from one entry point.
// Adds a small `<LoadingBlock />` variant for full-card loading states
// (centered + padded) so individual screens do not each reinvent it.

import { Spinner } from '@/components/Spinner';

export { Spinner as LoadingSpinner };

interface LoadingBlockProps {
  label?: string;
  /** When true the block fills its parent vertically. */
  fill?: boolean;
}

export function LoadingBlock({ label = 'Loading', fill = false }: LoadingBlockProps) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '1.5rem',
        color: 'var(--color-text-secondary)',
        minHeight: fill ? '12rem' : undefined,
      }}
    >
      <Spinner size={20} label={label} />
      <span>{label}…</span>
    </div>
  );
}
