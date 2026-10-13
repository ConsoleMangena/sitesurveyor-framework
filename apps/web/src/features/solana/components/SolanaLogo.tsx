/**
 * Solana brand mark (gradient diamond). Each instance uses unique gradient IDs
 * so multiple logos can render on the same page without ID collisions.
 */
import { useId } from "react";

interface Props {
  size?: number;
  className?: string;
}

export default function SolanaLogo({ size = 20, className }: Props) {
  const gid = useId().replace(/:/g, "");
  const grad = `sol-grad-${gid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 397.7 311.7"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient
          id={grad}
          x1="360.8"
          y1="351.5"
          x2="141.2"
          y2="-69.2"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#9945ff" />
          <stop offset=".91" stopColor="#14f195" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${grad})`}
        d="M64.6 237.9a14 14 0 0 1 9.9-4.1h317.4c6.2 0 9.3 7.5 4.9 11.9l-62.7 62.7a14 14 0 0 1-9.9 4.1H6.8c-6.2 0-9.3-7.5-4.9-11.9z"
      />
      <path
        fill={`url(#${grad})`}
        d="M64.6 3.8A14.3 14.3 0 0 1 74.5 0h317.4c6.2 0 9.3 7.5 4.9 11.9L334.1 74.6a14 14 0 0 1-9.9 4.1H6.8C.6 78.7-2.5 71.2 1.9 66.8z"
      />
      <path
        fill={`url(#${grad})`}
        d="M333.1 120.1a14 14 0 0 0-9.9-4.1H5.8c-6.2 0-9.3 7.5-4.9 11.9l62.7 62.7a14 14 0 0 0 9.9 4.1h317.4c6.2 0 9.3-7.5 4.9-11.9z"
      />
    </svg>
  );
}
