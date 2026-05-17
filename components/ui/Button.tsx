// Shared primary/secondary/ghost button. Built phone-first with a 48px tap
// target. Supports an inline `loading` spinner that swaps the leading icon
// without changing the button's width, so loading state never causes layout
// shift on small screens.
//
// Polymorphic via `as`: defaults to <button>, but `as="a"` (or any other
// element/component) lets us style links identically without duplicating
// the visual layer. Loading and disabled states are only respected on
// actual <button> elements — anchors are always interactive.

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { Spinner } from '@/components/Spinner';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';

interface BaseButtonProps {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  children: ReactNode;
  className?: string;
}

type ButtonProps<T extends ElementType> = BaseButtonProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof BaseButtonProps | 'as'>;

export function Button<T extends ElementType = 'button'>({
  as,
  variant = 'primary',
  loading = false,
  fullWidth = false,
  leadingIcon,
  children,
  className,
  ...rest
}: ButtonProps<T>) {
  const Tag = (as ?? 'button') as ElementType;
  const isButton = Tag === 'button';

  const classes = [styles.button, styles[variant], fullWidth ? styles.full : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  const buttonOnlyProps = isButton
    ? {
        type: (rest as ComponentPropsWithoutRef<'button'>).type ?? 'button',
        disabled: (rest as ComponentPropsWithoutRef<'button'>).disabled || loading || undefined,
        'aria-busy': loading || undefined,
      }
    : {};

  return (
    <Tag className={classes} {...rest} {...buttonOnlyProps}>
      {loading ? (
        <span className={styles.spinner} aria-hidden>
          <Spinner size={16} />
        </span>
      ) : leadingIcon ? (
        <span aria-hidden>{leadingIcon}</span>
      ) : null}
      <span>{children}</span>
    </Tag>
  );
}
