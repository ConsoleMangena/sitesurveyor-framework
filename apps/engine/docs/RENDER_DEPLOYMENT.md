# SiteSurveyor AI — Survey Worker Deployment

The engine is the compute behind the platform's **Satellite Survey** feature. It is a
`type: worker` service: no URL, no port, no health endpoint, nothing a browser can reach.
A survey reaches it as a row in `survey_runs`.

```
member opens Satellite Survey
  -> POST /functions/v1/satellite-survey   (authenticated; membership checked)
       -> charge_satellite_survey(categories, halfDeg, lat/lon)   [priced from survey_credit_rates;
          billing_operation_rates['satellite.survey'] = 10 credits is the floor, not the price]
       -> insert survey_runs row (status = 'queued')
  -> this worker claims the row (FOR UPDATE SKIP LOCKED)
       -> runs the same raster pipeline it always ran
       -> uploads maps / KMZ / dossier to the private survey-deliverables bucket
       -> publish_survey_run(result, targets, deliverables)
  -> the app polls its own rows and mints a 30-minute signed URL per download
```

If the run fails, `fail_survey_run` marks it failed **and refunds the credits** in the same
call, so a workspace never pays for a survey the worker could not finish.

---

## 1. Prerequisites

The worker is useless before these exist, and it says so in its logs rather than guessing:

1. **Schema** — `npm run db:push` applies `supabase/migrations/20261106150000_satellite_surveys.sql`,
   which creates `survey_runs`, `survey_targets`, `survey_deliverables`, the survey RPCs,
   the private `survey-deliverables` bucket with its read policies, and the
   `satellite.survey` rate row. Apply `20261107120000_survey_credit_pricing.sql` too: it adds
   `survey_credit_rates` and the `price_satellite_survey` / `charge_satellite_survey` pair the
   edge function calls, and lowers `billing_operation_rates['satellite.survey']` to the floor.
2. **Edge functions** — `npx supabase functions deploy satellite-survey`, then
   `npx supabase functions deploy deliverable-file`. The first is the only entry
   point that starts a survey: it authenticates the caller and charges the
   credits. The second is what keeps the workbench's zoomable tile map readable:
   the PMTiles archive is fetched as byte slices through it, so range requests
   never depend on signed-URL range support, and it re-proves workspace ownership
   per request before streaming a slice.
3. **A workspace with credits** — billing is per workspace, so the member queueing the
   survey needs a balance at the platform's survey rate.

## 2. Deploy on Render

Create a **Blueprint** from this repository pointing at the **root `render.yaml`**. It
defines both services in a single file:

1. **`sitesurveyor-web`** — a free static site serving `apps/web/dist` from Render's CDN.
2. **`sitesurveyor-engine`** — a Standard-plan background worker (2 GB RAM / 1 CPU) that
   builds from `apps/engine/` via `rootDir` and runs `python worker.py`.

The standalone `apps/engine/render.yaml` is kept for independent engine deploys during
development but is no longer the primary blueprint.

Render reads the service definitions, environment variables and the disk from the root file.
Secrets marked `sync: false` must be set in the Render Dashboard after the first deploy.

| Variable | Required | Notes |
| :--- | :--- | :--- |
| `SUPABASE_URL` | yes | Project URL, `https://<ref>.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Also accepted as `SUPABASE_SECRET_KEY`. The migration grants it exactly the survey RPCs and the deliverables bucket — it is not a general admin credential, and it never ships to a browser. |
| `DE_AFRICA_TOKEN` | yes | Digital Earth Africa key. `src/config.py` also accepts `DEAFRICA_SANDBOX_API_KEY`. |
| `SITESURVEYOR_STATE_DIR` | set by blueprint | `/app/state`, the mounted disk. Holds the coverage cache. |
| `SURVEY_POLL_SECONDS` | no | Idle wait between claim attempts, default `10`. |
| `SURVEY_DELIVERABLES_BUCKET` | no | Default `survey-deliverables`, which is the bucket the migration creates. |

**Run exactly one instance.** The engines read the active AOI from the module globals in
`src/config.py` and every survey writes the same filenames under `outputs/`, so a second
worker would analyse one AOI while publishing another's files. `claim_next_survey_run`
already hands a row to exactly one caller; the ceiling is the process, not the claim.
Throughput rises only when an immutable per-job context with a namespaced output directory
replaces those globals — scale the code, not the replica count.

The worker enforces this: on startup it takes an exclusive lock on
`$SITESURVEYOR_STATE_DIR/worker.lock` and exits with status 1 if another process
holds it. A second replica fails loudly instead of publishing another survey's
files.

### The disk

The 1 GB disk at `/app/state` is the coverage cache: what makes re-surveying an area take
minutes instead of re-downloading six layers. Deliverables no longer need it — they are
uploaded to Storage, so a redeploy cannot break a download link someone opened yesterday.

A service created through the dashboard or CLI does **not** read `render.yaml`. Set the
variables there yourself, or the worker starts with no database and claims nothing.

## 3. Local run

```bash
cd apps/engine
python -m venv .venv && .venv/Scripts/activate    # .venv/bin/activate on Linux/macOS
pip install -r requirements.txt
cp .env.example .env                              # fill in the three secrets
python worker.py
```

`python main.py --category water` still runs one survey straight to `outputs/` with no
database involved — useful when changing an engine, and the fastest way to tell a raster bug
apart from a platform bug.

## 4. Knowing it is alive

The claim loop logs every attempt it makes and every row it takes, so the log is the health
check. In order:

```
worker <host>-<pid> polling for survey jobs
claimed run <uuid> at (-19.50487, 29.84598)
published run <uuid> with 12 target(s)
```

- **Nothing after `polling`, with a `queued` row in `survey_runs`** — the worker cannot reach
  the database. `claim failed, retrying: <reason>` repeats once per `SURVEY_POLL_SECONDS * 6`.
- **`run <uuid> failed`** — the row is marked failed and its credits refunded; `error_message`
  carries the exception type and text, and the traceback stays in the log.
- **A row stuck in `surveying`** — the container died mid-survey. `claim_next_survey_run`
  re-offers any row still claimed an hour after `claimed_at`, so the next worker picks it up
  without intervention.

Verify end to end by queueing a survey from the app's Satellite Survey page: the row appears
under the workspace, the progress bar moves from written percentages, and the files open
through signed URLs. When the dashboard card says *running*, a worker really has claimed the
row — nothing in the product infers progress from a timer.

## 5. What was removed

The FastAPI surface (`src/api.py`), its CORS allow-list (`ALLOWED_ORIGINS`), the bundled
sandbox page and the `/outputs/*` static route are gone. An unauthenticated public endpoint
that would run a multi-minute survey for whoever found it, then serve the last client's
report — name, coordinates, street address — to the next visitor, is not something the
platform needs: the edge function authenticates, the ledger meters, and Storage keeps the
files private.

`src/mcp/server.py` stays. It is the in-process library the worker calls (`survey_site`,
`set_progress_callback`), and `python -m src.mcp_server` remains a stdio MCP server for
driving the pipeline from an agent while developing — see [`docs/MCP_GUIDE.md`](MCP_GUIDE.md).
