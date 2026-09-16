import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface CadPopoverTemplateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Additional classes applied to the root Card. */
  className?: string;
  /** Additional classes applied to the CardContent. */
  contentClassName?: string;
  /** Called when the close button is clicked. If omitted, no close button is shown. */
  onClose?: () => void;
  /** Inline styles applied to the root Card element. */
  style?: React.CSSProperties;
  /** Ref forwarded to the root Card element. */
  ref?: React.Ref<HTMLDivElement>;
}

export const CadPopoverTemplate = React.forwardRef<HTMLDivElement, CadPopoverTemplateProps>(
  function CadPopoverTemplate(
    { title, description, children, footer, className, contentClassName, onClose, style },
    ref,
  ) {
    return (
      <Card
        ref={ref}
        className={cn(
          "cad-popover-template flex flex-col border bg-background shadow-xl",
          className,
        )}
        style={style}
      >
        {(title || onClose) && (
          <CardHeader className="flex flex-row items-start justify-between gap-3 py-3 px-4 pb-0">
            <div className="min-w-0">
              {title && <CardTitle className="text-sm font-semibold">{title}</CardTitle>}
              {description && (
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  {description}
                </p>
              )}
            </div>
            {onClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="cad-panel-collapse h-7 w-7 shrink-0"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={14} />
              </Button>
            )}
          </CardHeader>
          )}
        <CardContent className={cn("cad-panel-block flex-1 min-h-0 overflow-auto p-4", contentClassName)}>
          {children}
        </CardContent>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            {footer}
          </div>
        )}
      </Card>
    );
  },
);

export default CadPopoverTemplate;
