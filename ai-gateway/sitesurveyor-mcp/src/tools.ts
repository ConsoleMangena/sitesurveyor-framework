// Tool dispatch for the SiteSurveyor MCP server. Each handler returns a JSON
// string (the MCP tool result content), mirroring ai-agent.ts executeTool and
// workflows.ts behaviour.

import { supabaseFetch } from "./supabase.js";
import {
  READ_TABLES,
  WRITE_TABLES,
  FILTER_OPS,
  CAD_ENTITY_ARRAYS,
  CAD_MODEL_CAP_CHARS,
  CAD_SAMPLE_IDS_PER_TYPE,
} from "./constants.js";
import { SchemaCache } from "./schema.js";
import {
  closeOverdueInvoices,
  createQuoteFromLineItems,
  scheduleJob,
} from "./workflows.js";
import { remember as memRemember, forget as memForget } from "./memory.js";

export interface ToolContext {
  supabaseUrl: string;
  serviceKey: string;
  workspaceId?: string;
  stateDir: string;
  sessionId: string;
}

export type ToolError = { error: string; [k: string]: unknown };

function json(value: unknown): string {
  return JSON.stringify(value);
}

function truncateRows(rows: unknown): string {
  const text = JSON.stringify(rows);
  return text.length > 12_000 ? text.slice(0, 12_000) + "...[truncated]" : text;
}

function buildQueryPath(
  table: string,
  filters: { column: string; op: string; value: string }[] | undefined,
  orderBy: string | undefined,
  orderDir: string | undefined,
  limit: number | undefined,
): string {
  const params = new URLSearchParams();
  params.set("select", "*");
  for (const f of filters ?? []) {
    params.set(f.column, `${f.op}.${f.value}`);
  }
  if (orderBy) params.set("order", `${orderBy}${orderDir ? "." + orderDir : ""}`);
  params.set("limit", String(Math.min(Math.max(limit ?? 20, 1), 100)));
  return `${table}?${params.toString()}`;
}

const uuidRe = /^[0-9a-f-]{36}$/i;

interface CadLookup {
  model: Record<string, unknown>;
}

async function fetchCadModel(
  ctx: ToolContext,
  projectId: string,
  drawingId?: string,
): Promise<{ ok: true; row: CadLookup } | { ok: false; error: string }> {
  const path = drawingId
    ? `project_cad_drawings?project_id=eq.${projectId}&id=eq.${drawingId}&select=model`
    : `project_cad_drawings?project_id=eq.${projectId}&select=model`;
  const out = await supabaseFetch({
    supabaseUrl: ctx.supabaseUrl,
    serviceKey: ctx.serviceKey,
    method: "GET",
    path,
  });
  if (!out.ok)
    return { ok: false, error: json({ error: `HTTP ${out.status}`, details: out.json }) };
  const rows = Array.isArray(out.json) ? out.json : [];
  if (rows.length === 0)
    return { ok: false, error: json({ error: "No drawing found for this project." }) };
  return { ok: true, row: rows[0] as CadLookup };
}

function cadArr(model: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return Array.isArray(model[key]) ? (model[key] as Record<string, unknown>[]) : [];
}

async function handleCad(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const projectId = String(args.project_id ?? "");
  if (!uuidRe.test(projectId))
    return json({ error: "A valid project_id UUID is required." });
  for (const key of ["layer_id", "entity_id"]) {
    const value = args[key];
    if (value != null && !uuidRe.test(String(value)))
      return json({ error: `A valid ${key} UUID is required.` });
  }
  const drawingId = args.drawing_id != null ? String(args.drawing_id) : undefined;
  const res = await fetchCadModel(ctx, projectId, drawingId);
  if (!res.ok) return res.error;
  const model = (res.row.model && typeof res.row.model === "object")
    ? (res.row.model as Record<string, unknown>)
    : {};
  const arr = (key: string) => cadArr(model, key);

  if (name === "get_cad_drawing") {
    const full = JSON.stringify(model);
    if (full.length <= CAD_MODEL_CAP_CHARS) return json({ model });
    const counts: Record<string, number> = {};
    const idSamples: Record<string, string[]> = {};
    for (const [singular, plural] of Object.entries(CAD_ENTITY_ARRAYS)) {
      const entities = arr(plural);
      counts[singular] = entities.length;
      idSamples[singular] = entities
        .slice(0, CAD_SAMPLE_IDS_PER_TYPE)
        .map((e) => String(e.id))
        .filter((id) => id && id !== "undefined");
    }
    return json({
      model_summary_only: true,
      reason: `Full drawing is ${full.length} chars — too large to inline.`,
      entity_counts: counts,
      layers: arr("layers").map((layer) => ({
        id: layer.id,
        name: layer.name,
        color: layer.color,
        visible: layer.visible,
        locked: layer.locked,
      })),
      sample_entity_ids: idSamples,
      next_step:
        "Use count_cad_entities / list_cad_layers for totals and inspect_cad_entity for individual entities. Never guess geometry you have not fetched.",
    });
  }

  if (name === "list_cad_layers") {
    const counts = new Map<string, number>();
    for (const plural of Object.values(CAD_ENTITY_ARRAYS)) {
      for (const entity of arr(plural)) {
        const layerId = entity.layerId;
        if (typeof layerId === "string")
          counts.set(layerId, (counts.get(layerId) ?? 0) + 1);
      }
    }
    return json({
      layers: arr("layers").map((layer) => ({
        id: layer.id,
        name: layer.name,
        color: layer.color,
        visible: layer.visible,
        locked: layer.locked,
        entity_count: counts.get(typeof layer.id === "string" ? layer.id : "") ?? 0,
      })),
    });
  }

  if (name === "count_cad_entities") {
    const layerFilter = String(args.layer_id ?? "") || undefined;
    const typeFilter = String(args.entity_type ?? "") || undefined;
    if (typeFilter && !(typeFilter in CAD_ENTITY_ARRAYS))
      return json({
        error: `Unknown entity_type '${typeFilter}'. Valid types: ${Object.keys(CAD_ENTITY_ARRAYS).join(", ")}.`,
      });
    const byType: Record<string, number> = {};
    let total = 0;
    for (const [singular, plural] of Object.entries(CAD_ENTITY_ARRAYS)) {
      if (typeFilter && singular !== typeFilter) continue;
      const entities = arr(plural);
      const n = layerFilter
        ? entities.filter((e) => e.layerId === layerFilter).length
        : entities.length;
      byType[singular] = n;
      total += n;
    }
    return json({
      total,
      by_type: byType,
      layer_filter: layerFilter ?? null,
      type_filter: typeFilter ?? null,
    });
  }

  const entityId = String(args.entity_id ?? "");
  for (const [singular, plural] of Object.entries(CAD_ENTITY_ARRAYS)) {
    const found = arr(plural).find((e) => e.id === entityId);
    if (found) return json({ entity_type: singular, entity: found });
  }
  return json({ error: "Entity not found" });
}

async function handleWrite(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  schemas: SchemaCache,
): Promise<string> {
  const table = String(args.table ?? "");
  if (!WRITE_TABLES.has(table)) return json({ error: `Table '${table}' is not writable.` });
  const schema = await schemas.get(table);
  const confirmed = args.confirmed === true;

  const sanitise = (
    payload: Record<string, unknown> | undefined,
  ): { clean: Record<string, unknown>; dropped: string[] } => {
    const input = { ...(payload ?? {}) };
    const dropped: string[] = [];
    let clean = input;
    if (schema) {
      clean = {};
      for (const [key, value] of Object.entries(input)) {
        if (key === "id" || key === "created_at" || key === "updated_at") continue;
        if (schema.columns.includes(key)) clean[key] = value;
        else dropped.push(key);
      }
    }
    if (ctx.workspaceId && (!schema || schema.hasWorkspaceId)) {
      if (clean.workspace_id == null) clean.workspace_id = ctx.workspaceId;
    }
    return { clean, dropped };
  };

  if (name === "insert_site_record") {
    const { clean, dropped } = sanitise(args.record as Record<string, unknown>);
    if (dropped.length > 0) {
      return json({
        error: `Ignored unknown columns: ${dropped.join(", ")}`,
        valid_columns: schema ? schema.columns : undefined,
      });
    }
    const out = await supabaseFetch({
      supabaseUrl: ctx.supabaseUrl,
      serviceKey: ctx.serviceKey,
      method: "POST",
      path: table,
      body: clean,
    });
    if (!out.ok)
      return json({
        error: `HTTP ${out.status}`,
        details: out.json,
        hint: schema
          ? `Valid columns for ${table}: ${schema.columns.join(", ")}`
          : undefined,
      });
    const inserted = Array.isArray(out.json) ? out.json[0] : null;
    const newId = inserted && typeof inserted.id === "string" ? inserted.id : undefined;
    if (!newId) return json({ inserted: out.json, _verified: false });
    const verify = await supabaseFetch({
      supabaseUrl: ctx.supabaseUrl,
      serviceKey: ctx.serviceKey,
      method: "GET",
      path: `${table}?id=eq.${newId}&select=*`,
    });
    const row = Array.isArray(verify.json) ? verify.json[0] : inserted;
    return json({ inserted: row, _verified: verify.ok && !!row });
  }

  const id = String(args.id ?? "");
  if (!uuidRe.test(id)) return json({ error: "A valid UUID id is required." });

  if (name === "update_site_record") {
    const { clean, dropped } = sanitise(args.patch as Record<string, unknown>);
    if (dropped.length > 0) {
      return json({
        error: `Ignored unknown columns: ${dropped.join(", ")}`,
        valid_columns: schema ? schema.columns : undefined,
      });
    }
    const out = await supabaseFetch({
      supabaseUrl: ctx.supabaseUrl,
      serviceKey: ctx.serviceKey,
      method: "PATCH",
      path: `${table}?id=eq.${id}`,
      body: clean,
    });
    if (!out.ok)
      return json({
        error: `HTTP ${out.status}`,
        details: out.json,
        hint: schema
          ? `Valid columns for ${table}: ${schema.columns.join(", ")}`
          : undefined,
      });
    const verify = await supabaseFetch({
      supabaseUrl: ctx.supabaseUrl,
      serviceKey: ctx.serviceKey,
      method: "GET",
      path: `${table}?id=eq.${id}&select=*`,
    });
    const row = Array.isArray(verify.json) ? verify.json[0] : null;
    return json({ updated: row ?? out.json, _verified: verify.ok && !!row });
  }

  if (name === "delete_site_record") {
    if (!confirmed)
      return json({
        status: "pending_confirmation",
        instruction:
          "Deletes are permanent. Confirm scope with the user and suggest archiving instead when sensible. Only then confirmed=true.",
        table,
        id,
      });
    const out = await supabaseFetch({
      supabaseUrl: ctx.supabaseUrl,
      serviceKey: ctx.serviceKey,
      method: "DELETE",
      path: `${table}?id=eq.${id}`,
    });
    if (!out.ok) return json({ error: `HTTP ${out.status}`, details: out.json });
    return json({ deleted: true });
  }

  return json({ error: `Unknown write tool '${name}'.` });
}

export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<string> {
  const args = (rawArgs && typeof rawArgs === "object"
    ? rawArgs
    : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const schemas = new SchemaCache(ctx.supabaseUrl, ctx.serviceKey);

  if (name === "inspect_columns") {
    const table = str(args.table);
    if (!READ_TABLES.has(table)) return json({ error: `Table '${table}' is not readable.` });
    const out = await supabaseFetch({
      supabaseUrl: ctx.supabaseUrl,
      serviceKey: ctx.serviceKey,
      method: "GET",
      path: `${table}?select=*&limit=1`,
    });
    if (!out.ok) return json({ error: `HTTP ${out.status}`, details: out.json });
    const row = Array.isArray(out.json) ? out.json[0] : null;
    return json({ table, columns: row ? Object.keys(row as Record<string, unknown>) : [] });
  }

  if (name === "query_site_data" || name === "count_site_data") {
    const table = str(args.table);
    if (!READ_TABLES.has(table)) return json({ error: `Table '${table}' is not readable.` });
    const tableSchema = await schemas.get(table);
    const filters = Array.isArray(args.filters)
      ? (args.filters as { column?: unknown; op?: unknown; value?: unknown }[])
          .filter(
            (f) =>
              typeof f.column === "string" &&
              typeof f.op === "string" &&
              FILTER_OPS.has(String(f.op)),
          )
          .map((f) => ({ column: String(f.column), op: String(f.op), value: String(f.value ?? "") }))
      : undefined;
    if (filters?.length && tableSchema) {
      const unknown = filters.filter((f) => !tableSchema.columns.includes(f.column));
      if (unknown.length > 0) {
        return json({
          error: `Unknown filter column(s): ${unknown.map((f) => f.column).join(", ")}`,
          valid_columns: tableSchema.columns,
        });
      }
    }
    if (name === "count_site_data") {
      const path = buildQueryPath(table, filters, undefined, undefined, 1);
      const out = await supabaseFetch({
        supabaseUrl: ctx.supabaseUrl,
        serviceKey: ctx.serviceKey,
        method: "GET",
        path,
        preferCount: true,
      });
      if (!out.ok) return json({ error: `HTTP ${out.status}`, details: out.json });
      return json({ table, count: out.count });
    }
    const path = buildQueryPath(
      table,
      filters,
      args.order_by == null ? undefined : str(args.order_by),
      str(args.order_dir) || undefined,
      typeof args.limit === "number" ? args.limit : undefined,
    );
    const out = await supabaseFetch({
      supabaseUrl: ctx.supabaseUrl,
      serviceKey: ctx.serviceKey,
      method: "GET",
      path,
    });
    if (!out.ok) return json({ error: `HTTP ${out.status}`, details: out.json });
    return truncateRows(out.json);
  }

  if (
    name === "get_cad_drawing" ||
    name === "list_cad_layers" ||
    name === "count_cad_entities" ||
    name === "inspect_cad_entity"
  ) {
    return handleCad(name, args, ctx);
  }

  if (name === "close_overdue_invoices") {
    return closeOverdueInvoices(
      { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey, workspaceId: ctx.workspaceId },
      args as { scope?: { workspace_id?: string }; target_status?: string },
    );
  }
  if (name === "create_quote_from_line_items") {
    return createQuoteFromLineItems(
      { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey, workspaceId: ctx.workspaceId },
      args as {
        project_id?: string;
        contact_id?: string;
        currency_code?: string;
        lines: { description?: string; qty?: number; rate?: number; unit?: string }[];
        tax_rate_percent?: number;
        notes?: string;
      },
    );
  }
  if (name === "schedule_job") {
    return scheduleJob(
      { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey, workspaceId: ctx.workspaceId },
      args as { job_id: string; assignment_date?: string; notes?: string; status?: "draft" | "confirmed" | "in_progress" | "completed" | "cancelled" },
    );
  }

  if (name === "remember" || name === "forget") {
    const key = str(args.key);
    if (!key) return json({ error: "A non-empty key is required." });
    if (name === "remember") {
      const scope = str(args.scope) || "user";
      const res = await memRemember(ctx.stateDir, ctx.sessionId, {
        scope,
        key,
        value: String(args.value ?? ""),
      });
      return json({ remembered: res.changed, key, scope });
    }
    const scope = str(args.scope) || "user";
    const res = await memForget(ctx.stateDir, ctx.sessionId, scope, key);
    return json({ forgotten: res.changed, key, scope });
  }

  return handleWrite(name, args, ctx, schemas);
}
