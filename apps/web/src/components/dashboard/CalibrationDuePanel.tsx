import * as React from "react";
import { Gauge } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DashboardCard } from "./DashboardCard.tsx";

interface CalibrationDuePanelProps {
  instruments: {
    id: string;
    name: string;
    type: string;
    nextCalibration?: string | null;
  }[];
  maxItems?: number;
}

function daysUntil(dateStr?: string | null): number {
  if (!dateStr) return Infinity;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function calClasses(days: number): string {
  if (days < 0) return "bg-destructive/10 text-destructive border-destructive/20";
  if (days <= 30) return "bg-amber-100 text-amber-800 border-amber-200";
  if (days <= 60) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

function calLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d remaining`;
}

export function CalibrationDuePanel({ instruments, maxItems = 5 }: CalibrationDuePanelProps) {
  const due = React.useMemo(() => {
    return instruments
      .filter((inst) => inst.nextCalibration)
      .map((inst) => ({ ...inst, days: daysUntil(inst.nextCalibration) }))
      .filter((inst) => inst.days <= 30)
      .sort((a, b) => a.days - b.days)
      .slice(0, maxItems);
  }, [instruments, maxItems]);

  return (
    <DashboardCard title="Calibration Due" icon={<Gauge size={16} />}>
      {due.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          No calibrations due within 30 days.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {due.map((inst) => (
            <div
              key={inst.id}
              className="flex items-center justify-between gap-3 rounded-none border border-border/60 bg-card p-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{inst.name}</p>
                <p className="text-xs text-muted-foreground">{inst.type}</p>
              </div>
              <Badge variant="outline" className={cn("shrink-0 text-[10px]", calClasses(inst.days))}>
                {calLabel(inst.days)}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
