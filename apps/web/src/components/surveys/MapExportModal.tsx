import { useMemo, useState } from "react";
import { Check, Download, FileText, Loader, ShieldCheck, Sparkles, X } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";

import { Button } from "@/components/ui/button.tsx";
import type { MapViewInfo } from "./SurveyMap.tsx";
import {
  detectOptimalQuality,
  exportMapAsPdf,
  type MapExportOptions,
  type SheetLegendItem,
} from "../../lib/surveys/mapExport.ts";

export interface ExportBasemapConfig {
  tileUrlTemplate: string;
  attribution: string;
  maxNativeZoom: number;
}

interface MapExportModalProps {
  open: boolean;
  onClose: () => void;
  map: LeafletMap | null;
  target: { latitude: number; longitude: number };
  viewInfo: MapViewInfo;
  categoryName?: string;
  clientName?: string;
  aoiBounds?: [[number, number], [number, number]];
  candidates?: { latitude: number; longitude: number; color?: string }[];
  legendItems?: SheetLegendItem[];
  legendTitle?: string;
  basemap: ExportBasemapConfig;
}

export default function MapExportModal({
  open,
  onClose,
  map,
  target,
  viewInfo,
  categoryName = "Survey Map",
  clientName = "Site Survey",
  aoiBounds,
  candidates,
  legendItems,
  legendTitle,
  basemap,
}: MapExportModalProps) {
  const [title, setTitle] = useState(
    `${categoryName.toUpperCase()} — ${clientName || "SITE AREA"}`
  );
  const [includeLegend, setIncludeLegend] = useState(true);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeNorthArrow, setIncludeNorthArrow] = useState(true);
  const [includeScaleBar, setIncludeScaleBar] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const quality = useMemo(() => detectOptimalQuality(), []);

  if (!open) return null;

  async function handleExport() {
    if (!map) {
      setErrorMessage("Map view is not ready yet. Please wait a moment and try again.");
      return;
    }
    setExporting(true);
    setSuccess(false);
    setErrorMessage(null);

    try {
      const slug = (clientName || "survey")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_");
      const timestamp = new Date().toISOString().slice(0, 10);

      const options: MapExportOptions = {
        title,
        client: clientName,
        categoryName,
        coords: viewInfo.coords || `${target.latitude.toFixed(4)}°, ${target.longitude.toFixed(4)}°`,
        includeLegend,
        includeHeader,
        includeNorthArrow,
        includeScaleBar,
        includeNeatline: true,
        target,
        aoiBounds,
        candidates,
        legendItems,
        legendTitle,
        attribution: basemap.attribution,
        tileUrlTemplate: basemap.tileUrlTemplate,
        maxNativeZoom: basemap.maxNativeZoom,
      };

      await exportMapAsPdf(map, `${slug}_survey_sheet_${timestamp}.pdf`, options);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1400);
    } catch (err) {
      console.error("Failed to export map sheet PDF:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to export map sheet PDF. Please try again."
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-4.5" />
            </div>
            <div>
              <h3 id="export-modal-title" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <span>Export Official Survey Map Sheet</span>
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">PDF</span>
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Vector A4 sheet with graticule, legend, scale bar &amp; north arrow
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          {/* Quality detection callout */}
          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Sparkles className="size-3.5 text-primary shrink-0" />
              <span>Print Resolution:</span>
              <strong className="text-primary">{quality.label}</strong>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3 text-success" />
              <span>Vector Annotations</span>
            </div>
          </div>

          {/* View extent details */}
          <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Zoom &amp; Scale:</span>
              <span className="font-mono font-medium text-foreground">Zoom {viewInfo.zoom} ({viewInfo.scale})</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Center GPS:</span>
              <span className="font-mono text-foreground truncate max-w-[260px]">
                {viewInfo.coords || `${target.latitude.toFixed(4)}°, ${target.longitude.toFixed(4)}°`}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Survey Domain:</span>
              <span className="font-medium text-foreground">{categoryName}</span>
            </div>
          </div>

          {/* Document Title */}
          <div>
            <label className="text-xs font-medium text-foreground">Map Sheet Title Block</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary font-medium"
              placeholder="Official map sheet title..."
            />
          </div>

          {/* Surveyor Elements Options */}
          <div className="rounded-lg border border-border/70 bg-card/60 p-3 space-y-2 text-xs">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground block">
              Cartographic Elements
            </span>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHeader}
                  onChange={(e) => setIncludeHeader(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary"
                />
                <span>Title block &amp; GPS</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeNorthArrow}
                  onChange={(e) => setIncludeNorthArrow(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary"
                />
                <span>North arrow</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeScaleBar}
                  onChange={(e) => setIncludeScaleBar(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary"
                />
                <span>Segmented scale bar</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLegend}
                  onChange={(e) => setIncludeLegend(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary"
                />
                <span>Classification legend</span>
              </label>
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center justify-between">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-destructive font-bold ml-2 hover:opacity-75"
              >
                ×
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleExport()}
            disabled={exporting || !map}
            className="gap-1.5"
          >
            {exporting ? (
              <>
                <Loader className="size-3.5 animate-spin" />
                <span>Generating High-Res PDF...</span>
              </>
            ) : success ? (
              <>
                <Check className="size-3.5 text-success" />
                <span>Downloaded PDF!</span>
              </>
            ) : (
              <>
                <Download className="size-3.5" />
                <span>Download Map Sheet (PDF)</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
