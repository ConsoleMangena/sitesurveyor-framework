# SiteSurveyor AI gateway

An optional Node host for the built web app and an authenticated `/api/chat` endpoint. The **primary**
AI runtime is the `ai-chat` Supabase Edge Function; this gateway is a self-hosted serving and fallback
path that imports the same agent core and NDJSON event contract. It is not offline inference — both
runtimes need network access to Supabase and NVIDIA NIM.

| Path | Responsibility |
| --- | --- |
| `ai-gateway-server.ts` | Serves `apps/web/dist`, authenticates chat, resolves workspace, persists turns, streams events |
| `openclaw-runner.ts`, `openclaw.config.json` | Optional buffered OpenClaw agent path and its example config |
| `sitesurveyor-mcp/` | MCP server exposing data, workflow, CAD and memory tools over stdio |
| `../supabase/functions/_shared/` | Shared model policy, agent core, skills, memory, workflows |

## Request lifecycle

Validate the bearer token → load the conversation and reject another user's chat → resolve the
default or first active workspace → persist the user turn and load bounded history → resolve an
allowlisted model by task complexity → run the shared tool-calling agent (or OpenClaw) → stream
`status`/`tool`/`delta`/`final`/`error` events → persist the assistant turn.

The agent uses server-side service-role access, so endpoint authorisation, workspace scoping, table
allowlists and tool implementation **are** the security controls. Read [SECURITY.md](../SECURITY.md)
before deploying or changing a tool.

## Build and run

Needs Node 22, a built frontend in `apps/web/dist`, a built MCP server in `sitesurveyor-mcp/dist` (the
host checks at startup even when using the inline agent), and a Supabase project with the AI tables.

```bash
npm --prefix apps/web install && npm --prefix apps/web run build
npm --prefix ai-gateway install
npm --prefix ai-gateway/sitesurveyor-mcp install && npm --prefix ai-gateway/sitesurveyor-mcp run build
npm --prefix ai-gateway start        # http://localhost:8787
```

## Configuration

`ai-gateway/.env` (git-ignored):

```dotenv
NVIDIA_API_KEY=nvapi-your-server-side-key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-side-service-role-key
# PORT=8787
# HOST=127.0.0.1
# ALLOWED_ORIGINS=https://app.example.com   # for cross-origin /api/market-chat
# USE_OPENCLAW=1                             # buffered OpenClaw path
```

`NVIDIA_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required for chat; `PORT`
(default 8787), `HOST`, `ALLOWED_ORIGINS` and `USE_OPENCLAW` are optional. The code defaults `HOST` to
`0.0.0.0`, so set a restricted address for local-only work. Never copy these into `apps/web/.env`, a
`VITE_*` variable, the bundle, logs or screenshots.

Missing build artifacts exit at startup; static serving still works without AI values, but
`/api/chat` returns a configuration error.

## Chat API

```http
POST /api/chat
Authorization: Bearer <user-supabase-access-token>
Content-Type: application/json

{"conversation_id":"<uuid>","message":"Summarise upcoming jobs.","project_id":"<optional uuid>","model":"<optional allowlisted id>"}
```

`conversation_id` and a non-empty `message` are required; `project_id` adds CAD-workspace context. An
unknown model ID cannot bypass the shared model policy — resolution falls back to an allowed model,
and provider entitlement is still checked at call time.

The response is `application/x-ndjson; charset=utf-8`:

```text
{"type":"status","phase":"..."}   {"type":"tool","name":"query_site_data"}
{"type":"delta","text":"Partial..."}   {"type":"final","text":"Completed."}
```

Errors arrive as an `error` event or an HTTP error before streaming. Clients must not report a write,
payment or other action as successful unless a verified tool result confirms it.

## Primary path: the Edge Function

```bash
npx supabase secrets set NVIDIA_API_KEY=nvapi-your-server-side-key
npx supabase functions deploy ai-chat
```

Run these against the intended linked project. Supabase supplies the function's own URL and
service-role environment; those never move into the browser. Model allowlist and complexity routing
live in `../supabase/functions/_shared/models.ts`, imported by both runtimes so they cannot drift.

## OpenClaw path

`USE_OPENCLAW=1` delegates to an externally installed OpenClaw runtime and returns a buffered result
instead of streamed deltas. `openclaw.config.json` shows the intended integration: NVIDIA NIM as an
OpenAI-compatible provider, `sitesurveyor-mcp/dist/index.js` as an MCP stdio server, and a named
`sitesurveyor` agent using the shared model policy. OpenClaw is not installed by this package.

## MCP server

Exposes schema inspection, allowlisted query/insert/update/confirmed delete, quote and overdue-invoice
workflows, scheduling, CAD drawing/layer/entity tools, and conversation-scoped memory.

```bash
npm --prefix ai-gateway/sitesurveyor-mcp run build   # or test, start
```

It requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. `SITESURVEYOR_WORKSPACE_ID` is **required**
for any business-data tool: the service-role key bypasses RLS, so every read, write and workflow is
pinned to that workspace and a call without it is refused (only published market views stay readable).
`SITESURVEYOR_STATE_DIR` is optional, and its memory files can hold sensitive project preferences —
protect the directory and include it in retention and deletion planning.

## Checks and deployment hygiene

`npm run ai:eval` · `ai:skills-check` · `ai:memory-check` · `ai:models-check` · `ai:rounds-check`, each
with non-production fixtures. Before exposing the gateway: bind to a restricted interface, put TLS,
rate limits, request-size limits and monitoring in front of it, keep service-role and NVIDIA secrets in
the server process or an approved secret manager, prove one user cannot load another's conversation or
workspace records, review every new tool for cross-workspace IDs, prompt injection, excessive data
return and confirmation requirements, and avoid logging bearer tokens, secrets or tool payloads.

Design context: [DESIGN.md](../DESIGN.md). Trust boundaries: [SECURITY.md](../SECURITY.md).
