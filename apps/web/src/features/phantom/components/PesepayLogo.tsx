/**
 * PesePay brand mark. The official PesePay logo uses a distinctive "P" monogram
 * with green/blue gradient. This is a simplified SVG recreation for inline use.
 */
export default function PesepayLogo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      {/* Background circle with gradient */}
      <defs>
        <linearGradient id="pesepay-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00C853" />
          <stop offset="100%" stopColor="#0091EA" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="12" fill="url(#pesepay-gradient)" />

      {/* Stylized "P" monogram */}
      <path
        d="M7 16V8C7 6.34315 8.34315 5 10 5H14C15.6569 5 17 6.34315 17 8V11C17 12.1046 16.1046 13 15 13H11C9.89543 13 9 12.1046 9 11V9H13C14.1046 9 15 8.10457 15 7C15 5.89543 14.1046 5 13 5H9C7.34315 5 6 6.34315 6 8V16"
        fill="white"
        fillRule="evenodd"
        stroke="white"
        strokeWidth="0.5"
      />
    </svg>
  );
}