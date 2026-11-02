import type React from "react";
import { Button } from "../ui/button.tsx";

export const primaryActionClass =
  "h-10 shrink-0 whitespace-nowrap px-4 text-sm font-semibold bg-[var(--web3-brand,#d92d20)] text-white shadow-sm hover:bg-[var(--web3-brand-deep,#b42318)]";

/** Compact, right-aligned action row shared by every dialog footer state. */
export function DialogActionRow({
  children,
  leading,
}: {
  children: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {leading ? <div className="mr-auto min-w-0">{leading}</div> : null}
      {children}
    </div>
  );
}

/** Quiet close affordance so primary actions stay the only filled button. */
export function CloseAction({ onClose }: { onClose?: () => void }) {
  if (!onClose) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClose}
      className="h-10 shrink-0 px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      Close
    </Button>
  );
}

/** Key-value row used in specifications and attributes lists. */
export function AttributeRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[minmax(80px,0.8fr)_minmax(0,1.2fr)] gap-3 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-right text-sm font-medium leading-5 text-foreground">
        {value}
      </dd>
    </div>
  );
}

