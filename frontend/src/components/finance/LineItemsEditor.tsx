import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface LineItem {
  id: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
}

interface LineItemsEditorProps {
  items: LineItem[];
  onChange: (
    id: string,
    field: keyof LineItem,
    value: string | number,
  ) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  className?: string;
  showTotals?: boolean;
}

export function LineItemsEditor({
  items,
  onChange,
  onAdd,
  onRemove,
  className,
  showTotals = true,
}: LineItemsEditorProps) {
  const total = items.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0),
    0,
  );
  const vat = total * 0.15;

  const formatCurrency = (value: number) =>
    `$${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-none border bg-card">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Line items · {items.length}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAdd}
            className="h-6 gap-1 px-2 text-[11px] font-medium normal-case tracking-normal text-muted-foreground hover:text-foreground"
          >
            <Plus size={12} />
            Add
          </Button>
        </div>
        <ul className="divide-y">
          {items.map((item, index) => {
            const itemTotal =
              (Number(item.qty) || 0) * (Number(item.rate) || 0);
            return (
              <li
                key={item.id}
                className="group flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <Input
                    placeholder="Item description"
                    value={item.description}
                    onChange={(e) =>
                      onChange(item.id, "description", e.target.value)
                    }
                    className="h-8 min-w-0 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(item.id)}
                    disabled={items.length === 1}
                    aria-label={`Remove line item ${index + 1}`}
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Qty
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={item.qty}
                      onChange={(e) =>
                        onChange(item.id, "qty", Number(e.target.value) || 0)
                      }
                      className="h-8 text-right tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Unit
                    </Label>
                    <Input
                      placeholder="Hours"
                      value={item.unit}
                      onChange={(e) =>
                        onChange(item.id, "unit", e.target.value)
                      }
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Rate
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={item.rate}
                      onChange={(e) =>
                        onChange(item.id, "rate", Number(e.target.value) || 0)
                      }
                      className="h-8 text-right tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Total
                    </Label>
                    <div className="flex h-8 items-center justify-end rounded-md bg-muted/40 px-2 text-sm font-medium tabular-nums">
                      {formatCurrency(itemTotal)}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAdd}
            className="h-7 gap-1 text-xs"
          >
            <Plus size={12} />
            Add Line Item
          </Button>
        </div>
      </div>

      {showTotals && (
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm bg-muted/40 rounded-lg p-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT (15%)</span>
              <span>{formatCurrency(vat)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total Amount</span>
              <span>{formatCurrency(total + vat)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
