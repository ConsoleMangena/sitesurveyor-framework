// Static JSON-schema tool definitions exposed through MCP. These mirror the
// tool contracts in ai-agent.ts so OpenClaw sees the same surface as the cloud
// agent.

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const STRING = { type: "string" } as const;
const NUMBER = { type: "number" } as const;

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "inspect_columns",
    description:
      "Inspect all columns for a table. Returns column names, types, and whether they are primary keys.",
    inputSchema: {
      type: "object",
      properties: { table: STRING },
      required: ["table"],
      additionalProperties: false,
    },
  },
  {
    name: "query_site_data",
    description:
      "Query a table for site data. Filters are applied as AND conditions. Returns the first `limit` rows. Prefer this over inspecting all data.",
    inputSchema: {
      type: "object",
      properties: {
        table: STRING,
        limit: { type: "number", description: "Rows to return, max 100" },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column: STRING,
              op: {
                type: "string",
                enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike"],
              },
              value: { type: ["string", "number", "boolean"] },
            },
            required: ["column", "op", "value"],
          },
        },
      },
      required: ["table"],
      additionalProperties: false,
    },
  },
  {
    name: "count_site_data",
    description:
      "Count rows in a table matching the optional filters. Use this before writing to understand existing records.",
    inputSchema: {
      type: "object",
      properties: {
        table: STRING,
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column: STRING,
              op: {
                type: "string",
                enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike"],
              },
              value: { type: ["string", "number", "boolean"] },
            },
            required: ["column", "op", "value"],
          },
        },
      },
      required: ["table"],
      additionalProperties: false,
    },
  },
  {
    name: "insert_site_record",
    description:
      "Insert a single row into a table. Returns the created row. Respect system rules and user intent before writing.",
    inputSchema: {
      type: "object",
      properties: {
        table: STRING,
        record: {
          type: "object",
          description: "The record to insert",
          additionalProperties: true,
        },
      },
      required: ["table", "record"],
      additionalProperties: false,
    },
  },
  {
    name: "update_site_record",
    description:
      "Update rows in a table matching the filter. Returns all updated rows. Use a precise filter; scope to a single record.",
    inputSchema: {
      type: "object",
      properties: {
        table: STRING,
        filter: {
          type: "object",
          properties: {
            column: STRING,
            op: {
              type: "string",
              enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike"],
            },
            value: { type: ["string", "number", "boolean"] },
          },
          required: ["column", "op", "value"],
        },
        patch: {
          type: "object",
          description: "The columns and values to update",
          additionalProperties: true,
        },
      },
      required: ["table", "filter", "patch"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_site_record",
    description:
      "Delete rows in a table matching the filter. Returns the deleted rows. Requires explicit user confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        table: STRING,
        filter: {
          type: "object",
          properties: {
            column: STRING,
            op: {
              type: "string",
              enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike"],
            },
            value: { type: ["string", "number", "boolean"] },
          },
          required: ["column", "op", "value"],
        },
      },
      required: ["table", "filter"],
      additionalProperties: false,
    },
  },
  {
    name: "close_overdue_invoices",
    description:
      "Set status='closed' on every invoice whose due_date is before today and status is one of 'draft'/'sent'/'overdue'. Returns the count of invoices closed. This is a bulk write used by the quarterly close workflow.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "create_quote_from_line_items",
    description:
      "Create a quote row plus its quote_items rows from a structured line-item list. Returns the created quote.",
    inputSchema: {
      type: "object",
      properties: {
        quote: {
          type: "object",
          description: "The quote object (project_id, contact_id, ...)",
          additionalProperties: true,
        },
        lineItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: STRING,
              qty: NUMBER,
              rate: NUMBER,
              unit: STRING,
            },
            required: ["description", "qty", "rate"],
          },
        },
      },
      required: ["quote", "lineItems"],
      additionalProperties: false,
    },
  },
  {
    name: "schedule_job",
    description:
      "Schedule a survey job: computes a human summary, inserts the job, and assigns a crew of professionals. Returns the job with any scheduling warnings.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: STRING,
        title: STRING,
        description: STRING,
        scheduled_date: STRING,
        status: STRING,
        crew_size: NUMBER,
        crew_skill: STRING,
        photos_gps_rows: NUMBER,
        boundary_stakeouts: NUMBER,
      },
      required: [
        "project_id",
        "title",
        "scheduled_date",
        "status",
        "crew_size",
        "crew_skill",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "get_cad_drawing",
    description:
      "Read a project's CAD model for a drawing. Returns the first `limit` entities as rows; cadjson is capped to avoid huge payloads.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: STRING,
        drawing_id: STRING,
        limit: { type: "number", description: "Max entities to return", default: 100 },
      },
      required: ["project_id", "drawing_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_cad_layers",
    description:
      "List the layer names present in a project's CAD model. Useful before filtering entities by layer.",
    inputSchema: {
      type: "object",
      properties: { project_id: STRING, drawing_id: STRING },
      required: ["project_id", "drawing_id"],
      additionalProperties: false,
    },
  },
  {
    name: "count_cad_entities",
    description:
      "Count entities in a project's CAD model, optionally by entity type (point/linework/text/...) and layer.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: STRING,
        drawing_id: STRING,
        entity_type: STRING,
        layer: STRING,
      },
      required: ["project_id", "drawing_id"],
      additionalProperties: false,
    },
  },
  {
    name: "inspect_cad_entity",
    description:
      "Inspect the properties of a specific CAD entity by id within a project. Returns the matching entity object or a not-found result.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: STRING,
        drawing_id: STRING,
        entity_id: STRING,
        entity_type: STRING,
      },
      required: ["project_id", "drawing_id", "entity_id"],
      additionalProperties: false,
    },
  },
  {
    name: "remember",
    description:
      "Store a fact about the user or project in this conversation's memory. Memory persists across turns and is loaded automatically. Use for durable personal or project preferences.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["user", "project"],
          description: "Whether the fact is about the user or about a project",
        },
        key: STRING,
        value: STRING,
      },
      required: ["scope", "key", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "forget",
    description:
      "Remove a previously remembered fact. Scope and key must match exactly.",
    inputSchema: {
      type: "object",
      properties: { scope: STRING, key: STRING },
      required: ["scope", "key"],
      additionalProperties: false,
    },
  },
];

export const TOOL_DEF_MAP: Record<string, ToolDef> = Object.fromEntries(
  TOOL_DEFS.map((d) => [d.name, d]),
);
