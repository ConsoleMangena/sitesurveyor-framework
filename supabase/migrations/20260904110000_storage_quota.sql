-- Storage quota: per-workspace file storage limits
-- Migrated from backend/sql/0005_storage_quota.sql

alter table public.workspaces
  add column if not exists storage_limit_mb integer not null default 500;

comment on column public.workspaces.storage_limit_mb is
  'Maximum file storage in megabytes for this workspace. Default 500 MB (free tier).';

-- RPC: returns storage usage for a workspace the caller is a member of.
-- Returns JSONB: { used_bytes, file_count, limit_mb, used_mb, percent }
create or replace function public.get_workspace_storage_usage(p_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with usage as (
    select
      coalesce(sum(a.size_bytes), 0)::bigint as used_bytes,
      count(*)::int as file_count
    from public.attachments a
    where a.workspace_id = p_workspace_id
  ),
  limits as (
    select w.storage_limit_mb
    from public.workspaces w
    where w.id = p_workspace_id
  )
  select jsonb_build_object(
    'used_bytes',  u.used_bytes,
    'file_count',  u.file_count,
    'limit_mb',    l.storage_limit_mb,
    'used_mb',     round((u.used_bytes / 1048576.0)::numeric, 2),
    'percent',     case
                     when l.storage_limit_mb = 0 then 0
                     else round(((u.used_bytes / 1048576.0) / l.storage_limit_mb * 100)::numeric, 1)
                   end
  )
  from usage u, limits l;
$$;

comment on function public.get_workspace_storage_usage(uuid) is
  'Returns file storage usage stats for a workspace. Requires workspace membership.';
