/** Shared formatting helpers for the web3 surfaces. */

export function formatUsd(
  value: number | null | undefined,
  options: { compact?: boolean; digits?: number } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const compact = options.compact ?? false;
  if (compact && Math.abs(value) >= 1_000_000) {
    return `$${formatCompact(value)}`;
  }
  if (options.digits !== undefined) {
    return `$${value.toFixed(options.digits)}`;
  }
  if (Math.abs(value) < 1 && value !== 0) {
    return `$${value.toFixed(4)}`;
  }
  if (Math.abs(value) < 1000) {
    return `$${value.toFixed(2)}`;
  }
  if (Math.abs(value) < 1_000_000) {
    return `$${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(2);
}

export function formatPercent(
  value: number | null | undefined,
  options: { digits?: number } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const digits = options.digits ?? 2;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatTokenAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs < 0.0001) return value.toExponential(2);
  if (abs < 1) return value.toFixed(6).replace(/0+$/, "");
  if (abs < 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return formatCompact(value);
}

export function formatClock(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatSlot(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString();
}

export function deltaClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return "";
  }
  return value > 0 ? "web3-delta-up" : "web3-delta-down";
}
