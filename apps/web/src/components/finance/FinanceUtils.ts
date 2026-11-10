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

const PESAPAY_KIND_LABELS: Record<string, string> = {
  deposit: "Deposit",
  ai_credit_purchase: "SiteSurveyor credits",
  storage_purchase: "Storage",
  invoice_payment: "Invoice payment",
};

export function pesepayKindLabel(kind: string): string {
  return PESAPAY_KIND_LABELS[kind] ?? kind;
}

export function pesepayStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "refunded":
      return "Refunded";
    default:
      return status;
  }
}

export function pesepayStatusVariant(status: string) {
  switch (status) {
    case "completed":
      return "success" as const;
    case "pending":
      return "warning" as const;
    case "failed":
    case "cancelled":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

/** Amounts are USD for PesePay checkouts; local-currency rows print with their code. */
export function formatMoney(amount: number, currencyCode = "USD"): string {
  return currencyCode === "USD"
    ? formatCurrency(amount)
    : `${currencyCode} ${amount.toFixed(2)}`;
}
