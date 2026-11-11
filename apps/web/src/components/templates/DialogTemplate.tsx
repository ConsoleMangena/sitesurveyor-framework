import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  type DialogSize,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DESCRIPTION_CLASS,
  KICKER_CLASS,
  TITLE_CLASS,
  TONE_CLASS,
  type Tone,
} from "./chrome";

export type { DialogSize, Tone };

interface DialogTemplateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Sits in a tinted tile beside the title. */
  icon?: React.ReactNode;
  /** Tints the icon tile: brand accent by default, or a semantic state. */
  tone?: Tone;
  /** Small uppercase line above the title — a record type or section name. */
  kicker?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Muted text that sits opposite the actions inside the footer bar. */
  footerNote?: React.ReactNode;
  size?: DialogSize;
  /** If true, the footer stacks its actions on narrow screens. */
  responsiveFooter?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * The one dialog shell: bottom sheet on phones, centred card on desktop, with a
 * pinned header and footer and a body that scrolls between them.
 *
 * Pass `title`, optional `icon`/`kicker`/`description`, the body as children,
 * and `footer` for actions so every popup in the app shares one frame.
 */
export function DialogTemplate({
  open,
  onOpenChange,
  title,
  description,
  icon,
  tone = "default",
  kicker,
  children,
  footer,
  footerNote,
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
        className={className}
      >
        <div className="dlg-header">
          {icon ? (
            <span className={cn("dlg-header-icon", TONE_CLASS[tone])}>
              {icon}
            </span>
          ) : null}
          <DialogHeader className="dlg-header-main text-start">
            {kicker ? <p className={KICKER_CLASS}>{kicker}</p> : null}
            <DialogTitle className={TITLE_CLASS}>{title}</DialogTitle>
            {description ? (
              <DialogDescription
                className={cn("mt-0.5", DESCRIPTION_CLASS)}
                asChild
              >
                <div>{description}</div>
              </DialogDescription>
            ) : null}
          </DialogHeader>
        </div>

        {children ? (
          <div className={cn("dlg-body", contentClassName)}>{children}</div>
        ) : null}

        {footer || footerNote ? (
          <div
            data-slot="dialog-footer"
            className={cn("dlg-footer", !responsiveFooter && "dlg-footer-row")}
          >
            {footerNote ? (
              <div className="dlg-footer-note">{footerNote}</div>
            ) : null}
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

/** Cancel + primary pair. Spinner and label match `ConfirmDialog`. */
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
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={loading}
      >
        {cancelLabel}
      </Button>
      {onConfirm && (
        <Button
          type="button"
          variant={confirmVariant}
          onClick={onConfirm}
          disabled={disabled || loading}
        >
          {loading ? <Loader2 className="animate-spin" /> : null}
          {confirmLabel}
        </Button>
      )}
    </>
  );
}

export default DialogTemplate;
