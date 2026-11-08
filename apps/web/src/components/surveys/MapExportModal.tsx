import { useState } from "react";
import { Camera, Check, Download, FileText, Image, Loader, X } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";

import { Button } from "@/components/ui/button.tsx";
import type { MapViewInfo } from "./SurveyMap.tsx";
import { exportMapAsPdf, exportMapAsPng } from "../../lib/surveys/mapExport.ts";

interface MapExportModalProps {
  open: boolean;
  onClose: () => void;
  map: LeafletMap | null;
  target: { latitude: number; longitude: number };
  viewInfo: MapViewInfo;
  categoryName?: string;
  clientName?: string;
}

export default function MapExportModal({
  open,
  onClose,
  map,
  target,
  viewInfo,
  categoryName = "Survey Map",
  clientName = "Site Survey",
}: MapExportModalProps) {
  const [format, setFormat] = useState<"png" | "pdf">("png");
  const [title, setTitle] = useState(
    `${categoryName} — ${clientName || "Survey Area"}`
  );
  const [includeLegend, setIncludeLegend] = useState(true);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      const options = {
        title,
        client: clientName,
        categoryName,
        coords: viewInfo.coords || `${target.latitude.toFixed(4)}°, ${target.longitude.toFixed(4)}°`,
        scale: viewInfo.scale,
        includeLegend,
        includeHeader,
        target,
      };

      if (format === "png") {
        await exportMapAsPng(map, `${slug}_extent_${timestamp}.png`, options);
      } else {
        await exportMapAsPdf(map, `${slug}_sheet_${timestamp}.pdf`, options);
      }
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error("Failed to export map extent:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to export map extent. Please try again."
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
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Camera className="size-4" />
            </div>
            <div>
              <h3 id="export-modal-title" className="text-sm font-semibold text-foreground">
                Export Current Map View
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Exports the map framed at your current zoom & position
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

        <div className="mt-4 space-y-4">
          {/* View extent details */}
          <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Zoom Level:</span>
              <span className="font-mono font-medium text-foreground">Zoom {viewInfo.zoom}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Map Scale:</span>
              <span className="font-mono font-medium text-foreground">{viewInfo.scale}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Center GPS:</span>
              <span className="font-mono text-foreground truncate max-w-[220px]">
                {viewInfo.coords || `${target.latitude.toFixed(4)}°, ${target.longitude.toFixed(4)}°`}
              </span>
            </div>
          </div>

          {/* Format selection */}
          <div>
            <label className="text-xs font-medium text-foreground">Export Format</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat("png")}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-colors ${
                  format === "png"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input bg-background hover:bg-muted"
                }`}
              >
                <Image className="size-3.5" />
                <span>High-Res PNG</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat("pdf")}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-colors ${
                  format === "pdf"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input bg-background hover:bg-muted"
                }`}
              >
                <FileText className="size-3.5" />
                <span>Executive PDF</span>
              </button>
            </div>
          </div>

          {/* Document Title */}
          <div>
            <label className="text-xs font-medium text-foreground">Title Block Text</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              placeholder="Map sheet title..."
            />
          </div>

          {/* Options */}
          <div className="space-y-2 pt-1 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeLegend}
                onChange={(e) => setIncludeLegend(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary"
              />
              <span>Include classified potential legend</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeHeader}
                onChange={(e) => setIncludeHeader(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary"
              />
              <span>Include title & coordinate header card</span>
            </label>
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
                <span>Capturing...</span>
              </>
            ) : success ? (
              <>
                <Check className="size-3.5 text-success" />
                <span>Downloaded!</span>
              </>
            ) : (
              <>
                <Download className="size-3.5" />
                <span>Download {format.toUpperCase()}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
