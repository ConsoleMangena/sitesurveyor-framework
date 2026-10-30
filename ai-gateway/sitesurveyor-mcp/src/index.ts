// SiteSurveyor MCP server — stdio transport exposing the SiteSurveyor agent
// tools to OpenClaw (and any MCP-capable host).
//
// Config is read from the environment:
//   SUPABASE_URL             Supabase REST base URL
//   SUPABASE_SERVICE_ROLE_KEY  service-role key used for the agent's reads/writes
//   SITESURVEYOR_WORKSPACE_ID  optional workspace stamped onto new records
//   SITESURVEYOR_STATE_DIR     directory used to persist conversation memory
//
// The MCP session id maps to the OpenClaw session; memory tools are keyed on it
// and persisted under SITESURVEYOR_STATE_DIR.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOL_DEFS, TOOL_DEF_MAP } from "./toolDefs.js";
import { executeTool, type ToolContext } from "./tools.js";
import { loadMemoryEntries, memoryPrompt, type MemoryEntry } from "./memory.js";

function envRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function envOptional(name: string): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

const SESSION_PATTERN = /^[A-Za-z0-9_-]+$/;

function sessionIdFor(meta?: Record<string, unknown>): string {
  let id = "default";
  if (meta && typeof meta.sessionId === "string") {
    const candidate = meta.sessionId;
    id = SESSION_PATTERN.test(candidate) ? candidate : "default";
  }
  return id;
}

export function createToolContext(env: NodeJS.ProcessEnv = process.env): ToolContext {
  return {
    supabaseUrl: envRequired("SUPABASE_URL").replace(/\/$/, ""),
    serviceKey: envRequired("SUPABASE_SERVICE_ROLE_KEY"),
    workspaceId: envOptional("SITESURVEYOR_WORKSPACE_ID"),
    stateDir: envOptional("SITESURVEYOR_STATE_DIR") ?? ".",
    sessionId: "default",
  };
}

export async function startServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const baseCtx = createToolContext(env);
  const server = new Server(
    { name: "sitesurveyor", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const buildCtx = (sessionId: string): ToolContext => ({
    ...baseCtx,
    sessionId,
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS.map((d) => ({
      name: d.name,
      description: d.description,
      inputSchema: d.inputSchema as never,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    const def = TOOL_DEF_MAP[name];
    if (!def) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Unknown tool '${name}'.` }),
          },
        ],
        isError: true,
      };
    }
    const sessionId = sessionIdFor(request.params._meta as Record<string, unknown>);
    try {
      const text = await executeTool(name, args, buildCtx(sessionId));
      return { content: [{ type: "text", text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { loadMemoryEntries, memoryPrompt, type MemoryEntry };

// Start only when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  startServer().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
