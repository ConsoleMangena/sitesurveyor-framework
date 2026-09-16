import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { DialogTemplate } from "@/components/templates/DialogTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CadPointDialogValue {
  pointNo: string;
  code: string;
  z: number | null;
}

interface CadPointDialogProps {
  open: boolean;
  initialPointNo: string;
  initialCode?: string;
  initialElevation?: string;
  title?: string;
  onSubmit: (value: CadPointDialogValue) => void;
  onCancel: () => void;
}

export function CadPointDialog({
  open,
  initialPointNo,
  initialCode = "",
  initialElevation = "",
  title = "Place Survey Point",
  onSubmit,
  onCancel,
}: CadPointDialogProps) {
  const [pointNo, setPointNo] = useState(initialPointNo);
  const [code, setCode] = useState(initialCode);
  const [elev, setElev] = useState(initialElevation);
  const pointNoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      setPointNo(String(initialPointNo));
      setCode(initialCode);
      setElev(initialElevation);
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, initialPointNo, initialCode, initialElevation]);

  const submit = () => {
    const pno = pointNo.trim();
    if (pno === "") return;
    const z = elev.trim() === "" ? null : parseFloat(elev);
    if (elev.trim() !== "" && !Number.isFinite(z)) return;
    onSubmit({ pointNo: pno, code: code.trim(), z: z as number | null });
  };

  return (
    <DialogTemplate
      open={open}
      onOpenChange={(v) => { if (!v) onCancel(); }}
      title={title}
      description="Set the point number, feature code and elevation (RL). Leave RL blank for a 2D marker."
      icon={<MapPin className="size-4" />}
      size="sm"
      className="sm:rounded-none"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onCancel} className="sm:w-auto">
            Cancel
          </Button>
          <Button size="sm" onClick={submit} className="sm:w-auto">
            Place Point
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="cad-point-no" className="text-xs font-medium">
            Point #
          </Label>
          <Input
            id="cad-point-no"
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
          <Label htmlFor="cad-point-code" className="text-xs font-medium">
            Code
          </Label>
          <Input
            id="cad-point-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. FL, TREE, MH"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cad-point-rl" className="text-xs font-medium">
            RL (m)
          </Label>
          <Input
            id="cad-point-rl"
            value={elev}
            onChange={(e) => setElev(e.target.value)}
            inputMode="decimal"
            placeholder="optional — leave blank for a 2D marker"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>
      </div>
    </DialogTemplate>
  );
}
