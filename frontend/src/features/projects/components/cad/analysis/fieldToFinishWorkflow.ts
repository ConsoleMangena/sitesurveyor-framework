import type { CadModelState } from "../cadModel.ts";
import { buildCodeTable } from "../survey/featureCodes.ts";
import { buildFeatureStrings } from "../survey/fieldToFinish.ts";
import type { WorkflowApi, WorkflowServices } from "./workflowCtx.ts";

// ── Field to finish: join coded points into linework strings ────────────────

export function runProcessLinework(model: CadModelState, api: WorkflowApi, services: WorkflowServices): void {
  const table = buildCodeTable();
  const { strings, strungPoints } = buildFeatureStrings(model.points, table);
  if (strings.length === 0) {
    services.log("Process linework: no stringable coded points found (e.g. FL, EK, WALL, BLDG).", "info");
    return;
  }
  let drawn = 0;
  for (const s of strings) {
    api.ensureLayerById(s.def.layerId);
    api.addLinework({
      kind: s.closed ? "boundary" : "polyline",
      vertices: s.vertices.map((v) => ({ n: v.n, e: v.e })),
      closed: s.closed,
      layerId: s.def.layerId,
    });
    drawn += 1;
  }
  services.fitExtents();
  services.log(
    `Field-to-finish: drew ${drawn} linework string(s) from ${strungPoints} coded point(s). ` +
      `Breakline strings are honoured by Build TIN + Breaklines.`,
  );
}
