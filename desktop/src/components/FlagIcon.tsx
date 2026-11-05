import { FLAG_COLORS, type FlagColor } from '../flags/constants';

export function FlagIcon({
  color,
  filled = true,
  size = 14,
  className = ''
}: {
  color?: string | null;
  filled?: boolean;
  size?: number;
  className?: string;
}) {
  const isAssigned = Boolean(color && color in FLAG_COLORS);
  const hex = isAssigned ? FLAG_COLORS[color as FlagColor].hex : (color || 'currentColor');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`symbol-flag-svg ${className}`}
      aria-hidden="true"
    >
      {/* Flag pole */}
      <line
        x1="3"
        y1="2"
        x2="3"
        y2="14.5"
        stroke={isAssigned && filled ? hex : 'currentColor'}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Flag pennant / fabric */}
      <path
        d="M3 2.5 C 5.5 1.5, 7.5 3.5, 13.5 2.5 L 13.5 9 C 7.5 10, 5.5 8, 3 9 Z"
        fill={isAssigned && filled ? hex : 'transparent'}
        stroke={isAssigned && filled ? hex : 'currentColor'}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
