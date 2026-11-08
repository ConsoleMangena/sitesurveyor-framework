import { useMemo } from "react";
import { Check, FileText, Sparkles } from "lucide-react";

import { CATEGORY_LABELS, type DossierCategory } from "../../lib/surveys/labels.ts";
import { detectOptimalQuality } from "../../lib/surveys/mapExport.ts";
import { BlockTitle } from "./BlockTitle.tsx";
import { Button } from "@/components/ui/button.tsx";

interface ExportsPanelProps {
  deliverables?: unknown[];
  /** False when nothing is on screen, so the note explains rather than failing silently. */
  surveyed: boolean;
  activeDossierCategory?: DossierCategory;
  clientName?: string;
  onOpenExportPdf?: () => void;
}

/**
 * Replaces legacy low-resolution exports (preview PNG, KMZ, GeoTIFF, raw JSON)
 * with the unified, high-DPI cartographic PDF map sheet deliverable.
 */
export default function ExportsPanel({
  surveyed,
  activeDossierCategory = "water",
  clientName = "Site Survey",
  onOpenExportPdf,
}: ExportsPanelProps) {
  const quality = useMemo(() => detectOptimalQuality(), []);
  const categoryLabel = CATEGORY_LABELS[activeDossierCategory]?.name ?? "Survey";

  return (
    <section className="sw-block px-4 py-3.5">
      <BlockTitle count="PDF Only">Official Map Export</BlockTitle>

      <div className="mt-2.5 rounded-lg border border-border/80 bg-card/60 p-3 text-xs space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
              Cartographic Deliverable
            </span>
            <p className="text-xs font-semibold text-foreground mt-0.5">
              {categoryLabel} Sheet — {clientName || "Survey Area"}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary shrink-0">
            <Sparkles className="size-2.5" />
            PDF Only
          </span>
        </div>

        {/* Hardware calibration indicator */}
        <div className="rounded-md border border-border/50 bg-background/80 px-2.5 py-1.5 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>Resolution:</span>
          <span className="font-medium text-foreground">{quality.label}</span>
        </div>

        {/* Standard Surveyor Map Sheet Features */}
        <div className="text-[11px] text-muted-foreground space-y-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <Check className="size-3 text-emerald-500 shrink-0" />
            <span>North Arrow & Compass Rose</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="size-3 text-emerald-500 shrink-0" />
            <span>Segmented Metric Scale Bar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="size-3 text-emerald-500 shrink-0" />
            <span>Title Block with WGS84 GPS Coordinates</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="size-3 text-emerald-500 shrink-0" />
            <span>Classified Potential Legend & Neatline</span>
          </div>
        </div>

        <Button
          type="button"
          onClick={onOpenExportPdf}
          disabled={!surveyed || !onOpenExportPdf}
          className="w-full flex items-center justify-center gap-1.5 text-xs h-8 font-medium mt-1"
        >
          <FileText className="size-3.5" />
          <span>Export Official PDF Map Sheet</span>
        </Button>

        {!surveyed ? (
          <p className="text-[10.5px] text-center text-muted-foreground italic">
            Run or select a survey to export the official map sheet.
          </p>
        ) : null}
      </div>
    </section>
  );
}
