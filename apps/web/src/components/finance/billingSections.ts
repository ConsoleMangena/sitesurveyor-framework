export type BillingSectionId =
  | "overview"
  | "credits"
  | "storage"
  | "transactions"
  | "methods"
  | "insights";

export interface BillingSectionMeta {
  id: BillingSectionId;
  label: string;
  description: string;
  /** Insights is only useful for platform administrators. */
  adminOnly?: boolean;
}

export const BILLING_SECTIONS: BillingSectionMeta[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Balances, quota and anything waiting on a payment.",
  },
  {
    id: "credits",
    label: "SiteSurveyor credits",
    description: "Buy credits and see every call that spent them.",
  },
  {
    id: "storage",
    label: "Storage",
    description: "Quota, timed packages and what expires when.",
  },
  {
    id: "transactions",
    label: "Transactions",
    description: "The full financial ledger with provider references.",
  },
  {
    id: "methods",
    label: "Payment methods",
    description: "Crypto rails, prepaid balance and saved accounts.",
  },
  {
    id: "insights",
    label: "Insights",
    description: "Spend breakdowns and platform margin reporting.",
    adminOnly: true,
  },
];
