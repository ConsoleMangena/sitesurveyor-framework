// Live PostgREST schema reflection: resolves the columns for a table so write
// tools can reject unknown columns, mirrored from the shared loadTableSchemas.
//
// The column list comes from the Data API's own OpenAPI description, not from a
// sample row: reading a row to learn the shape would read *some tenant's* row,
// and an empty table would leave the tools with no schema at all.

import { supabaseFetch } from "./supabase.js";
import { READ_TABLES, WRITE_TABLES } from "./constants.js";

export interface TableSchemaInfo {
  table: string;
  columns: string[];
  required: string[];
}

const WATCHED = new Set([...READ_TABLES, ...WRITE_TABLES]);

/** One fetch per Supabase URL, shared by every tool call in the process. */
const schemaCache = new Map<string, Promise<Map<string, TableSchemaInfo>>>();

async function loadDefinitions(
  supabaseUrl: string,
  serviceKey: string,
): Promise<Map<string, TableSchemaInfo>> {
  const map = new Map<string, TableSchemaInfo>();
  // `path: ""` targets `${supabaseUrl}/rest/v1/` — the OpenAPI document itself.
  const out = await supabaseFetch({ supabaseUrl, serviceKey, method: "GET", path: "" });
  if (!out.ok || !out.json || typeof out.json !== "object") return map;
  const definitions = (out.json as { definitions?: Record<string, {
    properties?: Record<string, unknown>;
    required?: string[];
  }> }).definitions;
  if (!definitions) return map;
  for (const [table, def] of Object.entries(definitions)) {
    if (!WATCHED.has(table) || !def?.properties) continue;
    map.set(table, {
      table,
      columns: Object.keys(def.properties),
      required: def.required ?? [],
    });
  }
  return map;
}

export function loadTableSchema(
  supabaseUrl: string,
  serviceKey: string,
  table: string,
): Promise<TableSchemaInfo | null> {
  if (!WATCHED.has(table)) return Promise.resolve(null);
  let cached = schemaCache.get(supabaseUrl);
  if (!cached) {
    cached = loadDefinitions(supabaseUrl, serviceKey);
    schemaCache.set(supabaseUrl, cached);
  }
  return cached.then((map) => map.get(table) ?? null);
}

/** A small memoising cache so repeated tool calls within a run don't re-query. */
export class SchemaCache {
  constructor(
    private supabaseUrl: string,
    private serviceKey: string,
  ) {}
  get(table: string): Promise<TableSchemaInfo | null> {
    return loadTableSchema(this.supabaseUrl, this.serviceKey, table);
  }
}
