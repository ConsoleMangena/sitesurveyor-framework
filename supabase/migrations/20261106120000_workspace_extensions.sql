-- Per-workspace extension install state.
--
-- The extension catalogue itself lives in the app bundle
-- (`apps/web/src/features/extensions/registry.ts`) because an extension's UI is
-- compiled in, so there is nothing to install from a distance. What this table
-- holds is the workspace's decision about each catalogue entry: whether it is
-- switched on, and the runtime address its panel should call.
--
-- One row per (workspace, extension) rather than a JSON blob on `workspaces`:
-- a row is what lets an extension add configuration later without a second
-- table, and Postgres can enforce the uniqueness the app would otherwise have
-- to re-check on every write.
--
-- Members read the state so the whole team sees the same navigation. Only an
-- owner or admin may change it — enabling or disabling an extension moves
-- entries in and out of everyone's sidebar, which is a workspace-level decision
-- in the same spirit as `workspace_ai_providers`.
create table if not exists public.workspace_extensions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  extension_id text not null,
  installed boolean not null default true,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, extension_id)
);

create index if not exists workspace_extensions_workspace_idx
  on public.workspace_extensions (workspace_id, extension_id);

alter table public.workspace_extensions enable row level security;

create policy workspace_extensions_select_member
  on public.workspace_extensions for select to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_extensions.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create policy workspace_extensions_admin_write
  on public.workspace_extensions for insert to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_extensions.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('owner', 'admin')
    )
  );

create policy workspace_extensions_admin_update
  on public.workspace_extensions for update to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_extensions.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_extensions.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('owner', 'admin')
    )
  );

create policy workspace_extensions_admin_delete
  on public.workspace_extensions for delete to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_extensions.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('owner', 'admin')
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

drop trigger if exists trg_workspace_extensions_updated_at on public.workspace_extensions;
create trigger trg_workspace_extensions_updated_at
  before update on public.workspace_extensions
  for each row execute function public.touch_updated_at();
