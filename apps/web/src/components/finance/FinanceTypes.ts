export interface FinanceLineItem {
  id: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
}

export interface FinanceMetadataItem {
  label: string;
  value: React.ReactNode;
}
