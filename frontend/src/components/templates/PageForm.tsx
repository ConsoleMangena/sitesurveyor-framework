import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface PageFormProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  onBack: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PageForm({
  title,
  description,
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
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </header>

      <div
        className={cn(
          "flex-1 overflow-y-auto px-5 py-4",
          contentClassName
        )}
      >
        {children}
      </div>

      {footer && (
        <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end">
          {footer}
        </footer>
      )}
    </div>
  );
}

export default PageForm;
