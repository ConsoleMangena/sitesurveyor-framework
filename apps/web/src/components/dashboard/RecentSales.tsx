import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type RecentSaleItem = {
  id?: string;
  name: string;
  /** Identifies the record under the name: number, date, status. Never invented. */
  meta?: string;
  amount: string;
  avatarUrl?: string;
  fallback?: string;
};

interface RecentSalesProps {
  items?: RecentSaleItem[];
  emptyLabel?: string;
}

export function RecentSales({
  items = [],
  emptyLabel = "No invoices issued yet.",
}: RecentSalesProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((sale, index) => {
        const fallback =
          sale.fallback ??
          sale.name
            .split(" ")
            .map((part) => part[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();

        return (
          <li
            key={sale.id ?? `${sale.name}-${index}`}
            className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
          >
            <Avatar className="size-8 shrink-0">
              {sale.avatarUrl ? (
                <AvatarImage src={sale.avatarUrl} alt={sale.name} />
              ) : null}
              <AvatarFallback className="text-[11px] font-semibold">
                {fallback}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-none text-foreground">
                {sale.name}
              </p>
              {sale.meta ? (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {sale.meta}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {sale.amount}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
