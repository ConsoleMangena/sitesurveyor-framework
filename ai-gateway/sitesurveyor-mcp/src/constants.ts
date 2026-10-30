// Shared constants for the SiteSurveyor MCP tools: table allowlists, filter
// operators, and the CAD model entity mapping. Mirrors ai-agent.ts.

export const READ_TABLES = new Set([
  "workspaces",
  "workspace_members",
  "profiles",
  "projects",
  "project_activities",
  "quotes",
  "quote_items",
  "invoices",
  "invoice_items",
  "contacts",
  "assets",
  "asset_calibrations",
  "asset_maintenance_events",
  "jobs",
  "job_events",
  "job_assignments",
  "time_entries",
  "expense_entries",
  "notifications",
  "marketplace_listings",
  "professionals",
  "market_firms",
  "market_events",
  "market_job_posts",
  "project_cad_drawings",
]);

export const WRITE_TABLES = new Set([
  "quotes",
  "projects",
  "contacts",
  "jobs",
  "invoices",
  "assets",
  "job_events",
]);

export const FILTER_OPS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
]);

/** Maps entity singular → its JSONB array key inside the CAD model. */
export const CAD_ENTITY_ARRAYS: Record<string, string> = {
  point: "points",
  linework: "linework",
  text: "texts",
  circle: "circles",
  arc: "arcs",
  ellipse: "ellipses",
  hatch: "hatches",
  dimension: "dimensions",
  surface: "surfaces",
};

export const CAD_MODEL_CAP_CHARS = 48_000;
export const CAD_SAMPLE_IDS_PER_TYPE = 25;

export const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Names of every MCP tool this server exposes. */
export const TOOL_NAMES = [
  "inspect_columns",
  "query_site_data",
  "count_site_data",
  "insert_site_record",
  "update_site_record",
  "delete_site_record",
  "close_overdue_invoices",
  "create_quote_from_line_items",
  "schedule_job",
  "get_cad_drawing",
  "list_cad_layers",
  "count_cad_entities",
  "inspect_cad_entity",
  "remember",
  "forget",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
