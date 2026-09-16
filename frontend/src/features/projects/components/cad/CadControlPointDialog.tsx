import { useEffect, useRef, useState } from "react";
import { Crosshair } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { axisBadgeLabels, type AxisConvention } from "./cadSettings.ts";

export interface CadControlPointValue {
  pointNo: string;
  e: number;
  n: number;
  z: number | null;
  code: string;
}

interface CadControlPointDialogProps {
  open: boolean;
  initialPointNo: string;
  initialCode?: string;
  axisConvention?: AxisConvention;
  onSubmit: (value: CadControlPointValue) => void;
  onCancel: () => void;
}

export function CadControlPointDialog({
  open,
  initialPointNo,
  initialCode = "CP",
  axisConvention = "yx",
  onSubmit,
  onCancel,
}: CadControlPointDialogProps) {
  const axis = axisBadgeLabels(axisConvention);
  const [pointNo, setPointNo] = useState(initialPointNo);
  const [easting, setEasting] = useState("");
  const [northing, setNorthing] = useState("");
  const [elev, setElev] = useState("");
  const [code, setCode] = useState(initialCode);
  const pointNoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      setPointNo(String(initialPointNo));
      setCode(initialCode);
      // Keep typed coordinates so sequential entry is faster; focus point #.
      pointNoRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, initialPointNo, initialCode]);

  const submit = () => {
    const pno = pointNo.trim();
    if (pno === "") return;
    const e = parseFloat(easting.trim());
    const n = parseFloat(northing.trim());
    if (!Number.isFinite(e) || !Number.isFinite(n)) return;
    const z = elev.trim() === "" ? null : parseFloat(elev.trim());
    if (elev.trim() !== "" && !Number.isFinite(z)) return;
    onSubmit({ pointNo: pno, e, n, z: z as number | null, code: code.trim() || "CP" });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent
        className="max-w-md gap-0 p-0 sm:rounded-xl"
        disableAnimation
      >
        <DialogTitle className="sr-only">Place Control Point</DialogTitle>

        <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/[0.07] via-background to-background px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Crosshair className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
                Place Control Point
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Enter exact coordinates. Control points are stored on the CONTROL layer.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-5 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="cad-cp-no" className="text-xs font-medium">
              Point #
            </Label>
            <Input
              id="cad-cp-no"
              ref={pointNoRef}
              value={pointNo}
              onChange={(e) => setPointNo(e.target.value)}
              inputMode="numeric"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") onCancel();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cad-cp-e" className="text-xs font-medium">
              {axis.first} <span className="text-muted-foreground">(Easting)</span>
            </Label>
            <Input
              id="cad-cp-e"
              value={easting}
              onChange={(e) => setEasting(e.target.value)}
              inputMode="decimal"
              placeholder="required"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") onCancel();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cad-cp-n" className="text-xs font-medium">
              {axis.second} <span className="text-muted-foreground">(Northing)</span>
            </Label>
            <Input
              id="cad-cp-n"
              value={northing}
              onChange={(e) => setNorthing(e.target.value)}
              inputMode="decimal"
              placeholder="required"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") onCancel();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cad-cp-rl" className="text-xs font-medium">
              RL (m)
            </Label>
            <Input
              id="cad-cp-rl"
              value={elev}
              onChange={(e) => setElev(e.target.value)}
              inputMode="decimal"
              placeholder="optional"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") onCancel();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cad-cp-code" className="text-xs font-medium">
              Code
            </Label>
            <Input
              id="cad-cp-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CP"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") onCancel();
              }}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="outline" size="sm" onClick={onCancel} className="sm:w-auto">
            Cancel
          </Button>
          <Button size="sm" onClick={submit} className="sm:w-auto">
            Place Control Point
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
