import type { FinanceLineItem } from "./FinanceTypes.ts";

export const VAT_RATE = 0.15;

export function calcSubtotal(items: FinanceLineItem[]) {
  return items.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0),
    0,
  );
}

export function calcVat(subtotal: number, rate = VAT_RATE) {
  return subtotal * rate;
}

export function calcTotal(items: FinanceLineItem[], rate = VAT_RATE) {
  const subtotal = calcSubtotal(items);
  return subtotal + calcVat(subtotal, rate);
}

export function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(isoDate: string) {
  if (!isoDate) return "—";
  return new Date(isoDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function quoteStatusVariant(status: string) {
  switch (status.toLowerCase()) {
    case "accepted":
      return "success" as const;
    case "sent":
      return "default" as const;
    case "declined":
      return "destructive" as const;
    case "draft":
    default:
      return "secondary" as const;
  }
}

export function invoiceStatusVariant(status: string) {
  switch (status.toLowerCase()) {
    case "paid":
      return "success" as const;
    case "sent":
      return "default" as const;
    case "overdue":
      return "destructive" as const;
    case "draft":
    default:
      return "secondary" as const;
  }
}
