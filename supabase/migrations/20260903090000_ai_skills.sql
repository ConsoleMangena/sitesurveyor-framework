-- Retrievable skill/knowledge store for the AI agent.
-- Each row is a reusable "skill": guidance + verified few-shot examples that
-- the router inlines into the agent's context for relevant tasks. Examples are
-- auto-promoted from successful runs (bounded + deduped in code).

create table public.ai_skills (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text not null,
  description text not null,
  body text not null,
  examples jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_skills_active
  on public.ai_skills (active, updated_at desc);

-- Seed with the initial skills derived from real workflows. Bodies are short,
-- deterministic guidance + a compact system-shaped example so the model gets
-- ground-truth few-shots on first boot; auto-promotion extends these over time.
insert into public.ai_skills (key, title, description, body, examples) values
(
  'close-overdue-invoices',
  'Settling overdue invoices',
  'close overdue invoices settle mark paid invoice settle',
  'Use the close_overdue_invoices workflow tool to settle every overdue invoice in one step instead of querying then patching each one. It marks them paid and returns a summary. Only offer target_status cancelled with explicit user approval.',
  '[{"prompt":"Close all the overdue invoices.","tools":[{"name":"close_overdue_invoices","args":{"target_status":"paid"}}],"result":"Closed 2 overdue invoices: INV-1001, INV-1002 — marked as paid."}]'
),
(
  'create-quote',
  'Building quotes from line items',
  'create quote line items estimate proposal quote build quote',
  'Use the create_quote_from_line_items workflow to build a quote and its line items in one step. Pass lines as { description, qty, rate, unit }. It computes subtotal/tax/total. Default currency USD unless the user states otherwise.',
  '[{"prompt":"Create a quote with line items: Boundary survey 1 @ $1200 and SETOUT pegs 20 @ $15 each.","tools":[{"name":"create_quote_from_line_items","args":{"lines":[{"description":"Boundary survey","qty":1,"rate":1200},{"description":"SETOUT pegs","qty":20,"rate":15}]}}],"result":"Quote Q-... created (draft): subtotal $1500."}]'
),
(
  'schedule-job',
  'Scheduling a job',
  'schedule job assign crew date assignment schedule job',
  'Use the schedule_job workflow to schedule a job: pass the job_id and an optional assignment_date (YYYY-MM-DD, default today). It creates a job_assignment and sets the job status to scheduled. It refuses completed or cancelled jobs.',
  '[{"prompt":"Schedule job cccccccc-0000-0000-0000-000000000001 for tomorrow.","tools":[{"name":"schedule_job","args":{"job_id":"cccccccc-0000-0000-0000-000000000001"}}],"result":"Job scheduled."}]'
),
(
  'contact-records',
  'Managing contact records',
  'contact create add contact update contact change email phone company person client',
  'Create or update contacts with the insert_site_record / update_site_record write tools. Creates and updates execute immediately with sensible defaults - do not ask permission. Stamp the workspace_id. Only deletes need an explicit confirm.',
  '[{"prompt":"Create a contact: Jane Doe, jane@example.com, company Acme Corp.","tools":[{"name":"insert_site_record","args":{"table":"contacts","record":{"name":"Jane Doe","email":"jane@example.com","company":"Acme Corp"}}}],"result":"Contact created."}]'
),
(
  'default-cad-layers',
  'Default CAD active layer conventions',
  'cad layer active layer setout fence drawing draw default layer convention which layer',
  'Default to the drawing''s active layer for new geometry; use SETOUT for setout geometry (pegs, control). State the assumption in one short line and proceed. Only ask when there is no sensible default.',
  '[{"prompt":"Draw a 30m boundary fence around Project Block A.","tools":[{"name":"list_cad_layers","args":{"project_id":"bbbbbbbb-0000-0000-0000-000000000001"}}],"result":"Assumed active layer SETOUT; drawing fence block."}]'
),
(
  'destructive-action-policy',
  'Deletes and destructive actions need explicit confirmation',
  'delete remove erase destructive confirm confirm asking permission approval delete record',
  'Deletes (delete_site_record, CAD ERASE) are permanent and MUST NOT auto-execute. Propose the action naming the record, offer an [ASK]/confirm, and only execute after an explicit yes. Prefer status/archive updates over hard deletes.',
  '[{"prompt":"Please delete contact 22222222-2222-2222-2222-222222222222.","tools":[],"result":"Proposed delete with a confirm prompt; awaiting approval before confirmed=true."}]'
);
