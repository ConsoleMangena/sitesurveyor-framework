# SiteSurveyor OpenClaw host server

Runs the whole SiteSurveyor stack from ONE PC. Other devices — laptops, tablets,
phones — just open a browser; **nothing is installed on them**.

```
┌────────────────────────── host PC ──────────────────────────┐
│  ai-gateway-server.ts (:8787, LAN)                           │
│    └─ /api/chat → inline NVIDIA NIM agent core (streaming)     │
│    └─ opt-in: OpenClaw gateway (:18789, loopback)            │
│        └─ agent entries: main, sitesurveyor                  │
│        └─ mcp.servers.sitesurveyor → sitesurveyor-mcp (15 t) │
│  frontend/dist (the SiteSurveyor app + PWA)                  │
└──────────────┬───────────────────────────┬───────────────────┘
               │                           │
        office laptop                  phone / tablet
   http://<host-ip>:8787         http://<host-ip>:8787
```

## Agent engine

Chat turns default to the **inline streaming NVIDIA NIM core** — the same
`runAgent` loop the cloud `ai-chat` Edge Function uses — so replies stream to
the UI token-by-token over the same models (build.nvidia.com NIM ids) and
speak the identical NDJSON events. This keeps the offline host path feeling as
fast as the cloud path.

An **opt-in OpenClaw Gateway** path (`USE_OPENCLAW=1`) delegates turns to
`openclaw agent --agent sitesurveyor --json`. The gateway is a locally-running
always-on service that holds its own sessions and memory per agent; note it is
**buffered** — the full reply is sent in one `final` event once the run
completes.

The `sitesurveyor` agent (used only when `USE_OPENCLAW=1`) is registered in the
**ambient OpenClaw config** (`~/.openclaw/openclaw.json`), which wires three
things together:

- `agents.entries.sitesurveyor` — routing + model policy (model
  `nvidia/llama-3.1-nemotron-70b-instruct`, `modelPolicy.allow: ["nvidia/*", "mistralai/*", "z-ai/*"]`). Multi-agent
  configs require `agents.ownership: "explicit"`.
- `mcp.servers.sitesurveyor` — stdio MCP server launched from
  `ai-gateway/sitesurveyor-mcp/dist/index.js` with the Supabase
  credentials in its `env` block.
- The gateway itself (`gateway.port`, `mode: local`, `bind: loopback`,
  auth token, Control UI origins).

To (re)register after changing `~/.openclaw/openclaw.json`, restart the
gateway: `openclaw gateway restart`, then check it is Ready with
`openclaw gateway status`. Validate the config with `openclaw config validate`
and probe the MCP connection with `openclaw mcp doctor sitesurveyor --probe`.

## SiteSurveyor MCP surface (15 tools)

| Group | Tools |
| --- | --- |
| Data | `inspect_columns`, `query_site_data`, `count_site_data`, `insert_site_record`, `update_site_record`, `delete_site_record` |
| Workflows | `close_overdue_invoices`, `create_quote_from_line_items`, `schedule_job` |
| CAD | `get_cad_drawing`, `list_cad_layers`, `count_cad_entities`, `inspect_cad_entity` |
| Memory | `remember`, `forget` |

Built in `ai-gateway/sitesurveyor-mcp/` from the ported agent logic
(`src/workflows.ts`, `src/memory.ts`, `src/cad.ts`, `src/supabase.ts`,
`src/schema.ts`). Rebuild after source changes:

```bash
cd ai-gateway/sitesurveyor-mcp
npm install
npm run build     # compile to dist/ (also runs when dist/ is missing)
npm test          # Vitest: workflows, memory, tools
```

## One-time setup (host PC)

```bash
cd frontend && npm install && npm run build
cd ai-gateway/sitesurveyor-mcp && npm install && npm run build
```

`ai-gateway/openclaw.config.json` is a developer convenience config that
mirrors the runner's expectations (MCP server, models provider, agent entry)
for ad-hoc `openclaw agent exec --config` runs. The served production path uses
the ambient gateway config above.

## Run

```bash
# .env (ai-gateway/):
#   NVIDIA_API_KEY=nvapi-...
#   SUPABASE_URL=https://<project>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=<service role key>
npm start          # in ai-gateway/ (server reads .env; starts on :8787)
```

Auto-start at logon: `sitesurveyor-host.cmd` is placed in the Startup folder
(`Win+R` → `shell:startup`).

## Connect from other devices

Same Wi-Fi/LAN — open:  `http://<host-ip>:8787`
Find the IP with `ipconfig` (e.g. `192.168.1.198`). Sign in as usual; the
SiteSurveyor OpenClaw chat page works immediately.

On phones: browser menu → *Add to Home screen* — the app is a PWA and
installs like an app.

### Windows Firewall

First start may trigger Windows' "Allow Node.js" prompt — click **Allow**
(private networks). To open the port explicitly, run once as Administrator:

```powershell
netsh advfirewall firewall add rule name="SiteSurveyor Host 8787" dir=in action=allow protocol=TCP localport=8787
```

### Access from anywhere (mobile data / remote sites)

Install [Tailscale](https://tailscale.com) on the host PC and on the device,
then use `http://<tailscale-ip-of-host>:8787` from anywhere. Traffic is
WireGuard-encrypted end-to-end; no router port-forwarding, no exposure of the
gateway to the public internet.

## Security model

- The OpenClaw gateway binds to **loopback only** — it is never reachable
  from the network directly.
- The host server only forwards `/openclaw` WebSocket calls and strips the
  Origin header so the gateway treats them as trusted loopback clients.
- The MCP server runs with the service-role key for the platform database,
  scoped by `SITESURVEYOR_WORKSPACE_ID`; destructive tools
  (`delete_site_record`, `update_site_record`, `insert_site_record`,
  `close_overdue_invoices`) are declared as potentially destructive and
  require interactive approval.
- Platform data stays protected by Supabase Auth + RLS; OpenClaw chat requires a
  signed-in account, and every conversation is stored per user.