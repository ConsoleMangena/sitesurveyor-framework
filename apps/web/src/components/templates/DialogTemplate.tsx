import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type DialogSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full" | "screen";

interface DialogTemplateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: DialogSize;
  /** If true, the footer is rendered with flex-col-reverse on narrow screens. */
  responsiveFooter?: boolean;
  className?: string;
  contentClassName?: string;
}

const sizeClasses: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  full: "max-w-[calc(100vw-2rem)] sm:max-w-4xl",
  // NOTE: Tailwind v4 important modifier is a trailing "!" (v3's leading "!"
  // generates no CSS and silently breaks the fullscreen sizing).
  screen: "w-[calc(100vw-2rem)]! max-w-none! max-h-none! h-[calc(100dvh-2rem)] flex flex-col overflow-hidden!",
};

export function DialogTemplate({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  size = "md",
  responsiveFooter = true,
  className,
  contentClassName,
}: DialogTemplateProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        disableAnimation={size === "screen"}
        className={cn(
          "w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 sm:w-auto",
          sizeClasses[size],
          className
        )}
      >
        <DialogHeader className="space-y-2 px-5 pt-5 pb-4 border-b">
          <div className="flex items-start gap-3">
            {icon && (
              <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {icon}
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1 text-left">
              <DialogTitle className="text-lg font-semibold leading-tight">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription className="text-sm text-muted-foreground" asChild>
                  <div>{description}</div>
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div
          className={cn(
            "px-5 py-4",
            size === "screen" && "flex-1 overflow-y-auto",
            contentClassName
          )}
        >
          {children}
        </div>

        {footer && (
          <DialogFooter
            className={cn(
              "px-5 py-4 border-t gap-2 sm:justify-end",
              responsiveFooter && "flex-col-reverse sm:flex-row"
            )}
          >
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface DialogActionButtonsProps {
  onCancel: () => void;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: string;
  confirmVariant?: React.ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
  loading?: boolean;
}

export function DialogActionButtons({
  onCancel,
  cancelLabel = "Cancel",
  onConfirm,
  confirmLabel = "Save",
  confirmVariant = "default",
  disabled = false,
  loading = false,
}: DialogActionButtonsProps) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
        {cancelLabel}
      </Button>
      {onConfirm && (
        <Button
          type="button"
          variant={confirmVariant}
          onClick={onConfirm}
          disabled={disabled || loading}
        >
          {loading ? "Saving..." : confirmLabel}
        </Button>
      )}
    </>
  );
}

export default DialogTemplate;
