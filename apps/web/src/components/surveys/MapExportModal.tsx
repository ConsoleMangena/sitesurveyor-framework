import { useMemo, useState } from "react";
import { Check, Download, FileText, Loader, X } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { MapViewInfo } from "./SurveyMap.tsx";
import {
  exportMapAsPdf,
  type ClassifiedTilesOption,
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
  candidates?: {
    latitude: number;
    longitude: number;
    color?: string;
    label?: string;
  }[];
  targetDepthLabel?: string;
  legendItems?: SheetLegendItem[];
  legendTitle?: string;
  /** Optical sensor the analysis ran on, printed in the title panel. */
  opticalSource?: string;
  /** The survey's classified tiles; present when the run published a tile
   *  archive and the raster layer is on. Absent means the sheet exports
   *  without the classification. */
  classifiedTiles?: ClassifiedTilesOption | null;
  basemap: ExportBasemapConfig;
}

function PlacementRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-medium text-foreground">{label}</span>
      <div className="flex rounded-md border border-border p-0.5">
        {options.map(([optionValue, text]) => (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] transition-colors",
              value === optionValue
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
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
  targetDepthLabel,
  legendItems,
  legendTitle,
  opticalSource,
  classifiedTiles,
  basemap,
}: MapExportModalProps) {
  const [title, setTitle] = useState(
    `${categoryName.toUpperCase()} — ${clientName || "SITE AREA"}`
  );
  const [includeLegend, setIncludeLegend] = useState(true);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeNorthArrow, setIncludeNorthArrow] = useState(true);
  const [includeScaleBar, setIncludeScaleBar] = useState(true);
  const [contextFraction, setContextFraction] = useState(0.25);
  // "view" keeps the sheet honest to what the user is looking at: the live
  // map's extent and zoom level. The exact survey-ground framing stays
  // available for the whole-area product.
  const [frame, setFrame] = useState<"view" | "survey">("view");
  const [panelSide, setPanelSide] = useState<"right" | "left">("right");
  const [northPlacement, setNorthPlacement] = useState<"panel" | "map">("panel");
  const [scalePlacement, setScalePlacement] = useState<"panel" | "map">("panel");
  const [gridLineCount, setGridLineCount] = useState(6);
  const [coordMode, setCoordMode] = useState<"degrees" | "utm">("utm");
  const [exporting, setExporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const extentHintKm = useMemo(() => {
    if (!aoiBounds) return null;
    const [[s, w], [n, e]] = aoiBounds;
    const midLat = ((s + n) / 2) * (Math.PI / 180);
    return (e - w) * 111.32 * Math.cos(midLat) * (1 + 2 * contextFraction);
  }, [aoiBounds, contextFraction]);

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
        frame,
        classifiedTiles,
        candidates,
        targetDepthLabel,
        legendItems,
        legendTitle,
        attribution: basemap.attribution,
        tileUrlTemplate: basemap.tileUrlTemplate,
        maxNativeZoom: basemap.maxNativeZoom,
        contextFraction,
        panelSide,
        northArrowPlacement: northPlacement,
        scaleBarPlacement: scalePlacement,
        gridLineCount,
        coordMode,
        opticalSource,
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
                <span>Export Map Sheet</span>
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">PDF</span>
              </h3>
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

          {/* Sheet layout & extent */}
          <div className="rounded-lg border border-border/70 bg-card/60 p-3 space-y-3 text-xs">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground block">
              Sheet Layout &amp; Extent
            </span>
            <PlacementRow
              label="Sheet extent"
              value={frame}
              onChange={setFrame}
              options={[
                ["view", "Map view"],
                ["survey", "Survey area"],
              ]}
            />
            {frame === "view" ? (
              <p className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-[10.5px] leading-snug text-muted-foreground">
                Follows the map's point of view: whatever extent and zoom level the
                workbench is showing is what prints, classified raster included.
              </p>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Context around survey area</span>
                  <span className="font-mono text-muted-foreground">
                    {Math.round(contextFraction * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={contextFraction}
                  onChange={(e) => setContextFraction(Number(e.target.value))}
                  className="mt-1.5 w-full accent-primary"
                  aria-label="Context around the survey area"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>AOI only</span>
                  <span>
                    {extentHintKm !== null
                      ? `Sheet ≈ ${extentHintKm < 10 ? extentHintKm.toFixed(1) : Math.round(extentHintKm)} km across`
                      : "Wide"}
                  </span>
                  <span>Wide</span>
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Grid lines</span>
                <span className="font-mono text-muted-foreground">{gridLineCount}</span>
              </div>
              <input
                type="range"
                min={2}
                max={12}
                step={1}
                value={gridLineCount}
                onChange={(e) => setGridLineCount(Number(e.target.value))}
                className="mt-1.5 w-full accent-primary"
                aria-label="Number of grid lines per axis"
              />
            </div>
            <PlacementRow
              label="Coordinates"
              value={coordMode}
              onChange={setCoordMode}
              options={[
                ["utm", "UTM X/Y"],
                ["degrees", "Degrees"],
              ]}
            />
            <PlacementRow
              label="Title panel"
              value={panelSide}
              onChange={setPanelSide}
              options={[
                ["right", "Right"],
                ["left", "Left"],
              ]}
            />
            <PlacementRow
              label="North arrow"
              value={northPlacement}
              onChange={setNorthPlacement}
              options={[
                ["panel", "Title panel"],
                ["map", "On map"],
              ]}
            />
            <PlacementRow
              label="Scale bar"
              value={scalePlacement}
              onChange={setScalePlacement}
              options={[
                ["panel", "Title panel"],
                ["map", "On map"],
              ]}
            />
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
