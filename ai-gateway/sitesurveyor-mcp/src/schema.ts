// Live PostgREST schema reflection: resolves the columns for a table so write
// tools can reject unknown columns, mirrored from the shared loadTableSchemas.

import { supabaseFetch } from "./supabase.js";
import { READ_TABLES, WRITE_TABLES } from "./constants.js";

export interface TableSchemaInfo {
  table: string;
  columns: string[];
  hasWorkspaceId: boolean;
}

const WATCHED = new Set([...READ_TABLES, ...WRITE_TABLES]);

async function readColumns(
  supabaseUrl: string,
  serviceKey: string,
  table: string,
): Promise<string[] | null> {
  const out = await supabaseFetch({
    supabaseUrl,
    serviceKey,
    method: "GET",
    path: `${table}?select=*&limit=1`,
  });
  if (!out.ok || !Array.isArray(out.json) || out.json.length === 0) return null;
  const row = out.json[0];
  if (!row || typeof row !== "object") return null;
  return Object.keys(row as Record<string, unknown>);
}

export async function loadTableSchema(
  supabaseUrl: string,
  serviceKey: string,
  table: string,
): Promise<TableSchemaInfo | null> {
  if (!WATCHED.has(table)) return null;
  const columns = await readColumns(supabaseUrl, serviceKey, table);
  if (!columns) return null;
  return { table, columns, hasWorkspaceId: columns.includes("workspace_id") };
}

/** A small memoising cache so repeated tool calls within a run don't re-query. */
export class SchemaCache {
  private cache = new Map<string, Promise<TableSchemaInfo | null>>();
  constructor(
    private supabaseUrl: string,
    private serviceKey: string,
  ) {}
  get(table: string): Promise<TableSchemaInfo | null> {
    let p = this.cache.get(table);
    if (!p) {
      p = loadTableSchema(this.supabaseUrl, this.serviceKey, table);
      this.cache.set(table, p);
    }
    return p;
  }
}
