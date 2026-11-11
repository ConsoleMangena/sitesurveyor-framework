import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DESCRIPTION_CLASS, KICKER_CLASS, TITLE_CLASS } from "./chrome";

export interface PageFormProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small uppercase line above the title, matching the dialog header. */
  kicker?: React.ReactNode;
  onBack: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PageForm({
  title,
  description,
  kicker,
  onBack,
  children,
  footer,
  className,
  contentClassName,
}: PageFormProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        className
      )}
    >
      <header className="flex items-start gap-3 border-b px-5 py-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBack}
          className="gap-1"
        >
          <ArrowLeft size={16} />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          {kicker && <p className={KICKER_CLASS}>{kicker}</p>}
          <h1 className={cn("mt-1", TITLE_CLASS)}>{title}</h1>
          {description && (
            <p className={cn("mt-0.5", DESCRIPTION_CLASS)}>{description}</p>
          )}
        </div>
      </header>

      <div
        className={cn(
          "flex-1 overflow-y-auto px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]",
          contentClassName
        )}
      >
        {children}
      </div>

      {footer && (
        <footer className="flex flex-col-reverse gap-2 border-t bg-muted/60 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:flex-row sm:justify-end">
          {footer}
        </footer>
      )}
    </div>
  );
}

export default PageForm;
