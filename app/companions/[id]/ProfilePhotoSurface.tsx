'use client';

// Photo surface for the companion profile page.
//
// A SINGLE swipeable gallery — every photo is an equal, full-width slide
// in one horizontal scroll-snap carousel, with dots underneath. There is
// no separate "hero + strip-of-the-rest" split anymore: that made a
// companion's first photo look duplicated whenever their next photo was a
// similar shot (big photo on top + a near-identical thumbnail below read
// as "loaded twice"). One carousel shows each photo exactly once.
//
// Tapping any slide opens the PhotoLightbox at that index.
//
// The `meta` slot carries the name/verified/rating block from the server
// component; it now renders in its own card BELOW the gallery.

import { type ReactNode, useRef, useState } from 'react';
import { Avatar } from '@/components/ui';
import { PhotoLightbox } from '@/components/photo/PhotoLightbox';
import styles from './styles.module.css';

interface Props {
  photos: string[];
  name: string;
  meta: ReactNode;
}

export function ProfilePhotoSurface({ photos, name, meta }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Derive the active slide from scroll position so the dots track swipes.
  function onScroll() {
    const el = viewportRef.current;
    if (!el) return;
    const slide = el.clientWidth || 1;
    const next = Math.round(el.scrollLeft / slide);
    if (next !== active) setActive(next);
  }

  return (
    <>
      <section className={styles.galleryCard}>
        {photos.length > 0 ? (
          <>
            <div className={styles.galleryViewport} ref={viewportRef} onScroll={onScroll}>
              {photos.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  className={styles.gallerySlideButton}
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`Open photo ${i + 1} of ${photos.length}`}
                >
                  <div className={styles.gallerySlide}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`${name}'s photo ${i + 1}`} />
                  </div>
                </button>
              ))}
            </div>
            {photos.length > 1 ? (
              <div className={styles.galleryDots} aria-hidden>
                {photos.map((url, i) => (
                  <span
                    key={url}
                    className={`${styles.galleryDot} ${i === active ? styles.galleryDotActive : ''}`}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className={styles.galleryFallback} aria-hidden>
            <Avatar src={null} name={name} size={96} />
          </div>
        )}
      </section>

      <section className={styles.metaCard}>{meta}</section>

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
