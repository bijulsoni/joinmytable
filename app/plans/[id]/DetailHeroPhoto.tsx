'use client';

// Detail-page hero photo wrapper. Renders the counterpart's first
// photo as a clickable button; on click, opens the shared
// PhotoLightbox so the viewer can flip through every photo. Falls
// back to the <Avatar> initials when the counterpart has no photos.

import { useState } from 'react';
import { Avatar } from '@/components/ui';
import { PhotoLightbox } from '@/components/photo/PhotoLightbox';
import styles from './styles.module.css';

interface Props {
  name: string;
  photos: string[];
  /** Avatar fallback diameter when photos[0] is missing. */
  fallbackSize?: number;
}

export function DetailHeroPhoto({ name, photos, fallbackSize = 120 }: Props) {
  const [open, setOpen] = useState(false);
  const hero = photos[0];

  if (!hero) {
    return (
      <div className={styles.photoFallback}>
        <Avatar name={name} size={fallbackSize} />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={styles.photoButton}
        onClick={() => setOpen(true)}
        aria-label={`Browse ${name}'s photos`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero} alt={name} className={styles.photo} />
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
