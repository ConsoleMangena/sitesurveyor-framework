-- GitHub sign-in failed with GoTrue's "Database error saving new user", which is
-- raised when the INSERT into auth.users aborts. auth.users accepts such rows, so
-- the abort came from the AFTER INSERT trigger: it mirrors new.email into
-- public.profiles, whose profiles_email_key unique index is already claimed by an
-- account whose auth.users.email is still NULL (a wallet account whose email was
-- saved onto the profile only). One human, two tables that disagree about who owns
-- the address: GoTrue looks up auth.users and decides "new account", the trigger
-- looks at profiles and raises 23505, and the whole sign-in transaction rolls back.
--
-- This also brings the trigger under version control: it existed only in the
-- hosted database, so a fresh `supabase db reset` never created it.

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
begin
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

  -- De-dupe the slug so re-signups (or reused workspace names) never crash.
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

  -- profiles.email is a mirror, not a second identity store: auth.users is what
  -- decides who owns an address. When another profile already claims it, the new
  -- profile is created without one rather than aborting the sign-in. The
  -- address is still visible on the provider identity, and the account can be
  -- merged or the email cleared by an operator afterwards.
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

  insert into public.profiles (
    id,
    email,
    full_name,
    promo_code,
    default_workspace_id,
    auth_signup_account_type
  )
  values (
    new.id,
    profile_email_value,
    full_name_value,
    nullif(new.raw_user_meta_data ->> 'promo_code', ''),
    created_workspace_id,
    signup_account_type_value
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
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_auth_user();
  end if;
end;
$$;
