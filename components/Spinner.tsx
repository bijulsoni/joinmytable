// Tiny accessible loading indicator. Use anywhere a screen owned by the
// Frontend agent needs to show "in flight" state without committing to a
// full skeleton. Renders an SVG so it stays crisp at any size and
// inherits color via `currentColor`.

interface SpinnerProps {
  size?: number;
  label?: string;
}

export function Spinner({ size = 16, label = 'Loading' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </path>
      </svg>
    </span>
  );
}
