// Circular avatar with initials fallback. Uses a plain <img> rather than
// next/image — companion photos are served from Supabase Storage on a
// per-project hostname, so the next/image allow-list dance is not worth
// it for the marginal LCP win on a list-of-faces screen.

import styles from './Avatar.module.css';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

function initialsFromName(name: string | null | undefined): string {
  const cleaned = (name ?? '').trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part.charAt(0)).join('');
  return letters.toUpperCase();
}

export function Avatar({ src, name, size = 40, className }: AvatarProps) {
  const dimension = `${size}px`;
  const fontSize = Math.max(11, Math.round(size * 0.42));
  const classes = [styles.avatar, className ?? ''].filter(Boolean).join(' ');

  return (
    <span
      className={classes}
      style={{ width: dimension, height: dimension, fontSize }}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? ''} className={styles.image} loading="lazy" />
      ) : (
        <span className={styles.initials}>{initialsFromName(name)}</span>
      )}
    </span>
  );
}
