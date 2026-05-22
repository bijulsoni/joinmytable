'use client';

// Fullscreen photo viewer for a companion's profile.
//
// Behavior:
//   - Click hero photo or any gallery thumb → opens at that index
//   - ← / → keyboard arrows step through photos
//   - Touch swipe (>50px horizontal) also navigates
//   - Esc / X button / click-outside-the-image closes
//   - Body scroll is locked while open
//   - Counter at the bottom: "3 / 7"
//
// Image uses object-fit: contain so the whole photo shows — no cropping
// in here, the cropped version is what we show in the card/strip.

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './PhotoLightbox.module.css';

interface Props {
  photos: string[];
  alt: string;
  initialIndex: number;
  onClose: () => void;
}

export function PhotoLightbox({ photos, alt, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => (i < photos.length - 1 ? i + 1 : i));
  }, [photos.length]);

  // Keyboard nav + Esc close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goPrev, goNext]);

  // Body scroll lock while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
      const dx = endX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(dx) < 50) return;
      if (dx < 0) goNext();
      else goPrev();
    },
    [goNext, goPrev],
  );

  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  return (
    <div
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — photo ${index + 1} of ${photos.length}`}
      // Stop the click from leaking to any ancestor — most importantly,
      // the Next.js <Link> the avatar is often nested under in /plans.
      // We need BOTH stopPropagation AND preventDefault:
      //   - stopPropagation halts React synthetic event bubbling so the
      //     Link's onClick doesn't fire (no router.push)
      //   - preventDefault sets defaultPrevented on the native event so
      //     the underlying <a>'s built-in href navigation doesn't fire
      //     either (this was the actual cause of the "close goes to
      //     detail page" bug — the native anchor click was navigating
      //     even though React handlers were blocked)
      // Touch and mousedown only stopPropagation — do NOT preventDefault
      // on touchend, or the browser will skip synthesizing the click
      // event and the close button's onClick never fires.
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* Click-outside-image catcher. Sits behind the image; clicking
          the image itself doesn't bubble here. */}
      <button
        type="button"
        className={styles.scrimDismiss}
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />

      <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
        ✕
      </button>

      {hasPrev ? (
        <button
          type="button"
          className={`${styles.navBtn} ${styles.navPrev}`}
          onClick={goPrev}
          aria-label="Previous photo"
        >
          ‹
        </button>
      ) : null}

      <div className={styles.imageWrap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photos[index]}
          src={photos[index]}
          alt={alt}
          className={styles.image}
          draggable={false}
        />
      </div>

      {hasNext ? (
        <button
          type="button"
          className={`${styles.navBtn} ${styles.navNext}`}
          onClick={goNext}
          aria-label="Next photo"
        >
          ›
        </button>
      ) : null}

      {photos.length > 1 ? (
        <div className={styles.counter} aria-hidden>
          {index + 1} / {photos.length}
        </div>
      ) : null}
    </div>
  );
}
