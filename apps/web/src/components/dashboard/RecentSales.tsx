import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type RecentSaleItem = {
  id?: string;
  name: string;
  email: string;
  amount: string;
  avatarUrl?: string;
  fallback?: string;
};

const defaultSales: RecentSaleItem[] = [
  {
    name: "Olivia Martin",
    email: "olivia.martin@email.com",
    amount: "+$1,999.00",
    fallback: "OM",
  },
  {
    name: "Jackson Lee",
    email: "jackson.lee@email.com",
    amount: "+$39.00",
    fallback: "JL",
  },
  {
    name: "Isabella Nguyen",
    email: "isabella.nguyen@email.com",
    amount: "+$299.00",
    fallback: "IN",
  },
  {
    name: "William Kim",
    email: "will@email.com",
    amount: "+$99.00",
    fallback: "WK",
  },
  {
    name: "Sofia Davis",
    email: "sofia.davis@email.com",
    amount: "+$39.00",
    fallback: "SD",
  },
];

interface RecentSalesProps {
  items?: RecentSaleItem[];
}

export function RecentSales({ items = defaultSales }: RecentSalesProps) {
  return (
    <div className="space-y-6">
      {items.map((sale, index) => {
        const fallback =
          sale.fallback ??
          sale.name
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();

        return (
          <div key={sale.id ?? `${sale.name}-${index}`} className="flex items-center gap-4">
            <Avatar className="h-9 w-9">
              {sale.avatarUrl ? <AvatarImage src={sale.avatarUrl} alt={sale.name} /> : null}
              <AvatarFallback className="text-xs font-semibold">{fallback}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-wrap items-center justify-between gap-1">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none text-foreground">{sale.name}</p>
                <p className="text-xs text-muted-foreground">{sale.email}</p>
              </div>
              <div className="text-sm font-semibold text-foreground tabular-nums">
                {sale.amount}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

