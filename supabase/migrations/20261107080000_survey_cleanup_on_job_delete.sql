-- Migration: 20261107080000_survey_cleanup_on_job_delete.sql
-- Enables cascading deletion and storage cleanup when an Earth Observation job or survey run is deleted.

-- 1. Add job_id foreign key on survey_runs linking to public.jobs
alter table public.survey_runs
  add column if not exists job_id uuid references public.jobs(id) on delete cascade;

create index if not exists survey_runs_job_id_idx
  on public.survey_runs (job_id);

-- 2. Member delete policy on storage.objects for survey-deliverables
drop policy if exists "survey_deliverables_member_delete" on storage.objects;
create policy "survey_deliverables_member_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'survey-deliverables'
    and public.is_workspace_member(public.path_first_segment_uuid(name))
  );

-- 3. Member delete policies on survey tables
drop policy if exists survey_runs_delete_member on public.survey_runs;
create policy survey_runs_delete_member
  on public.survey_runs for delete to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = survey_runs.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = survey_runs.workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

drop policy if exists survey_targets_delete_member on public.survey_targets;
create policy survey_targets_delete_member
  on public.survey_targets for delete to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = survey_targets.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = survey_targets.workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

drop policy if exists survey_deliverables_delete_member on public.survey_deliverables;
create policy survey_deliverables_delete_member
  on public.survey_deliverables for delete to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = survey_deliverables.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = survey_deliverables.workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

-- 4. RPC to delete a single survey run and return deliverables storage paths
create or replace function public.delete_survey_run(p_run_id uuid)
returns table (storage_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id
  from public.survey_runs
  where id = p_run_id;

  if not found then
    return;
  end if;

  if not (
    coalesce(auth.jwt()->>'role', '') = 'service_role'
    or public.is_workspace_member(v_workspace_id)
    or exists (
      select 1 from public.workspaces w
      where w.id = v_workspace_id and w.owner_user_id = auth.uid()
    )
  ) then
    raise exception 'Not authorised to delete this survey run'
      using errcode = '42501';
  end if;

  return query
  select d.storage_path
  from public.survey_deliverables d
  where d.run_id = p_run_id;

  delete from public.survey_runs where id = p_run_id;
end;
$$;

revoke all on function public.delete_survey_run(uuid) from public;
grant execute on function public.delete_survey_run(uuid) to authenticated;
grant execute on function public.delete_survey_run(uuid) to service_role;

-- 5. RPC to delete all survey runs for a job and return deliverables storage paths
create or replace function public.delete_survey_runs_for_job(
  p_workspace_id uuid,
  p_job_id uuid,
  p_client_name text default null
)
returns table (storage_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_ids uuid[];
begin
  if not (
    coalesce(auth.jwt()->>'role', '') = 'service_role'
    or public.is_workspace_member(p_workspace_id)
    or exists (
      select 1 from public.workspaces w
      where w.id = p_workspace_id and w.owner_user_id = auth.uid()
    )
  ) then
    raise exception 'Not authorised to delete survey runs in this workspace'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_run_ids
  from public.survey_runs
  where workspace_id = p_workspace_id
    and (
      (p_job_id is not null and (job_id = p_job_id or project_id = p_job_id))
      or (p_client_name is not null and trim(p_client_name) <> '' and client_name = trim(p_client_name))
    );

  if array_length(v_run_ids, 1) is null then
    return;
  end if;

  return query
  select d.storage_path
  from public.survey_deliverables d
  where d.run_id = any(v_run_ids);

  delete from public.survey_runs
  where id = any(v_run_ids);
end;
$$;

revoke all on function public.delete_survey_runs_for_job(uuid, uuid, text) from public;
grant execute on function public.delete_survey_runs_for_job(uuid, uuid, text) to authenticated;
grant execute on function public.delete_survey_runs_for_job(uuid, uuid, text) to service_role;
