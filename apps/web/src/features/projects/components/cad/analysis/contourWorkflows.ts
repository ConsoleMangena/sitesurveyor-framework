import type { CadModelState } from "../cadModel.ts";
import { generateContours, lastBackend } from "../survey/tinBridge.ts";
import { pickSurface, type WorkflowApi, type WorkflowServices } from "./workflowCtx.ts";

/** Pick a sensible, round contour interval for a given elevation range. */
function autoContourInterval(range: number): number {
  if (range <= 0 || !Number.isFinite(range)) return 1;
  const target = range / 10;
  const pow10 = 10 ** Math.floor(Math.log10(target));
  const mult = target / pow10;
  if (mult <= 1) return pow10;
  if (mult <= 2) return 2 * pow10;
  if (mult <= 5) return 5 * pow10;
  return 10 * pow10;
}

export async function runBuildContours(model: CadModelState, api: WorkflowApi, services: WorkflowServices): Promise<void> {
  if (model.surfaces.length === 0) {
    services.log("Contours: build a TIN surface first (Surface ▸ Build TIN).", "error");
    return;
  }
  const surface = await pickSurface(model.surfaces, services.dialog, "Choose surface for contours");
  if (!surface) return;

  const zValues = surface.points
    .map((p) => p.z)
    .filter((z): z is number => z != null && Number.isFinite(z));
  if (zValues.length === 0) { services.log("Contours: selected surface has no valid elevations.", "error"); return; }
  let zMin = Infinity, zMax = -Infinity;
  for (const z of zValues) { if (z < zMin) zMin = z; if (z > zMax) zMax = z; }
  const defaultInterval = autoContourInterval(zMax - zMin);

  const intervalRaw = await services.dialog.prompt(
    `Contour interval (m). Surface RL range ${zMin.toFixed(2)}–${zMax.toFixed(2)}:`,
    String(defaultInterval),
  );
  if (intervalRaw == null) return;
  const interval = parseFloat(intervalRaw);
  if (!Number.isFinite(interval) || interval <= 0) {
    services.log("Contours: interval must be a positive number.", "error");
    return;
  }

  // Every Nth contour is an "index" contour — drawn heavier and labelled,
  // exactly like a topographic sheet. Default 5 (the survey convention).
  // 0 disables index contours entirely (all intermediate).
  const everyRaw = await services.dialog.prompt("Index contour every N intervals (heavier + labelled; 0 = none):", "5");
  if (everyRaw == null) return;
  const indexEvery = Math.max(0, Math.round(parseFloat(everyRaw) ?? 5));

  const suggestedBase = Math.floor(zMin / interval) * interval;
  const baseRaw = await services.dialog.prompt(
    `Lowest contour elevation (m). Surface RL range ${zMin.toFixed(2)}–${zMax.toFixed(2)}, suggested base ${suggestedBase.toFixed(3)}:`,
    String(suggestedBase),
  );
  if (baseRaw == null) return;
  const base = parseFloat(baseRaw);
  if (!Number.isFinite(base)) {
    services.log("Contours: invalid base elevation.", "error");
    return;
  }

  const smoothRaw = await services.dialog.prompt("Smoothing passes (0 = raw chords):", "2");
  if (smoothRaw == null) return;
  const smooth = Math.max(0, Math.round(parseFloat(smoothRaw) || 0));

  services.log("Generating contours…");
  const lines = await generateContours(
    { points: surface.points, triangles: surface.triangles },
    interval,
    base,
    smooth,
  );
  if (lines.length === 0) {
    services.log("Contours: none generated for that interval.", "error");
    return;
  }
  let indexCount = 0;
  api.ensureLayerById("CONTOURS");
  api.ensureLayerById("CONTOURS_INDEX");
  api.beginTransaction();
  try {
    for (const line of lines) {
      // A contour is an index contour when its step from the base is a whole
      // multiple of indexEvery. Rounded comparison avoids float drift. The
      // base must be subtracted first — a non-integral base shifts ALL
      // contours off the index elevations otherwise.
      const steps = Math.round((line.elevation - base) / interval);
      const isIndex = indexEvery > 0 && steps % indexEvery === 0;
      if (isIndex) indexCount += 1;
      api.addLinework({
        kind: "polyline",
        vertices: line.vertices.map((v) => ({ n: v.n, e: v.e })),
        closed: false,
        layerId: isIndex ? "CONTOURS_INDEX" : "CONTOURS",
        // Every contour records its elevation in `label` so the 3D view can
        // lift it to the correct RL. The 2D renderer only *shows* the label on
        // index contours (CONTOURS_INDEX layer), matching topo cartography.
        label: `${line.elevation.toFixed(2)}`,
      });
    }
  } finally {
    api.endTransaction();
  }
  services.log(
    `Generated ${lines.length} contour(s) at ${interval} m — ` +
      (indexEvery > 0
        ? `${indexCount} index (every ${indexEvery}) labelled, ${lines.length - indexCount} intermediate (${lastBackend()}).`
        : `no index contours (${lastBackend()}).`),
  );
}
