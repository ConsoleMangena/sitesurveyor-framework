/**
 * PesePay brand mark — uses the official PesePay logo from pesepay.com
 * (green swish + purple wordmark). Loaded as an image for crisp scaling.
 */
export default function PesepayLogo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/pesepay-logo.svg"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0, width: size, height: size }}
    />
  );
}