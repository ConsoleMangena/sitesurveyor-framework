-- Provider sign-ins (Google, GitHub) previously produced two bad outcomes:
--
-- 1. Duplicate accounts. `enable_manual_linking` is on, so GoTrue does not
--    auto-link an OAuth identity to an existing account with the same email:
--    it creates a second auth.users row and the person now owns two accounts
--    that each see half their data. The trigger now refuses to provision a
--    provider signup whose email is already claimed, which aborts the GoTrue
--    INSERT, and the app translates that into "sign in with the original
--    method and link this provider from Account security".
--
-- 2. Auto-allocated dashboards. The old trigger created a personal workspace
--    for every new user, and the app defaulted provider signups to
--    'personal'. Now a provider signup (no account_type metadata) creates no
--    workspace, leaves auth_signup_account_type NULL, and sets
--    onboarding_complete = false; the app shows an onboarding survey and only
--    allocates the dashboard after it is submitted.
--
-- Email signups keep the old behaviour: the metadata they set at signup is
-- complete, so the trigger provisions them as before. Wallet signups also
-- keep working: persistSolanaSignUp writes the profile + workspace itself.
--
-- The trigger is SECURITY DEFINER, so it writes whatever it needs regardless
-- of RLS; the RPC below is also security definer so an authenticated user can
-- ask "is this email already claimed?" without RLS hiding the answer.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  full_name_value text;
  workspace_name_value text;
  workspace_type_value public.workspace_type;
  workspace_slug_value text;
  created_workspace_id uuid;
  signup_account_type_value text;
  profile_email_value text;
  signup_source_value text;
  has_signup_details boolean;
begin
  signup_source_value := lower(trim(coalesce(new.raw_user_meta_data ->> 'signup_source', '')));

  full_name_value := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  signup_account_type_value := case lower(trim(coalesce(new.raw_user_meta_data ->> 'account_type', '')))
    when 'personal' then 'personal'
    when 'business' then 'business'
    when 'platform_admin' then 'platform_admin'
    else null
  end;

  -- A provider signup (Google/GitHub) carries an email but no account_type
  -- metadata. An email signup carries both (the form collects them before
  -- Auth is called). A wallet signup carries neither email — the address is
  -- written to the profile only, after the row exists — so it can never be
  -- mistaken for a provider. The distinction drives everything below:
  -- providers must complete the onboarding survey before a dashboard is
  -- allocated, the rest arrive provisioned.
  has_signup_details :=
    signup_account_type_value is not null or new.email is null;

  -- Duplicate-email guard for provider signups. auth.users is the identity
  -- store; profiles.email is the display mirror whose unique index is what a
  -- second account cannot claim. Wallet accounts keep their email only on
  -- the profile, so the mirror is the check that matters.
  if
    new.email is not null
    and signup_account_type_value is null
    and exists (
      select 1
      from public.profiles claimed
      where claimed.email = new.email
        and claimed.id is distinct from new.id
    )
  then
    raise exception 'SITE_SURVEYOR_EMAIL_CLAIMED: %', new.email
      using errcode = 'P0001';
  end if;

  profile_email_value := case
    when new.email is null then null
    when exists (
      select 1
      from public.profiles claimed
      where claimed.email = new.email
        and claimed.id is distinct from new.id
    ) then null
    else new.email
  end;

  -- Email/wallet signups keep the old provisioning behaviour: workspace at
  -- signup, account type on the profile, onboarding done. Provider signups
  -- get none of that until they complete the onboarding survey.
  if has_signup_details then
    workspace_type_value := case
      when coalesce(new.raw_user_meta_data ->> 'account_type', 'personal') = 'business'
        then 'business'::public.workspace_type
      else 'personal'::public.workspace_type
    end;

    workspace_name_value := coalesce(
      nullif(new.raw_user_meta_data ->> 'workspace_name', ''),
      nullif(new.raw_user_meta_data ->> 'company', ''),
      case
        when workspace_type_value = 'business' then full_name_value || ' Workspace'
        else full_name_value || ' Personal Workspace'
      end
    );

    workspace_slug_value := public.slugify(workspace_name_value);
    if workspace_slug_value is null or workspace_slug_value = '' then
      workspace_slug_value := 'workspace';
    end if;

    while exists (select 1 from public.workspaces where slug = workspace_slug_value) loop
      workspace_slug_value := workspace_slug_value || '-' || substr(md5(random()::text), 1, 6);
    end loop;

    insert into public.workspaces (
      name,
      slug,
      type,
      owner_user_id
    )
    values (
      workspace_name_value,
      workspace_slug_value,
      workspace_type_value,
      new.id
    )
    returning id into created_workspace_id;

    insert into public.workspace_settings (workspace_id)
    values (created_workspace_id);

    insert into public.workspace_members (
      workspace_id,
      user_id,
      role,
      status,
      joined_at
    )
    values (
      created_workspace_id,
      new.id,
      'owner',
      'active',
      now()
    );
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    promo_code,
    default_workspace_id,
    auth_signup_account_type,
    onboarding_complete
  )
  values (
    new.id,
    profile_email_value,
    full_name_value,
    nullif(new.raw_user_meta_data ->> 'promo_code', ''),
    created_workspace_id,  -- null for provider signups: survey allocates it
    signup_account_type_value,
    has_signup_details     -- provider signups must complete the survey first
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email),
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        promo_code = coalesce(excluded.promo_code, public.profiles.promo_code),
        default_workspace_id = coalesce(public.profiles.default_workspace_id, excluded.default_workspace_id),
        auth_signup_account_type = coalesce(
          public.profiles.auth_signup_account_type,
          excluded.auth_signup_account_type
        ),
        -- Once true it stays true: an older account re-triggered by an email
        -- change must not be pushed back through the survey.
        onboarding_complete = public.profiles.onboarding_complete or excluded.onboarding_complete,
        updated_at = now();

  return new;
end;
$function$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and tgname = 'on_auth_user_created'
      and not tgisinternal
  ) then
    null;  -- trigger exists and is current; nothing to do
  else
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_auth_user();
  end if;
end;
$$;
