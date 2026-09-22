// OpenClaw agent runner for the SiteSurveyor host.
//
// Runs one agent turn through the OpenClaw Gateway:
//
//   openclaw agent --agent sitesurveyor --message "<task>" --json
//
// The Gateway is where the SiteSurveyor agent + its MCP tools are registered
// (ambient config ~/.openclaw/openclaw.json: mcp.servers.sitesurveyor →
// sitesurveyor-mcp, agents.entries.sitesurveyor → routing/model). This path is
// preferred over `agent exec` because the Gateway route is fully configured,
// returns promptly, and keeps its own session/memory state.
//
// The Gateway response is parsed and re-projected as the same NDJSON events
// the cloud `ai-chat` Edge Function emits:
//
//   {"type":"status",...}   progress / tool activity
//   {"type":"final","text":"..."}   complete assistant reply
//   {"type":"error","message":"..."}   failure
//
// v1 buffers the complete reply (Gateway turns emit the full result, not a
// live token stream), so a single `final` event is sent when the run completes.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ExecAgentOpts {
  message: string;
  model?: string;
  timeoutMs?: number;
  env: NodeJS.ProcessEnv;
}

export interface AgentRunResult {
  ok: boolean;
  status: "ok" | "error" | "timeout";
  final: string;
  error?: { message?: string; kind?: string };
  usage?: { input?: number; output?: number; total?: number };
  toolSummary?: { calls?: number; tools?: string[] };
  sessionId?: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Map the concrete SiteSurveyor Supabase credentials / workspace onto the
 * SITESURVEYOR_* names used by the ambient OpenClaw config's MCP server env
 * block (mcp.servers.sitesurveyor.env). The DashScope key is passed through
 * unchanged for model auth.
 */
export function buildOpenClawEnv(bindings: {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  WORKSPACE_ID?: string;
  DASHSCOPE_API_KEY?: string;
}): NodeJS.ProcessEnv {
  const superset: NodeJS.ProcessEnv = { ...process.env };
  if (bindings.SUPABASE_URL) superset.SITESURVEYOR_SUPABASE_URL = bindings.SUPABASE_URL;
  if (bindings.SUPABASE_SERVICE_ROLE_KEY)
    superset.SITESURVEYOR_SUPABASE_SERVICE_ROLE_KEY = bindings.SUPABASE_SERVICE_ROLE_KEY;
  if (bindings.WORKSPACE_ID) superset.SITESURVEYOR_WORKSPACE_ID = bindings.WORKSPACE_ID;
  if (bindings.DASHSCOPE_API_KEY) superset.DASHSCOPE_API_KEY = bindings.DASHSCOPE_API_KEY;
  return superset;
}

export const SITESURVEYOR_AGENT_ID = "sitesurveyor";

/**
 * Run one agent turn through the Gateway. Never throws on a model/run failure -
 * that comes back in `result.status`.
 */
export function execOpenClawAgent(opts: ExecAgentOpts): Promise<AgentRunResult> {
  return new Promise((resolve) => {
    const cmd = win32
      ? buildWin32Command(opts)
      : ["openclaw", ...buildArgs(opts)].join(" ");

    let stdout = "";
    let stderr = "";
    // On win32 `openclaw` is a `.cmd` shim that requires a shell; spawn passes
    // a pre-quoted command string so arguments with spaces survive parsing.
    const child = spawn(cmd, {
      env: opts.env,
      shell: win32,
    });

    const killer = setTimeout(() => {
      child.kill();
    }, opts.timeoutMs ?? 600_000);

    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve(parseGatewayEnvelope(stdout, stderr, code));
    });
  });
}

const win32 = process.platform === "win32";

function buildArgs(opts: ExecAgentOpts): string[] {
  const args = ["agent", "--agent", SITESURVEYOR_AGENT_ID, "--message", opts.message, "--json"];
  if (opts.model) args.push("--model", opts.model);
  if (opts.timeoutMs) args.push("--timeout", String(Math.ceil(opts.timeoutMs / 1000)));
  return args;
}

/** Quote an argument for cmd.exe: wrap in double quotes, doubling inner quotes. */
function q(s: string): string {
  return `"${String(s).replaceAll('"', '""')}"`;
}

/** Build a single shell command line for cmd.exe on win32. */
function buildWin32Command(opts: ExecAgentOpts): string {
  const args = buildArgs(opts);
  return `openclaw ${args.map((a) => /[\s"]/.test(a) ? q(a) : a).join(" ")}`;
}

interface GatewayEnvelope {
  ok?: boolean;
  status?: string;
  summary?: string;
  error?: { type?: string; message?: string; runId?: string };
  result?: {
    payloads?: { text?: string | null }[];
    meta?: {
      durationMs?: number;
      agentMeta?: {
        sessionId?: string;
        provider?: string;
        model?: string;
        usage?: { input?: number; output?: number; total?: number };
        toolSummary?: { calls?: number; tools?: string[] };
      };
    };
  };
}

/**
 * Parse the Gateway `openclaw agent --json` envelope. The reply text lives at
 * result.payloads[0].text; run errors surface at error.message (cli_error).
 */
export function parseGatewayEnvelope(
  stdout: string,
  stderr: string,
  code: number | null,
): AgentRunResult {
  let envelope: GatewayEnvelope = {};
  try {
    const trimmed = stdout.trim();
    if (trimmed) envelope = JSON.parse(trimmed) as GatewayEnvelope;
  } catch {
    envelope = {};
  }

  const status = envelope.status === "ok" && envelope.summary === "completed"
    ? "ok"
    : "error";
  const final =
    envelope.result?.payloads?.find((p) => typeof p?.text === "string" && p.text.length > 0)
      ?.text ?? "";
  const ok = status === "ok" && code === 0;

  if (!final && !ok) {
    return {
      ok: false,
      status,
      final: "",
      error: {
        message:
          envelope.error?.message ||
          stderr.trim() ||
          `openclaw agent exited ${code ?? "unknown"}`,
        kind: envelope.error?.type,
      },
    };
  }
  const agentMeta = envelope.result?.meta?.agentMeta;
  return {
    ok,
    status,
    final,
    error: ok
      ? undefined
      : {
          message:
            (envelope.error?.message ?? stderr.trim()) || undefined,
          kind: envelope.error?.type,
        },
    usage: agentMeta?.usage,
    toolSummary: agentMeta?.toolSummary,
    sessionId: agentMeta?.sessionId,
  };
}

/** Async generator turning an exec result into the NDJSON event contract. */
export async function* openClawEvents(result: AgentRunResult): AsyncGenerator<Record<string, unknown>> {
  if (result.status === "timeout") {
    yield { type: "error", message: "The agent timed out. Try a more focused request." };
    return;
  }
  if (result.error) {
    yield { type: "error", message: result.error.message ?? "Agent failed." };
    return;
  }
  yield { type: "final", text: result.final };
  if (result.toolSummary?.calls) {
    yield { type: "status", message: `Agent used ${result.toolSummary.calls} tool call(s).` };
  }
}