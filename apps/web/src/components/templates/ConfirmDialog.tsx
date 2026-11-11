import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants.ts";
import {
  DESCRIPTION_CLASS,
  KICKER_CLASS,
  TITLE_CLASS,
  TONE_CLASS,
  type Tone,
} from "./chrome";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  onConfirm?: () => void;
  loading?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  form?: string;
  /** Optional icon tile, tinted with `tone`. */
  icon?: ReactNode;
  tone?: Tone;
  kicker?: ReactNode;
  children?: ReactNode;
}

/**
 * A confirmation uses the same header, body and footer frame as every form
 * dialog — it only swaps the primary action for a destructive one and adds an
 * alert role so screen readers announce it.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  onConfirm,
  loading = false,
  destructive = false,
  disabled = false,
  form,
  icon,
  tone,
  kicker,
  children,
}: ConfirmDialogProps) {
  const resolvedTone: Tone = tone ?? (destructive ? "danger" : "default");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <div className="dlg-header">
          {icon ? (
            <span
              className={cn("dlg-header-icon", TONE_CLASS[resolvedTone])}
            >
              {icon}
            </span>
          ) : null}
          <div className="dlg-header-main">
            {kicker ? <p className={KICKER_CLASS}>{kicker}</p> : null}
            <AlertDialogTitle className={TITLE_CLASS}>
              {title}
            </AlertDialogTitle>
            {description !== undefined && (
              <AlertDialogDescription
                className={cn("mt-0.5", DESCRIPTION_CLASS)}
                asChild
              >
                <div>{description}</div>
              </AlertDialogDescription>
            )}
          </div>
        </div>
        {children ? <div className="dlg-body">{children}</div> : null}
        <AlertDialogFooter className="dlg-footer">
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type={form ? "submit" : "button"}
            form={form}
            onClick={onConfirm}
            disabled={disabled || loading}
            className={cn(
              destructive
                ? buttonVariants({ variant: "destructive" })
                : buttonVariants({ variant: "default" }),
            )}
          >
            {loading && <Loader2 className="animate-spin" />}
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
