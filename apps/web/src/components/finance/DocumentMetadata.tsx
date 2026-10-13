import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { FinanceMetadataItem } from "./FinanceTypes.ts";

interface DocumentMetadataProps {
  items: FinanceMetadataItem[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export function DocumentMetadata({
  items,
  columns = 2,
  className,
}: DocumentMetadataProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  }[columns];

  return (
    <div className={cn("grid gap-4", gridCols, className)}>
      {items.map((item) => (
        <Card
          key={item.label}
          className="bg-muted/40 border-border/60 shadow-none"
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
              {item.label}
            </p>
            <div className="font-semibold text-sm mt-1 break-words">
              {item.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
