/**
 * Shared panel chrome.
 *
 * Every dialog and form panel in the app renders the same header: optional
 * icon tile, optional kicker, title, description. These constants keep the type
 * scale and icon tint identical across the components that build that header
 * (`DialogTemplate`, `ConfirmDialog`, `PageForm`), so no two panels look like
 * they came from different products.
 */

/** Titles: one size, one weight, everywhere. */
export const TITLE_CLASS =
  "text-base font-semibold leading-snug tracking-[-0.01em] text-foreground";

/** The supporting line under a title — always muted, always readable. */
export const DESCRIPTION_CLASS =
  "text-[13px] leading-[1.5] text-muted-foreground";

/** The small uppercase line above a title: record type or section name. */
export const KICKER_CLASS =
  "text-[10px] font-semibold uppercase leading-none tracking-[0.13em] text-muted-foreground";

export type Tone = "default" | "danger" | "success" | "warning" | "info";

/**
 * Icon-tile tints. Applied over `.dlg-header-icon`, which owns the geometry, so
 * only colour changes here. `default` keeps the brand accent from the CSS.
 */
export const TONE_CLASS: Record<Tone, string> = {
  default: "",
  danger: "border-error/25 bg-error/10 text-error",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  info: "border-info/25 bg-info/10 text-info",
};
