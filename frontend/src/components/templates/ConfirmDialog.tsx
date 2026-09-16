import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants.ts";

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
  children?: ReactNode;
}

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
  children,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-start">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description !== undefined && (
            <AlertDialogDescription asChild>
              <div>{description}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
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