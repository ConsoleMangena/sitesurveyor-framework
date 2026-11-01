import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FieldErrorProps {
  id?: string;
  children: ReactNode;
  className?: string;
  live?: boolean;
}

export default function FieldError({ id, children, className, live = true }: FieldErrorProps) {
  return (
    <p
      id={id}
      role={live ? "alert" : undefined}
      className={cn("flex items-start gap-1.5 text-xs text-destructive", className)}
    >
      <AlertCircle size={13} aria-hidden="true" className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}
