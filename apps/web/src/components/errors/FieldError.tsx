import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import "@/styles/error-surfaces.css";

export interface FieldErrorProps {
  id?: string;
  children: ReactNode;
  className?: string;
  live?: boolean;
}

export default function FieldError({ id, children, className, live = true }: FieldErrorProps) {
  return (
    <p id={id} className={cn("field-error", className)} role={live ? "alert" : undefined}>
      <AlertCircle size={13} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
