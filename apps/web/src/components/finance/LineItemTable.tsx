import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { FinanceLineItem } from "./FinanceTypes.ts";
import { formatCurrency } from "./FinanceUtils.ts";

interface LineItemTableProps {
  items: FinanceLineItem[];
  editable?: boolean;
  onChange?: (id: string, field: keyof FinanceLineItem, value: string | number) => void;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  className?: string;
}

export function LineItemTable({
  items,
  editable = false,
  onChange,
  onRemove,
  onAdd,
  addLabel = "Add Line Item",
  className,
}: LineItemTableProps) {
  return (
    <div className={cn("rounded-lg border overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <Table className="min-w-[520px]">
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-[45%]">Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {editable && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const lineTotal =
                (Number(item.qty) || 0) * (Number(item.rate) || 0);
              return (
                <TableRow key={item.id}>
                  <TableCell className="align-top">
                    {editable ? (
                      <Input
                        value={item.description}
                        onChange={(e) =>
                          onChange?.(item.id, "description", e.target.value)
                        }
                        placeholder="Description"
                        className="h-8"
                      />
                    ) : (
                      <span className="text-sm">{item.description}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    {editable ? (
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={item.qty}
                        onChange={(e) =>
                          onChange?.(item.id, "qty", e.target.value)
                        }
                        placeholder="0"
                        className="h-8 text-right"
                      />
                    ) : (
                      <span className="text-sm tabular-nums">{item.qty}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    {editable ? (
                      <Input
                        value={item.unit}
                        onChange={(e) =>
                          onChange?.(item.id, "unit", e.target.value)
                        }
                        placeholder="Unit"
                        className="h-8 text-right"
                      />
                    ) : (
                      <span className="text-sm">{item.unit || "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    {editable ? (
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={item.rate}
                        onChange={(e) =>
                          onChange?.(item.id, "rate", e.target.value)
                        }
                        placeholder="0.00"
                        className="h-8 text-right"
                      />
                    ) : (
                      <span className="text-sm tabular-nums">
                        {formatCurrency(item.rate)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <span className="text-sm font-medium tabular-nums">
                      {formatCurrency(lineTotal)}
                    </span>
                  </TableCell>
                  {editable && (
                    <TableCell className="align-top">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove?.(item.id)}
                        disabled={items.length === 1}
                        aria-label="Remove line item"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {editable && onAdd && (
        <div className="p-3 border-t bg-muted/20">
          <Button variant="outline" size="sm" onClick={onAdd} className="gap-1">
            <Plus size={14} />
            {addLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
