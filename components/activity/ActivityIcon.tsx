// Tiny purpose-built SVG icons for the four MVP activity types. Kept
// here rather than pulled from an icon font so the bundle stays small
// and each glyph can be sized via the parent's `--activity` color.

import type { SVGProps } from 'react';
import type { ActivityType } from '@/lib/types';

const COMMON: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function CoffeeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...COMMON} {...props}>
      <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
      <path d="M17 10h2a2 2 0 0 1 0 4h-2" />
      <path d="M7 4c.6 1.2-.6 2-0 3.5" />
      <path d="M11 4c.6 1.2-.6 2-0 3.5" />
    </svg>
  );
}

function LunchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...COMMON} {...props}>
      <path d="M5 4v8a2 2 0 0 0 2 2h0v6" />
      <path d="M9 4v6" />
      <path d="M9 4v0" />
      <path d="M17 4c-2 1-3 3-3 5s1 3 3 3v8" />
    </svg>
  );
}

function HappyHourIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...COMMON} {...props}>
      <path d="M5 4h14l-6 8v6" />
      <path d="M9 20h6" />
      <path d="M8 8h8" />
    </svg>
  );
}

function DinnerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...COMMON} {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </svg>
  );
}

const ICONS: Record<ActivityType, (props: SVGProps<SVGSVGElement>) => JSX.Element> = {
  coffee: CoffeeIcon,
  lunch: LunchIcon,
  happy_hour: HappyHourIcon,
  dinner: DinnerIcon,
};

interface ActivityIconProps extends SVGProps<SVGSVGElement> {
  activity: ActivityType;
}

export function ActivityIcon({ activity, ...rest }: ActivityIconProps) {
  const Icon = ICONS[activity];
  return <Icon {...rest} />;
}
