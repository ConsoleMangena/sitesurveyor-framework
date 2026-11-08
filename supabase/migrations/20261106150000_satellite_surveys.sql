-- Satellite survey runs, as platform rows.
--
-- The engine used to be a separate web service the browser called directly. That made
-- a survey belong to a tab: the result lived in React state, the KMZ and map files
-- lived on the engine's ephemeral disk, and a reload lost the first and a redeploy the
-- second. Nothing else in the product could see any of it, so a completed survey could
-- not be quoted, listed on a project, or reviewed by a teammate.
--
-- This makes the run a workspace object instead. The app writes one row through the
-- `satellite-survey` edge function, which charges credits in the same breath, and a
-- worker claims the row, runs the raster maths, and writes progress, results, targets
-- and file paths back. Every read the UI does is a read of these tables, so the survey
-- survives the tab, the deployment, and the engine itself.
--
-- The job is claimed with `for update skip locked`, so N workers can poll one table
-- without two of them analysing the same AOI and publishing over each other.

create table if not exists public.survey_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  -- No foreign key: `projects` is not defined by this repository's migrations, so an
  -- FK here would break `supabase db reset` on a database built from migrations alone.
  project_id uuid,
  status text not null default 'queued'
    check (status in (
      'queued', 'acquiring', 'surveying', 'publishing',
      'succeeded', 'failed', 'cancelled'
    )),
  -- The engine's own stage wording, published verbatim so a reader sees what the
  -- process is actually doing rather than a generic "working".
  stage text,
  progress integer not null default 0 check (progress between 0 and 100),

  -- What was asked for, kept separate from what produced the score: a cache hit or a
  -- refetch failure makes the two differ, and `result->'data_sources'` records the
  -- coverages that genuinely fed the numbers.
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  half_deg numeric(5,3) not null default 0.12 check (half_deg > 0 and half_deg <= 0.5),
  categories text[] not null default array['water','minerals','soil','hazard']
    check (categories <@ array['water','minerals','soil','hazard']),
  client_name text not null default 'Site Survey',
  address text,
  data_sources jsonb not null default '{}'::jsonb,
  composite jsonb not null default '{}'::jsonb,
  estimated_minutes integer check (estimated_minutes > 0),

  -- The survey's own output: scores, executive summary, recommendations, the claim
  -- ceiling, and the coverages used. Deliberately not columns -- the engine's result
  -- shape is a versioned contract on its side, and flattening it here would mean a
  -- migration every time a score is renamed.
  result jsonb,
  error_message text,

  worker_id text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'succeeded' or result is not null),
  check (progress < 100 or status = 'succeeded')
);

create index if not exists survey_runs_workspace_created_idx
  on public.survey_runs (workspace_id, created_at desc);

-- The claim query's whole working set: a worker asks for old enough queued rows and
-- nothing else, so this index is the difference between a poll and a table scan.
create index if not exists survey_runs_claim_idx
  on public.survey_runs (created_at)
  where status in ('queued', 'acquiring', 'surveying', 'publishing');

comment on column public.survey_runs.progress is
  'Engine-reported percent complete. Advisory only: it advances between categories, not within one.';

-- Ranked field targets, one row each. This is the table that makes a survey native:
-- a candidate coordinate the engine returned can be joined to a job, priced into a
-- quote, or exported, none of which a JSON blob in `result` allows.
create table if not exists public.survey_targets (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.survey_runs (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Category keys follow the engine's dossier (`soil_land`, `hazard_safety`), not the
  -- request shorthand (`soil`, `hazard`), because this is scored output, not input.
  category text not null check (category in ('water','minerals','soil_land','hazard_safety')),
  rank integer not null check (rank > 0),
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  score numeric(6,3),
  distance_km numeric(8,3),
  -- One readable line a field crew acts on: how deep to drill, what rig the sampling
  -- needs, what the hazard class was. Lives here because a list of coordinates with no
  -- reason attached to them is not a recommendation.
  readout text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, category, rank)
);

create index if not exists survey_targets_run_category_idx
  on public.survey_targets (run_id, category, rank);

create index if not exists survey_targets_workspace_idx
  on public.survey_targets (workspace_id, category);

comment on column public.survey_targets.score is
  'Percentile rank inside this AOI only. Not comparable across sites and not a yield, grade or buildability claim.';

-- Files the run produced, in our bucket rather than on the engine's disk.
create table if not exists public.survey_deliverables (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.survey_runs (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Key from the engine's DELIVERABLES registry, so a label comes from the app and a
  -- rename on either side cannot silently drop a download button.
  kind text not null,
  storage_path text not null,
  content_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null default now(),
  unique (run_id, kind)
);

create index if not exists survey_deliverables_workspace_idx
  on public.survey_deliverables (workspace_id, created_at desc);

alter table public.survey_runs enable row level security;
alter table public.survey_targets enable row level security;
alter table public.survey_deliverables enable row level security;

-- Members read everything their workspace surveyed. Writes are deliberately absent: a
-- run row must be created in the same transaction as its credit debit, and its results
-- must land atomically with its targets and files, so the only writers are the edge
-- function and the worker, both service role. A member cancelling through a raw UPDATE
-- would be able to strand a charged run with no refund, which is why that path is the
-- `cancel_survey_run` function below instead.
create policy survey_runs_select_member
  on public.survey_runs for select to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = survey_runs.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create policy survey_targets_select_member
  on public.survey_targets for select to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = survey_targets.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create policy survey_deliverables_select_member
  on public.survey_deliverables for select to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = survey_deliverables.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_survey_runs_updated_at on public.survey_runs;
create trigger trg_survey_runs_updated_at
  before update on public.survey_runs
  for each row execute function public.touch_updated_at();

-- ── Worker interface ──
--
-- These are the only four functions the worker may call, and all four are service-role
-- only. That is what keeps a background process that holds a privileged key from having
-- the run of the schema: it can move a survey job along and nothing else.

-- Claim the oldest job that is genuinely free.
--
-- The timed branch is the retry path: a worker that is killed mid-survey cannot release
-- its claim, and without it the job would sit 'surveying' forever while the workspace
-- watched a bar stop moving. An hour is longer than the four-category worst case, so a
-- reclaimed row means the worker died rather than that the survey is merely slow.
create or replace function public.claim_next_survey_run(p_worker_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.survey_runs%rowtype;
  v_claimed jsonb;
begin
  if p_worker_id is null or length(p_worker_id) > 160 then
    raise exception 'A worker id of at most 160 characters is required';
  end if;

  select * into v_run
  from public.survey_runs
  where (
      status = 'queued'
      or (
        status in ('acquiring', 'surveying', 'publishing')
        and claimed_at < now() - interval '1 hour'
      )
    )
  order by created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.survey_runs
  set status = 'acquiring',
      stage = 'Claimed by worker',
      progress = 0,
      worker_id = p_worker_id,
      claimed_at = now(),
      error_message = null
  where id = v_run.id;

  select to_jsonb(r) into v_claimed from public.survey_runs r where r.id = v_run.id;
  return v_claimed;
end;
$$;

-- Progress is observability, so it must not be able to fail a survey. The worker's
-- reporter swallows every error this raises; the terminal-state guard is here so a slow
-- write from a reclaimed worker cannot demote a run that has already succeeded.
create or replace function public.update_survey_run_progress(
  p_run_id uuid,
  p_stage text,
  p_progress integer,
  p_status text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_progress is null or p_progress < 0 or p_progress > 100 then
    raise exception 'Survey progress must be between 0 and 100';
  end if;
  if p_status is not null
    and p_status not in ('acquiring', 'surveying', 'publishing') then
    raise exception 'A progress write may only move a run between working states';
  end if;

  update public.survey_runs
  set stage = coalesce(nullif(btrim(p_stage), ''), stage),
      progress = greatest(progress, p_progress),
      status = coalesce(p_status, status),
      claimed_at = now()
  where id = p_run_id
    and status in ('queued', 'acquiring', 'surveying', 'publishing');
end;
$$;

-- Publish a finished survey: result, targets and files land together.
--
-- One function, not three calls, because a half-written success is the worst outcome
-- available: a run marked succeeded with no targets reads as an engine bug to the
-- workspace, and one with targets and no files offers downloads that are not there. A
-- security-definer body runs as the owner, so it can write to tables the worker itself
-- has no policy on, and the whole thing rolls back as a unit if any insert fails.
create or replace function public.publish_survey_run(
  p_run_id uuid,
  p_result jsonb,
  p_targets jsonb,
  p_deliverables jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.survey_runs%rowtype;
begin
  if p_result is null then
    raise exception 'A completed survey must publish a result';
  end if;

  select * into v_run from public.survey_runs where id = p_run_id;
  if not found then
    raise exception 'Survey run % does not exist', p_run_id;
  end if;

  -- Delete-then-insert rather than upsert so a republish is idempotent: a reclaimed job
  -- writes its own targets again, and stale ranks from the interrupted attempt would
  -- otherwise sit alongside the new ones and show a crew the same borehole twice.
  delete from public.survey_targets where run_id = p_run_id;
  delete from public.survey_deliverables where run_id = p_run_id;

  insert into public.survey_targets (
    run_id, workspace_id, category, rank, latitude, longitude,
    score, distance_km, readout, payload
  )
  select
    p_run_id,
    v_run.workspace_id,
    t->>'category',
    (t->>'rank')::integer,
    (t->>'latitude')::numeric,
    (t->>'longitude')::numeric,
    (t->>'score')::numeric,
    (t->>'distance_km')::numeric,
    nullif(t->>'readout', ''),
    coalesce(t->'payload', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) as t
  where t->>'category' in ('water','minerals','soil_land','hazard_safety')
    and (t->>'rank')::integer > 0
    and t ? 'latitude'
    and t ? 'longitude';

  insert into public.survey_deliverables (
    run_id, workspace_id, kind, storage_path, content_type, size_bytes
  )
  select
    p_run_id,
    v_run.workspace_id,
    d->>'kind',
    d->>'storage_path',
    coalesce(d->>'content_type', 'application/octet-stream'),
    (d->>'size_bytes')::numeric
  from jsonb_array_elements(coalesce(p_deliverables, '[]'::jsonb)) as d
  where coalesce(d->>'kind', '') <> ''
    and coalesce(d->>'storage_path', '') <> '';

  update public.survey_runs
  set status = 'succeeded',
      stage = 'Complete',
      progress = 100,
      result = p_result,
      error_message = null,
      completed_at = now()
  where id = p_run_id;
end;
$$;

-- A failed survey that was paid for is not a completed transaction, so the refund lives
-- here rather than in the worker: the state change and the money move in one statement,
-- and a worker that dies between them cannot leave the workspace out twenty credits.
-- `refund_workspace_ai_credits` is idempotent on the operation id, which is the run id,
-- so a retry of a failed job cannot refund twice.
create or replace function public.fail_survey_run(p_run_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.survey_runs%rowtype;
begin
  select * into v_run from public.survey_runs where id = p_run_id;
  if not found then
    raise exception 'Survey run % does not exist', p_run_id;
  end if;

  update public.survey_runs
  set status = 'failed',
      stage = 'Failed',
      error_message = coalesce(nullif(btrim(p_error), ''), 'The survey stopped without a result.'),
      completed_at = now()
  where id = p_run_id;

  if v_run.status <> 'cancelled' then
    -- Marking a survey failed must not depend on the money ledger agreeing: a run that
    -- was never charged (an operation row added after the job) or a credit account that
    -- cannot be opened on it would otherwise raise here and leave the workspace staring
    -- at a progress bar that never resolves, which is strictly worse than an unrefunded
    -- job. The refund is attempted, and its failure is left in the server log.
    begin
      perform public.refund_workspace_ai_credits(
        v_run.workspace_id,
        v_run.created_by,
        p_run_id::text,
        'Satellite survey failed'
      );
    exception when others then
      raise warning 'Survey % failed but its credits were not refunded: %', p_run_id, sqlerrm;
    end;
  end if;
end;
$$;

revoke all on function public.claim_next_survey_run(text) from public;
revoke all on function public.claim_next_survey_run(text) from anon;
revoke all on function public.claim_next_survey_run(text) from authenticated;
grant execute on function public.claim_next_survey_run(text) to service_role;

revoke all on function public.update_survey_run_progress(uuid, text, integer, text) from public;
revoke all on function public.update_survey_run_progress(uuid, text, integer, text) from anon;
revoke all on function public.update_survey_run_progress(uuid, text, integer, text) from authenticated;
grant execute on function public.update_survey_run_progress(uuid, text, integer, text) to service_role;

revoke all on function public.publish_survey_run(uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.publish_survey_run(uuid, jsonb, jsonb, jsonb) from anon;
revoke all on function public.publish_survey_run(uuid, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.publish_survey_run(uuid, jsonb, jsonb, jsonb) to service_role;

revoke all on function public.fail_survey_run(uuid, text) from public;
revoke all on function public.fail_survey_run(uuid, text) from anon;
revoke all on function public.fail_survey_run(uuid, text) from authenticated;
grant execute on function public.fail_survey_run(uuid, text) to service_role;

-- ── Member interface ──

-- Cancel a job that has not started.
--
-- Definer rather than a policy because a member may not update their own run rows at
-- all (see the note above): an UPDATE allowed directly would let a workspace set
-- status='cancelled' on a survey a worker is halfway through, and the refund rule below
-- is the reason the decision has to be checked in one place.
create or replace function public.cancel_survey_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.survey_runs%rowtype;
begin
  select * into v_run from public.survey_runs where id = p_run_id;
  if not found then
    raise exception 'Survey run % does not exist', p_run_id;
  end if;

  -- Whoever started the survey may call it back, and so may an owner or admin, who pays
  -- for it on the workspace's behalf. Requiring a role here would strand a member's own
  -- queued job in the one state where it is still cheap to stop.
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = v_run.workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and (wm.role in ('owner', 'admin') or v_run.created_by = auth.uid())
  ) then
    raise exception 'Only the person who started a survey, or a workspace owner or admin, can cancel it'
      using errcode = '42501';
  end if;

  if v_run.status <> 'queued' then
    raise exception 'This survey has already started, so it cannot be cancelled';
  end if;

  update public.survey_runs
  set status = 'cancelled',
      stage = 'Cancelled before it started',
      completed_at = now()
  where id = p_run_id;

  -- The survey never ran, so the credits it was charged for come back. Crediting
  -- `created_by` rather than the canceller is not a detail: the refund RPC compares the
  -- user it is handed against the actor on the original usage row and refuses a
  -- mismatch, so an admin cancelling a colleague's queued job would otherwise fail.
  perform public.refund_workspace_ai_credits(
    v_run.workspace_id,
    v_run.created_by,
    p_run_id::text,
    'Satellite survey cancelled before it started'
  );
end;
$$;

revoke all on function public.cancel_survey_run(uuid) from public;
grant execute on function public.cancel_survey_run(uuid) to authenticated;

-- ── Deliverables bucket ──
--
-- Private, and addressed as {workspace_id}/{run_id}/{filename} so the read policy below
-- can decide access from the path alone. Objects are uploaded by the worker with the
-- service-role key, which is why there is no insert policy for members.
insert into storage.buckets (id, name, public)
values ('survey-deliverables', 'survey-deliverables', false)
on conflict (id) do update set public = false;

drop policy if exists "survey_deliverables_member_read" on storage.objects;
create policy "survey_deliverables_member_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'survey-deliverables'
    and public.is_workspace_member(public.path_first_segment_uuid(name))
  );

-- ── Billing ──
--
-- A survey is priced as an operation, the same way `ai.chat` is, so it debits the
-- workspace's existing credit balance and appears in the same transaction ledger rather
-- than becoming a second billing system. 20 credits against 2 for a chat turn reflects
-- what a run actually costs: six coverages pulled across the AOI, a 30 m grid scored per
-- category, and maps and KMZ files rendered.
insert into public.billing_operation_rates (operation, credits, estimated_cost, active)
values ('satellite.survey', 20, 0.60, true)
on conflict (operation) do update
set credits = excluded.credits,
    estimated_cost = excluded.estimated_cost,
    active = true,
    updated_at = now();

-- ── Retire the extension layer this replaces ──
--
-- `workspace_extensions` recorded whether a bolt-on panel was switched on and the URL of
-- the service it called. Satellite surveying is now a feature of the platform with its
-- own tables, so that decision has no owner and nothing reads it. The table is dropped
-- rather than left behind: a schema surface nothing queries is a schema surface that
-- misleads the next reader.
drop table if exists public.workspace_extensions;
