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
