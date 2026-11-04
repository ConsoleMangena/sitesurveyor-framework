# SiteSurveyor AI gateway

Part of **SiteSurveyor, an Eineva Labs product and open-source initiative**, this directory provides an optional Node.js host for the built SiteSurveyor web app and an authenticated `/api/chat` endpoint.

The **primary AI runtime** is the `ai-chat` Supabase Edge Function. This gateway is a **self-hosted fallback/serving path** using the same agent core and NDJSON event contract. It is not an offline inference engine: both runtimes require network access to Supabase and NVIDIA NIM.

## Components

| Path | Responsibility |
| --- | --- |
| `ai-gateway-server.ts` | Serves `apps/web/dist`, authenticates chat requests, resolves workspace context, persists turns, and streams agent events |
| `openclaw-runner.ts` | Optional OpenClaw agent execution and environment mapping |
| `openclaw.config.json` | Example OpenClaw model/MCP/agent configuration |
| `sitesurveyor-mcp/` | Model Context Protocol server exposing SiteSurveyor data, workflow, CAD, and memory tools over stdio |
| `../supabase/functions/_shared/` | Shared model policy, agent core, skills, memory, and workflows |
| `../supabase/functions/ai-chat/` | Primary hosted Edge Function runtime |

## Runtime behaviour

For each chat request, the gateway:

1. Validates the user's Supabase bearer token.
2. Loads the conversation and rejects access to another user's chat.
3. Resolves the user's default or first active workspace.
4. Persists the user turn and loads bounded history.
5. Resolves an allowlisted model using task complexity.
6. Runs the shared tool-calling agent, or optional OpenClaw path.
7. Streams NDJSON status/tool/delta/final/error events.
8. Persists the final assistant turn.

The agent uses server-side Supabase service-role access. Endpoint authorization, workspace scoping, table allowlists, and tool implementation are therefore critical security controls. Review [SECURITY.md](../SECURITY.md) before deployment or tool changes.

## Prerequisites

- Node.js 22 and npm.
- A built frontend in `apps/web/dist`.
- A built MCP server in `sitesurveyor-mcp/dist` (the host checks for it at startup even when using the inline agent).
- A Supabase project with the SiteSurveyor AI tables and operational schema.
- An NVIDIA NIM API key entitled to the models in the shared allowlist.

## Build

From the repository root:

```bash
npm --prefix apps/web install
npm --prefix apps/web run build
npm --prefix ai-gateway install
npm --prefix ai-gateway/sitesurveyor-mcp install
npm --prefix ai-gateway/sitesurveyor-mcp run build
```

## Configuration

Create `ai-gateway/.env`. It is excluded by the repository's `.gitignore`.

```dotenv
NVIDIA_API_KEY=nvapi-your-server-side-key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-side-service-role-key

# Optional server settings
PORT=8787
HOST=127.0.0.1

# Optional buffered OpenClaw path; disabled by default
# USE_OPENCLAW=1
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `NVIDIA_API_KEY` | For chat | Authenticates to NVIDIA NIM |
| `SUPABASE_URL` | For chat | Supabase Auth/REST base URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For chat | Privileged server-side persistence and tool access |
| `PORT` | No | HTTP port; defaults to `8787` |
| `HOST` | No | Bind address; defaults to `0.0.0.0` in code, so use a restricted address for local-only work |
| `USE_OPENCLAW` | No | Set to `1` to use the optional buffered OpenClaw runtime |

Never copy these values into `apps/web/.env`, a `VITE_*` variable, the frontend bundle, logs, screenshots, or documentation containing real credentials.

## Run

```bash
npm --prefix ai-gateway start
```

With the default port, open **http://localhost:8787**. The host serves the production SPA and exposes **`POST /api/chat`**.

The server exits at startup if the frontend or MCP build artifacts are missing. If required AI environment values are absent, static serving can still run but `/api/chat` returns a configuration error.

## Chat API

### Request

```http
POST /api/chat
Authorization: Bearer <user-supabase-access-token>
Content-Type: application/json
```

```json
{
  "conversation_id": "existing-conversation-uuid",
  "message": "Summarise upcoming jobs in this workspace.",
  "project_id": "optional-project-uuid",
  "model": "optional-allowlisted-model-id"
}
```

`conversation_id` and a non-empty `message` are required. `project_id` supplies optional CAD-workspace context. Unknown or unentitled model IDs must not be treated as a way around the shared model policy; model resolution falls back to an allowed model, while provider entitlement is still required at call time.

### Streaming response

Content type: `application/x-ndjson; charset=utf-8`.

```text
{"type":"status","phase":"..."}
{"type":"tool","name":"query_site_data"}
{"type":"delta","text":"Partial response..."}
{"type":"final","text":"Completed response."}
```

Errors use the `error` event or an HTTP error before streaming begins. Clients must not report a record write, payment, or other action as successful unless the relevant verified tool result confirms it.

## Primary Supabase Edge Function

For normal hosted deployment, configure the NVIDIA secret through Supabase's server-side secret store and deploy the function:

```bash
npx supabase secrets set NVIDIA_API_KEY=nvapi-your-server-side-key
npx supabase functions deploy ai-chat
```

Run these against the intended linked Supabase project. Supabase provides the function's own Supabase URL and service-role environment in its managed runtime; do not move those credentials into the browser.

The model allowlist and complexity routing live in `../supabase/functions/_shared/models.ts`. The Edge Function and Node gateway import the same policy to prevent model drift.

## Optional OpenClaw path

The default gateway path uses the inline shared agent and streams token deltas. Setting `USE_OPENCLAW=1` instead delegates to an externally installed/configured OpenClaw runtime and returns a buffered result.

`openclaw.config.json` shows the intended integration:

- NVIDIA NIM as an OpenAI-compatible provider.
- `sitesurveyor-mcp/dist/index.js` as an MCP stdio server.
- A named `sitesurveyor` agent with the shared model policy.

OpenClaw is not installed by this package. Configure it separately, ensure its ambient agent/MCP configuration matches this repository, and keep service credentials in server-side environment mappings only.

## MCP server

The MCP package exposes equivalents of the cloud agent tools:

- Schema inspection, table query, and record counts.
- Allowlisted record insert, update, and confirmed delete.
- Quote, overdue-invoice, and scheduling workflows.
- CAD drawing, layer, entity-count, and entity-inspection tools.
- Conversation-scoped remember/forget memory.

Useful commands from the repository root:

```bash
npm --prefix ai-gateway/sitesurveyor-mcp run build
npm --prefix ai-gateway/sitesurveyor-mcp test
npm --prefix ai-gateway/sitesurveyor-mcp start
```

The standalone server expects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. `SITESURVEYOR_WORKSPACE_ID` is required for any business-data tool: the service-role key bypasses row-level security, so every read, write, and workflow is pinned to that workspace and a call without it is refused (only the published market views stay readable). `SITESURVEYOR_STATE_DIR` is optional. Its MCP memory files can contain sensitive project preferences; protect the state directory and include it in retention/deletion planning.

## AI consistency checks

From the repository root:

```bash
npm run ai:eval
npm run ai:skills-check
npm run ai:memory-check
npm run ai:models-check
npm run ai:rounds-check
```

Use non-production fixtures and credentials appropriate to each harness. Review a script before running it against a shared environment, especially where evaluation includes tool writes.

## Security checklist

- Bind to a restricted interface unless external access is intentionally required.
- Put TLS, authentication-preserving proxying, request-size limits, rate limits, and monitoring in front of a public deployment.
- Restrict service-role and NVIDIA secrets to the server process and approved secret manager.
- Test that one user cannot load another user's conversation or workspace records.
- Review every new tool for cross-workspace IDs, prompt injection, excessive data return, destructive actions, and confirmation requirements.
- Do not log bearer tokens, secrets, sensitive prompts, or unrestricted tool payloads.
- Protect MCP state files and apply the same retention policy as other AI conversation data.
- Use development networks and non-production project data for integration testing.

See the [system architecture](../DESIGN.md#6-ai-agent-architecture) and [AI trust boundaries](../SECURITY.md#5-ai-trust-boundaries) for the complete design context.
