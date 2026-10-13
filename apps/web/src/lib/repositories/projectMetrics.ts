import { getCadDrawing } from "./cadDrawings.ts";
import { supabase } from "../supabase/client.ts";
import { cadStorageKey } from "../../features/projects/components/cad/cadModel.ts";

/**
 * Real, data-backed metrics for a project workspace dashboard.
 *
 * These replace the previously fabricated KPI values (which were derived from
 * string-matching the activity log). Where a metric has no real data source
 * yet, it is reported as 0 rather than invented.
 */
export interface ProjectMetrics {
  /** Survey points actually present in the project's CAD drawing. */
  points: number;
  /** Linework entities (lines, polylines, boundaries) in the drawing. */
  linework: number;
  /** TIN surfaces built in the drawing. */
  surfaces: number;
  /** Points flagged with a "QA"/"CHECK" code awaiting review. */
  qaFlags: number;
}

interface CadModelShape {
  points?: { code?: string }[];
  linework?: unknown[];
  surfaces?: unknown[];
}

const QA_CODES = ["QA", "CHECK", "FLAG", "REVIEW"];

function isProjectMetricsOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

function loadCachedCadShape(projectId: string): CadModelShape | null {
  try {
    const raw = localStorage.getItem(cadStorageKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as CadModelShape;
  } catch {
    return null;
  }
}

function metricsFromShape(model: CadModelShape | null): ProjectMetrics {
  const empty: ProjectMetrics = { points: 0, linework: 0, surfaces: 0, qaFlags: 0 };
  if (!model) return empty;

  const points = Array.isArray(model.points) ? model.points : [];
  const qaFlags = points.filter((p) => {
    const code = (p.code ?? "").toUpperCase();
    return QA_CODES.some((q) => code.includes(q));
  }).length;

  return {
    points: points.length,
    linework: Array.isArray(model.linework) ? model.linework.length : 0,
    surfaces: Array.isArray(model.surfaces) ? model.surfaces.length : 0,
    qaFlags,
  };
}

export async function getProjectMetrics(projectId: string): Promise<ProjectMetrics> {
  // When offline, read from the same localStorage cache the CAD workspace uses.
  if (!isProjectMetricsOnline()) {
    return metricsFromShape(loadCachedCadShape(projectId));
  }

  // Fast path: counts computed server-side by the project_cad_metrics RPC,
  // so the (potentially multi-MB) model JSONB never crosses the wire.
  try {
    const { data, error } = await supabase.rpc("project_cad_metrics", {
      p_project_id: projectId,
    });
    if (!error && data && data.length > 0) {
      const row = data[0];
      return {
        points: row.points,
        linework: row.linework,
        surfaces: row.surfaces,
        qaFlags: row.qa_flags,
      };
    }
    if (!error && data?.length === 0) {
      // No server drawing yet, but there might be a local-only one.
      return metricsFromShape(loadCachedCadShape(projectId));
    }
  } catch {
    // Function not deployed yet (or network edge) — fall through to the
    // JSONB download path below.
  }

  try {
    const record = await getCadDrawing(projectId);
    const model = (record?.model ?? null) as CadModelShape | null;
    if (!model) {
      // Nothing on the server yet, but there might be a local-only drawing.
      return metricsFromShape(loadCachedCadShape(projectId));
    }
    return metricsFromShape(model);
  } catch {
    return metricsFromShape(loadCachedCadShape(projectId));
  }
}
