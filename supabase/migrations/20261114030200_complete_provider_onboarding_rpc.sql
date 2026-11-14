-- Completes onboarding for a provider signup (Google/GitHub): writes the
-- profile fields the survey collected and allocates the dashboard — a
-- personal or business workspace — in one atomic call.
--
-- The signup trigger deliberately leaves provider accounts without a
-- workspace or account type until this runs, so the app can show a survey
-- instead of silently allocating a personal dashboard. Email and wallet
-- signups are provisioned at signup and refuse here.
--
-- SECURITY DEFINER because the workspace inserts and the profile update must
-- land together; doing it in one function makes the allocation atomic.

create or replace function public.complete_provider_onboarding(
  p_full_name text,
  p_account_type text,
  p_company_name text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_workspace_type public.workspace_type;
  v_workspace_name text;
  v_slug text;
  v_existing_type text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'Your name is required.';
  end if;

  if lower(btrim(coalesce(p_account_type, ''))) not in ('personal', 'business') then
    raise exception 'Choose a personal or business account.';
  end if;

  select default_workspace_id, auth_signup_account_type
    into v_workspace_id, v_existing_type
  from public.profiles
  where id = v_user_id;

  if v_workspace_id is not null or v_existing_type is not null then
    -- Already provisioned (email/wallet signup, or the survey was submitted
    -- twice). Idempotent: hand back the dashboard that exists.
    if v_workspace_id is not null then
      return v_workspace_id;
    end if;
    raise exception 'This account is already set up.';
  end if;

  v_workspace_type := case
    when lower(btrim(p_account_type)) = 'business' then 'business'::public.workspace_type
    else 'personal'::public.workspace_type
  end;

  v_workspace_name := case
    when v_workspace_type = 'business' then
      coalesce(nullif(btrim(coalesce(p_company_name, '')), ''), btrim(p_full_name) || ' Workspace')
    else btrim(p_full_name) || ' Personal Workspace'
  end;

  v_slug := public.slugify(v_workspace_name);
  if v_slug is null or v_slug = '' then
    v_slug := 'workspace';
  end if;

  while exists (select 1 from public.workspaces where slug = v_slug) loop
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 6);
  end loop;

  insert into public.workspaces (name, slug, type, owner_user_id)
  values (v_workspace_name, v_slug, v_workspace_type, v_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_settings (workspace_id)
  values (v_workspace_id);

  insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
  values (v_workspace_id, v_user_id, 'owner', 'active', now());

  update public.profiles
  set full_name = btrim(p_full_name),
      company_name = case
        when v_workspace_type = 'business'
          then coalesce(nullif(btrim(coalesce(p_company_name, '')), ''), v_workspace_name)
        else company_name
      end,
      auth_signup_account_type = v_workspace_type::text,
      onboarding_complete = true,
      updated_at = now()
  where id = v_user_id;

  return v_workspace_id;
end;
$function$;

revoke execute on function public.complete_provider_onboarding(text, text, text) from public, anon;
grant execute on function public.complete_provider_onboarding(text, text, text) to authenticated;
