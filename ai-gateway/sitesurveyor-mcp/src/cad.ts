// CAD model helpers. Reads a project's CAD model JSONB and exposes layer / entity
// inspection used by get_cad_drawing, list_cad_layers, count_cad_entities and
// inspect_cad_entity.

import { supabaseFetch, type DbResult } from "./supabase.js";
import {
  CAD_ENTITY_ARRAYS,
  CAD_MODEL_CAP_CHARS,
  CAD_SAMPLE_IDS_PER_TYPE,
} from "./constants.js";

export interface CadEntity {
  id: string;
  layer?: string;
  type?: string;
  [key: string]: unknown;
}

export interface CadModel {
  id?: string;
  name?: string;
  layerArray?: string[];
  points: CadEntity[];
  linework: CadEntity[];
  texts: CadEntity[];
  circles: CadEntity[];
  arcs: CadEntity[];
  ellipses: CadEntity[];
  hatches: CadEntity[];
  dimensions: CadEntity[];
  surfaces: CadEntity[];
  [key: string]: unknown;
}

export interface DrawingRow {
  id: string;
  name?: string | null;
  cadjson?: CadModel | string | null;
  [key: string]: unknown;
}

export async function fetchDrawing(
  supabaseUrl: string,
  serviceKey: string,
  projectId: string,
  drawingId: string,
): Promise<DbResult> {
  return supabaseFetch({
    supabaseUrl,
    serviceKey,
    method: "GET",
    path: `project_cad_drawings?project_id=eq.${encodeURIComponent(projectId)}&id=eq.${encodeURIComponent(drawingId)}&select=*&limit=1`,
    preferCount: true,
  });
}

function parseModel(row: DrawingRow): CadModel | null {
  const raw = row.cadjson;
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as CadModel;
    } catch {
      return null;
    }
  }
  return raw as CadModel;
}

export function entityArray(model: CadModel, entityType: string): CadEntity[] | null {
  const key = CAD_ENTITY_ARRAYS[entityType];
  if (!key) return null;
  const arr = model[key];
  return Array.isArray(arr) ? (arr as CadEntity[]) : [];
}

export function capModel(model: CadModel): CadModel {
  const copy: CadModel = { ...model };
  copy.cadjson = undefined;
  for (const key of Object.values(CAD_ENTITY_ARRAYS)) {
    const arr = (model[key] as CadEntity[] | undefined) ?? [];
    copy[key] = arr.slice(0, CAD_SAMPLE_IDS_PER_TYPE);
  }
  return copy;
}

/** Serialize a model with a defensive size cap to avoid giant MCP payloads. */
export function serializeModel(model: CadModel | null): unknown {
  if (!model) return null;
  const capped = capModel(model);
  let text = JSON.stringify(capped);
  if (text && text.length > CAD_MODEL_CAP_CHARS) {
    text = text.slice(0, CAD_MODEL_CAP_CHARS) + "\n...[truncated]";
  }
  try {
    return JSON.parse(text);
  } catch {
    return JSON.stringify(text);
  }
}

export function modelError(result: DbResult): string | null {
  if (result.json && typeof result.json === "object") {
    const msg = (result.json as { message?: string }).message;
    if (msg) return msg;
  }
  return null;
}
