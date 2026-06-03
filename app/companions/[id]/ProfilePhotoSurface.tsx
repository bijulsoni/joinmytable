'use client';

// Photo surface for the companion profile page.
//
// Compact layout: a small square photo on the LEFT, the name/verified/
// rating/location block on the RIGHT, in one card. Tapping the square
// opens the PhotoLightbox — a full-screen, zoomed viewer you can swipe/
// arrow through ALL the photos.
//
// We deliberately show only ONE thumbnail here (the first photo). The
// earlier "big hero + strip of the rest" surfaced every photo inline,
// which made two similar shots look duplicated. All photos still live in
// the lightbox; the card just shows a single tap target.
//
// The `meta` slot carries the name/verified/rating block from the server
// component so it renders alongside the photo without making the whole
// card a client component.

import { type ReactNode, useState } from 'react';
import { Avatar } from '@/components/ui';
import { PhotoLightbox } from '@/components/photo/PhotoLightbox';
import styles from './styles.module.css';

interface Props {
  photos: string[];
  name: string;
  meta: ReactNode;
}

export function ProfilePhotoSurface({ photos, name, meta }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const cover = photos[0] ?? null;
  const extra = Math.max(0, photos.length - 1);

  return (
    <>
      <section className={styles.heroCard}>
        {cover ? (
          <button
            type="button"
            className={styles.heroPhotoButton}
            onClick={() => setLightboxOpen(true)}
            aria-label={`Open ${name}'s photos`}
          >
            <div className={styles.heroPhoto}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt={`${name}'s photo`} />
              {extra > 0 ? <span className={styles.heroPhotoCount}>+{extra}</span> : null}
            </div>
          </button>
        ) : (
          <div className={styles.heroPhotoFallback} aria-hidden>
            <Avatar src={null} name={name} size={72} />
          </div>
        )}
        {meta}
      </section>

      {lightboxOpen && cover ? (
        <PhotoLightbox
          photos={photos}
          alt={`${name}'s photo`}
          initialIndex={0}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </>
  );
}
