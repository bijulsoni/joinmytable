'use client';

// Photo surface for the companion profile page.
//
// Owns three things:
//   1. The hero photo (clickable, opens lightbox at index 0)
//   2. The horizontal gallery strip of additional photos (each
//      thumbnail clickable, opens lightbox at its index)
//   3. The PhotoLightbox modal itself
//
// The `meta` slot carries the name/verified/rating block from the
// server component so it can render alongside the hero photo in the
// same flex card without forcing the entire heroCard to be a client
// component.

import { type ReactNode, useState } from 'react';
import { Avatar } from '@/components/ui';
import { PhotoLightbox } from './PhotoLightbox';
import styles from './styles.module.css';

interface Props {
  photos: string[];
  name: string;
  meta: ReactNode;
}

export function ProfilePhotoSurface({ photos, name, meta }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const hero = photos[0] ?? null;
  const more = photos.slice(1);

  return (
    <>
      <section className={styles.heroCard}>
        {hero ? (
          <button
            type="button"
            className={styles.heroPhotoButton}
            onClick={() => setLightboxIndex(0)}
            aria-label={`Open ${name}'s photos`}
          >
            <div className={styles.heroPhoto}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero} alt={`${name}'s photo`} />
            </div>
          </button>
        ) : (
          <div className={styles.heroPhotoFallback} aria-hidden>
            <Avatar src={null} name={name} size={72} />
          </div>
        )}
        {meta}
      </section>

      {more.length > 0 ? (
        <section className={styles.gallery} aria-label="More photos">
          {more.map((url, i) => (
            <button
              key={url}
              type="button"
              className={styles.galleryTileButton}
              onClick={() => setLightboxIndex(i + 1)}
              aria-label={`Open photo ${i + 2}`}
            >
              <div className={styles.galleryTile}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" />
              </div>
            </button>
          ))}
        </section>
      ) : null}

      {lightboxIndex !== null ? (
        <PhotoLightbox
          photos={photos}
          alt={`${name}'s photo`}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </>
  );
}
