interface MarketAssistantBotProps {
  className?: string;
}

/** Friendly marketplace guide with a blinking face and a gently waving antenna. */
export function MarketAssistantBot({ className }: MarketAssistantBotProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M32 16V9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <g className="market-assistant-antenna">
        <path d="m32 10 5-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="39" cy="5" r="3.5" fill="currentColor" />
      </g>
      <path d="M11 31H7a4 4 0 0 0-4 4v7a4 4 0 0 0 4 4h4M53 31h4a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4h-4" fill="currentColor" opacity=".45" />
      <rect x="9" y="17" width="46" height="36" rx="13" fill="currentColor" opacity=".14" />
      <rect x="10.5" y="18.5" width="43" height="33" rx="11.5" stroke="currentColor" strokeWidth="3" />
      <rect className="market-assistant-face" x="16" y="25" width="32" height="20" rx="8" fill="currentColor" />
      <g className="market-assistant-eyes" fill="var(--card)">
        <rect x="23" y="31" width="4" height="7" rx="2" />
        <rect x="37" y="31" width="4" height="7" rx="2" />
      </g>
      <path d="m25 51-2 7h18l-2-7" fill="currentColor" opacity=".55" />
      <circle cx="32" cy="56" r="2" fill="var(--card)" />
    </svg>
  );
}
