import type { CadModelState } from "../cadModel.ts";
import {
  cutFillBetween,
  cutFillToElevation,
  lastBackend,
  volumeBetween,
  volumeToElevation,
} from "../survey/tinBridge.ts";
import { fmtArea } from "../survey/format.ts";
import { pickSurface, type WorkflowApi, type WorkflowServices } from "./workflowCtx.ts";

export async function runVolumeToElevation(model: CadModelState, api: WorkflowApi, services: WorkflowServices): Promise<void> {
  if (model.surfaces.length === 0) { services.log("Volume: build a TIN surface first.", "error"); return; }
  const surface = await pickSurface(model.surfaces, services.dialog, "Choose surface for volume calculation");
  if (!surface) return;

  const zValues = surface.points.map((p) => p.z).filter((z): z is number => z != null && Number.isFinite(z));
  if (zValues.length === 0) { services.log("Volume: selected surface has no valid elevations.", "error"); return; }
  let zMin = Infinity, zMax = -Infinity;
  for (const z of zValues) { if (z < zMin) zMin = z; if (z > zMax) zMax = z; }
  const zMean = zValues.reduce((a, b) => a + b, 0) / zValues.length;

  const optionValues: Record<string, number> = {
    [`Lowest (${zMin.toFixed(3)} m)`]: zMin,
    [`Highest (${zMax.toFixed(3)} m)`]: zMax,
    [`Mean (${zMean.toFixed(3)} m)`]: zMean,
  };
  const options = [...Object.keys(optionValues), "Custom value…"];
  const chosen = await services.dialog.select(
    `Choose a reference level for the volume calculation. Surface RL range ${zMin.toFixed(2)}–${zMax.toFixed(2)} m:`,
    options,
  );
  if (chosen == null) return;

  let reference: number;
  if (optionValues[chosen] != null) {
    reference = optionValues[chosen];
  } else {
    const rlRaw = await services.dialog.prompt(
      `Reference level / RL (m). Surface RL range ${zMin.toFixed(2)}–${zMax.toFixed(2)} m:`,
      zMean.toFixed(3),
    );
    if (rlRaw == null) return;
    reference = parseFloat(rlRaw);
    if (!Number.isFinite(reference)) { services.log("Volume: invalid reference level.", "error"); return; }
  }
  const tin = { points: surface.points, triangles: surface.triangles };
  const v = await volumeToElevation(tin, reference);
  // Build a coloured 3D earthworks model from the per-triangle cut/fill, so
  // the volume result is visible in the 3D view (red = cut, blue = fill).
  const cf = cutFillToElevation(tin, reference);
  api.ensureLayerById("CUT_FILL");
  api.addSurface({
    name: `Cut/Fill vs RL ${reference} m`,
    points: surface.points,
    triangles: surface.triangles,
    layerId: "CUT_FILL",
    cutFill: { ...cf, mode: "elevation", reference },
  });
  services.show3d();
  services.fitExtents();
  services.log(
    `Volume vs RL ${reference} m — cut ${v.cut.toFixed(2)} m³ · fill ${v.fill.toFixed(2)} m³ · ` +
    `net ${v.net.toFixed(2)} m³ · plan ${fmtArea(v.planArea)} (${lastBackend()}). ` +
    `Cut/Fill model shown in 3D.`,
  );
}

export async function runVolumeBetween(model: CadModelState, api: WorkflowApi, services: WorkflowServices): Promise<void> {
  if (model.surfaces.length < 2) {
    services.log("Volume Δ: need two TIN surfaces (build a second one).", "error");
    return;
  }
  const top = await pickSurface(model.surfaces, services.dialog, "Choose the TOP (design/existing) surface");
  if (!top) return;
  const base = await pickSurface(
    model.surfaces.filter((s) => s.id !== top.id),
    services.dialog,
    "Choose the BASE (comparison) surface",
  );
  if (!base) return;
  const modeChoice = await services.dialog.select(
    "Footprint handling where the top surface extends beyond the base surface:",
    [
      "Overlap only — compute over the shared area (top points outside base are ignored)",
      "Strict — report an error if any top point lies outside the base footprint",
    ],
  );
  if (modeChoice == null) return;
  const footprintMode = modeChoice.startsWith("Strict") ? "strict" as const : "overlap" as const;
  const topTin = { points: top.points, triangles: top.triangles };
  const baseTin = { points: base.points, triangles: base.triangles };
  let v;
  try {
    v = await volumeBetween(topTin, baseTin, footprintMode);
  } catch (err) {
    services.log(err instanceof Error ? err.message : "Volume Δ failed.", "error");
    return;
  }
  // Coloured 3D earthworks model on the top surface (red = cut, blue = fill).
  const cf = cutFillBetween(topTin, baseTin);
  api.ensureLayerById("CUT_FILL");
  api.addSurface({
    name: `Cut/Fill "${top.name}" vs "${base.name}"`,
    points: top.points,
    triangles: top.triangles,
    layerId: "CUT_FILL",
    cutFill: { ...cf, mode: "between" },
  });
  services.show3d();
  services.fitExtents();
  services.log(
    `Volume "${top.name}" vs "${base.name}" — cut ${v.cut.toFixed(2)} m³ · ` +
    `fill ${v.fill.toFixed(2)} m³ · net ${v.net.toFixed(2)} m³ (${lastBackend()}). ` +
    `Cut/Fill model shown in 3D.`,
  );
}
