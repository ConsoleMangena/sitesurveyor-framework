import { formatCurrency } from "./FinanceUtils.ts";

interface MetricsTilesProps {
  collected: number;
  outstanding: number;
  invoiceCount: number;
}

const tiles = (props: MetricsTilesProps) => [
  {
    key: "collected",
    label: "Collected",
    value: formatCurrency(props.collected),
    caption: "Recorded payments",
    tone: "success",
  },
  {
    key: "outstanding",
    label: "Outstanding",
    value: formatCurrency(props.outstanding),
    caption: "Open invoices",
    tone: "warning",
  },
  {
    key: "invoices",
    label: "Invoices",
    value: String(props.invoiceCount),
    caption: "In this workspace",
    tone: "neutral",
  },
];

export default function MetricsTiles(props: MetricsTilesProps) {
  return (
    <div className="treasury-ledger" role="list" aria-label="Treasury totals">
      {tiles(props).map((tile) => (
        <div key={tile.key} className="treasury-ledger-cell" role="listitem">
          <span className="treasury-ledger-label">{tile.label}</span>
          <span className="treasury-ledger-value" data-tone={tile.tone}>
            {tile.value}
          </span>
          <span className="treasury-ledger-caption">{tile.caption}</span>
        </div>
      ))}
    </div>
  );
}
