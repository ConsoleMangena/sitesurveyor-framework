-- Allow workspace members (personal or business) to manage jobs in their workspaces.
--
-- Previously:
-- 1. The trigger `enforce_business_workspace_on_jobs` blocked any personal workspace from creating or updating jobs.
-- 2. The RLS policies on `public.jobs` only permitted `is_platform_admin()` to insert, update or delete.
--
-- With Earth Observation and surveyor workbench features accessible across all accounts,
-- workspace owners and active members need to create, update and view jobs.

-- 1. Drop the business-only trigger on jobs
drop trigger if exists enforce_business_workspace_on_jobs on public.jobs;

-- 2. Clean up old restrictive policies on public.jobs
drop policy if exists jobs_delete_platform_admin on public.jobs;
drop policy if exists jobs_insert_platform_admin on public.jobs;
drop policy if exists jobs_select_member on public.jobs;
drop policy if exists jobs_update_platform_admin on public.jobs;
drop policy if exists jobs_delete_member on public.jobs;
drop policy if exists jobs_insert_member on public.jobs;
drop policy if exists jobs_update_member on public.jobs;

-- 3. Create comprehensive RLS policies for members and platform admins
create policy jobs_select_member
  on public.jobs for select to authenticated
  using (
    is_platform_admin()
    or is_workspace_member(workspace_id)
    or exists (
      select 1 from public.workspaces w
      where w.id = jobs.workspace_id and w.owner_user_id = auth.uid()
    )
  );

create policy jobs_insert_member
  on public.jobs for insert to authenticated
  with check (
    is_platform_admin()
    or is_workspace_member(workspace_id)
    or exists (
      select 1 from public.workspaces w
      where w.id = jobs.workspace_id and w.owner_user_id = auth.uid()
    )
  );

create policy jobs_update_member
  on public.jobs for update to authenticated
  using (
    is_platform_admin()
    or is_workspace_member(workspace_id)
    or exists (
      select 1 from public.workspaces w
      where w.id = jobs.workspace_id and w.owner_user_id = auth.uid()
    )
  )
  with check (
    is_platform_admin()
    or is_workspace_member(workspace_id)
    or exists (
      select 1 from public.workspaces w
      where w.id = jobs.workspace_id and w.owner_user_id = auth.uid()
    )
  );

create policy jobs_delete_member
  on public.jobs for delete to authenticated
  using (
    is_platform_admin()
    or is_workspace_member(workspace_id)
    or exists (
      select 1 from public.workspaces w
      where w.id = jobs.workspace_id and w.owner_user_id = auth.uid()
    )
  );

-- 4. Clean up temporary inspection functions
drop function if exists public.get_jobs_triggers();
drop function if exists public.get_jobs_policies();
drop function if exists public.get_table_policies(text);
