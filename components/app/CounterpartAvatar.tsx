'use client';

// Avatar that shows the real photo when available (clickable, pops
// open the lightbox), and falls back to initials when not. Used in
// every /plans row so seekers and companions can both browse each
// other's photo galleries.

import { useState } from 'react';
import { Avatar } from '@/components/ui';
import { PhotoLightbox } from '@/components/photo/PhotoLightbox';
import styles from './CounterpartAvatar.module.css';

interface Props {
  name: string;
  photos: string[];
  size?: number;
}

export function CounterpartAvatar({ name, photos, size = 56 }: Props) {
  const [open, setOpen] = useState(false);
  const hero = photos[0];

  if (!hero) {
    return <Avatar name={name} size={size} />;
  }

  return (
    <>
      <button
        type="button"
        className={styles.avatarButton}
        onClick={(e) => {
          // Don't bubble into surrounding Link/Card click handlers.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        style={{ width: size, height: size }}
        aria-label={`Browse ${name}'s photos`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero} alt={`${name}'s photo`} className={styles.avatarImg} />
      </button>
      {open ? (
        <PhotoLightbox
          photos={photos}
          alt={`${name}'s photo`}
          initialIndex={0}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
