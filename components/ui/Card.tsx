// Rounded surface used as the base for most list rows, summaries, and
// modal-style cards. Static by default; pass `as="a" href=...` (or
// `as="button"`) to get a focusable, hover-elevated tap target — useful
// for companion list cards and booking list rows on mobile.

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import styles from './Card.module.css';

type CardVariant = 'surface' | 'flat';

interface BaseCardProps {
  variant?: CardVariant;
  padded?: boolean;
  shadow?: boolean;
  children: ReactNode;
  className?: string;
}

type CardProps<T extends ElementType> = BaseCardProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof BaseCardProps | 'as'>;

export function Card<T extends ElementType = 'div'>({
  as,
  variant = 'surface',
  padded = false,
  shadow = false,
  className,
  children,
  ...rest
}: CardProps<T>) {
  const Tag = (as ?? 'div') as ElementType;
  const isInteractive = Tag === 'a' || Tag === 'button';

  const classes = [
    styles.card,
    variant === 'flat' ? styles.flat : '',
    padded ? styles.padded : '',
    shadow ? styles.shadow : '',
    isInteractive ? styles.interactive : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
