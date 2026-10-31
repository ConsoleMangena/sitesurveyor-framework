import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  type DialogSize,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type { DialogSize };

interface DialogTemplateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Small uppercase line above the title — a record type or section name. */
  kicker?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: DialogSize;
  /** If true, the footer stacks its actions on narrow screens. */
  responsiveFooter?: boolean;
  className?: string;
  contentClassName?: string;
}

export function DialogTemplate({
  open,
  onOpenChange,
  title,
  description,
  icon,
  kicker,
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
        variant="sheet"
        size={size}
        disableAnimation={size === "screen"}
        className={cn(className)}
      >
        <div className="dlg-header">
          {icon ? <span className="dlg-header-icon">{icon}</span> : null}
          <div className="dlg-header-main">
            {kicker ? <p className="dlg-kicker">{kicker}</p> : null}
            <DialogTitle className="text-[15.5px] font-bold leading-[1.25] tracking-[-0.018em] text-foreground">
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription
                className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground"
                asChild
              >
                <div>{description}</div>
              </DialogDescription>
            ) : null}
          </div>
        </div>

        <div className={cn("dlg-body", contentClassName)}>{children}</div>

        {footer ? (
          <div
            className={cn(
              "dlg-footer",
              !responsiveFooter && "dlg-footer-row",
            )}
          >
            {footer}
          </div>
        ) : null}
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
