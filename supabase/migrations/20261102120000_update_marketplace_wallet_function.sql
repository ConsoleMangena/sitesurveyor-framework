-- 0030 — Security definer function to update marketplace wallet
-- Allows workspace members with finance role (or owner/admin) to update
-- the marketplace_wallet_address, bypassing RLS with proper checks.

create or replace function public.update_marketplace_wallet(
  p_workspace_id uuid,
  p_address text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  -- Lock the workspace to prevent concurrent updates
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));

  -- Check if user is a member of the workspace and has sufficient role
  select role into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = auth.uid();

  if v_role is null then
    raise exception 'You are not a member of this workspace';
  end if;

  -- Only owner, admin, or finance can update the receiving wallet
  if v_role not in ('owner', 'admin', 'finance') then
    raise exception 'Only workspace owners, admins, and finance managers can change the receiving wallet';
  end if;

  -- Update the wallet address
  update public.workspaces
  set marketplace_wallet_address = nullif(p_address, ''),
      updated_at = now()
  where id = p_workspace_id;

  if not found then
    raise exception 'Workspace not found';
  end if;
end;
$$;

grant execute on function public.update_marketplace_wallet(uuid, text) to authenticated;