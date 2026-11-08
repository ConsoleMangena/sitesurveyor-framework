-- Base schema for SiteSurveyor, captured from the deployed project.
--
-- Why this file exists: the migrations in this directory are deltas. They add
-- surveys, transport, satellite pricing, marketplace completeness and so on,
-- but they never created the relations they build on (`workspaces`, `projects`,
-- `assets`, `marketplace_listings`, `professionals`, `workspace_members`, ...).
-- Without a baseline, `supabase db reset` produced a database most of the app
-- could not query, and no environment other than the original project could be
-- rebuilt from this repository.
--
-- Provenance
--   project ref : csjjmuexzuewqnopzbik
--   captured    : 2026-11-08
--   command     : npx supabase db dump --schema public -f <this file>
--   contents    : 81 tables, 176 RLS policies, 90 functions, 44 triggers,
--                 16 types, 12 views, 289 constraints, 96 indexes. Schema only,
--                 `public` only. Extensions live in the `extensions` schema and
--                 are provided by the Supabase platform, not by this file.
--   note        : the captured project already had every migration in this
--                 directory applied, so this file also contains the objects
--                 those migrations create. Both sides use `if not exists` /
--                 `create or replace`; `supabase db reset` was run to prove the
--                 replay works from empty (see DOCS_AUDIT.md).
--
-- This is history, not a working area: never edit it. Any schema change belongs
-- in a new, later migration. To refresh it, take a new dump into a new
-- timestamped file and record that in DOCS_AUDIT.md.
--
-- On an existing deployment the schema is already in place, so `supabase db
-- push` would replay this file and collide. Mark it as applied first:
--
--   supabase migration repair --status applied 20260823000000
--
-- Fresh and local environments need no action: `supabase db reset` applies this
-- file before everything else, which is what it was captured for.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."asset_kind" AS ENUM (
    'instrument',
    'vehicle',
    'equipment',
    'other'
);


ALTER TYPE "public"."asset_kind" OWNER TO "postgres";


CREATE TYPE "public"."asset_status" AS ENUM (
    'available',
    'deployed',
    'maintenance',
    'retired'
);


ALTER TYPE "public"."asset_status" OWNER TO "postgres";


CREATE TYPE "public"."assignment_status" AS ENUM (
    'draft',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."assignment_status" OWNER TO "postgres";


CREATE TYPE "public"."attachment_chain_status" AS ENUM (
    'none',
    'pending',
    'anchored',
    'failed'
);


ALTER TYPE "public"."attachment_chain_status" OWNER TO "postgres";


CREATE TYPE "public"."attachment_storage_tier" AS ENUM (
    'off_chain',
    'on_chain'
);


ALTER TYPE "public"."attachment_storage_tier" OWNER TO "postgres";


CREATE TYPE "public"."attachment_visibility" AS ENUM (
    'private',
    'workspace',
    'public'
);


ALTER TYPE "public"."attachment_visibility" OWNER TO "postgres";


CREATE TYPE "public"."calibration_status" AS ENUM (
    'scheduled',
    'passed',
    'failed',
    'expired'
);


ALTER TYPE "public"."calibration_status" OWNER TO "postgres";


CREATE TYPE "public"."invoice_status" AS ENUM (
    'draft',
    'sent',
    'paid',
    'overdue',
    'cancelled'
);


ALTER TYPE "public"."invoice_status" OWNER TO "postgres";


CREATE TYPE "public"."job_status" AS ENUM (
    'planned',
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."job_status" OWNER TO "postgres";


CREATE TYPE "public"."notification_status" AS ENUM (
    'unread',
    'read',
    'archived'
);


ALTER TYPE "public"."notification_status" OWNER TO "postgres";


CREATE TYPE "public"."organization_type" AS ENUM (
    'client',
    'vendor',
    'government',
    'partner',
    'lead',
    'subcontractor'
);


ALTER TYPE "public"."organization_type" OWNER TO "postgres";


CREATE TYPE "public"."project_status" AS ENUM (
    'draft',
    'active',
    'completed',
    'on_hold',
    'archived'
);


ALTER TYPE "public"."project_status" OWNER TO "postgres";


CREATE TYPE "public"."quote_status" AS ENUM (
    'draft',
    'sent',
    'accepted',
    'rejected',
    'expired'
);


ALTER TYPE "public"."quote_status" OWNER TO "postgres";


CREATE TYPE "public"."workspace_member_role" AS ENUM (
    'owner',
    'admin',
    'ops_manager',
    'finance',
    'sales',
    'technician',
    'viewer'
);


ALTER TYPE "public"."workspace_member_role" OWNER TO "postgres";


CREATE TYPE "public"."workspace_member_status" AS ENUM (
    'active',
    'invited',
    'suspended'
);


ALTER TYPE "public"."workspace_member_status" OWNER TO "postgres";


CREATE TYPE "public"."workspace_type" AS ENUM (
    'personal',
    'business'
);


ALTER TYPE "public"."workspace_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_workspace_invitation"("target_invitation_token" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_user_email text;
  v_invitation public.workspace_invitations%rowtype;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select email
  into v_user_email
  from auth.users
  where id = v_user_id;

  select *
  into v_invitation
  from public.workspace_invitations
  where invitation_token = target_invitation_token
    and accepted_at is null
    and expires_at > now();

  if v_invitation.id is null then
    raise exception 'Invitation is invalid or expired.';
  end if;

  if not public.is_business_workspace(v_invitation.workspace_id) then
    raise exception 'Workspace invitations are only available for business workspaces.';
  end if;

  if lower(coalesce(v_user_email, '')) <> lower(v_invitation.email) then
    raise exception 'Invitation email does not match the signed-in user.';
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    status,
    invited_at,
    joined_at
  )
  values (
    v_invitation.workspace_id,
    v_user_id,
    v_invitation.role,
    'active',
    v_invitation.created_at,
    now()
  )
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        status = 'active',
        invited_at = coalesce(public.workspace_members.invited_at, excluded.invited_at),
        joined_at = coalesce(public.workspace_members.joined_at, excluded.joined_at),
        updated_at = now();

  update public.workspace_invitations
  set accepted_at = now()
  where id = v_invitation.id;

  return v_invitation.workspace_id;
end;
$$;


ALTER FUNCTION "public"."accept_workspace_invitation"("target_invitation_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_audit_log"("p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0, "p_workspace_id" "uuid" DEFAULT NULL::"uuid", "p_action" "text" DEFAULT NULL::"text") RETURNS TABLE("id" bigint, "workspace_id" "uuid", "actor_user_id" "uuid", "entity_table" "text", "entity_id" "uuid", "action" "text", "details" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators may read the audit log.';
  end if;

  return query
    select
      a.id,
      a.workspace_id,
      a.actor_user_id,
      a.entity_table,
      a.entity_id,
      a.action,
      a.details,
      a.created_at
    from audit.activity_log a
    where (p_workspace_id is null or a.workspace_id = p_workspace_id)
      and (p_action is null or a.action = p_action)
    order by a.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;


ALTER FUNCTION "public"."admin_list_audit_log"("p_limit" integer, "p_offset" integer, "p_workspace_id" "uuid", "p_action" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_list_audit_log"("p_limit" integer, "p_offset" integer, "p_workspace_id" "uuid", "p_action" "text") IS 'SECURITY DEFINER RPC so platform admins can read audit.activity_log without direct schema access.';



CREATE OR REPLACE FUNCTION "public"."admin_workspace_summary"("p_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators may access workspace summaries.';
  end if;

  select jsonb_build_object(
    'projects',  (select count(*) from public.projects    where workspace_id = p_workspace_id),
    'assets',    (select count(*) from public.assets      where workspace_id = p_workspace_id),
    'invoices',  (select count(*) from public.invoices    where workspace_id = p_workspace_id),
    'quotes',    (select count(*) from public.quotes      where workspace_id = p_workspace_id),
    'contacts',  (select count(*) from public.contacts    where workspace_id = p_workspace_id),
    'jobs',      (select count(*) from public.jobs        where workspace_id = p_workspace_id),
    'members',   (select count(*) from public.workspace_members where workspace_id = p_workspace_id)
  ) into result;

  return result;
end;
$$;


ALTER FUNCTION "public"."admin_workspace_summary"("p_workspace_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_workspace_summary"("p_workspace_id" "uuid") IS 'Returns entity counts for a workspace. Platform admin only.';



CREATE OR REPLACE FUNCTION "public"."can_manage_assets"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_workspace_role(
    target_workspace_id,
    array[
      'owner'::public.workspace_member_role,
      'admin'::public.workspace_member_role,
      'ops_manager'::public.workspace_member_role,
      'technician'::public.workspace_member_role
    ]
  );
$$;


ALTER FUNCTION "public"."can_manage_assets"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_business_operations"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_business_workspace(target_workspace_id)
    and public.can_manage_operations(target_workspace_id);
$$;


ALTER FUNCTION "public"."can_manage_business_operations"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_business_workspace"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_business_workspace(target_workspace_id)
    and public.can_manage_workspace(target_workspace_id);
$$;


ALTER FUNCTION "public"."can_manage_business_workspace"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_documents"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_workspace_role(
    target_workspace_id,
    array[
      'owner'::public.workspace_member_role,
      'admin'::public.workspace_member_role,
      'ops_manager'::public.workspace_member_role,
      'finance'::public.workspace_member_role,
      'sales'::public.workspace_member_role
    ]
  );
$$;


ALTER FUNCTION "public"."can_manage_documents"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_finance"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_workspace_role(
    target_workspace_id,
    array[
      'owner'::public.workspace_member_role,
      'admin'::public.workspace_member_role,
      'finance'::public.workspace_member_role
    ]
  );
$$;


ALTER FUNCTION "public"."can_manage_finance"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_operations"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_workspace_role(
    target_workspace_id,
    array[
      'owner'::public.workspace_member_role,
      'admin'::public.workspace_member_role,
      'ops_manager'::public.workspace_member_role
    ]
  );
$$;


ALTER FUNCTION "public"."can_manage_operations"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_sales"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_workspace_role(
    target_workspace_id,
    array[
      'owner'::public.workspace_member_role,
      'admin'::public.workspace_member_role,
      'sales'::public.workspace_member_role
    ]
  );
$$;


ALTER FUNCTION "public"."can_manage_sales"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_workspace"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_workspace_role(
    target_workspace_id,
    array['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role]
  );
$$;


ALTER FUNCTION "public"."can_manage_workspace"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_survey_run"("p_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."cancel_survey_run"("p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."charge_satellite_survey"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_description" "text", "p_categories" "text"[], "p_half_deg" numeric, "p_latitude" numeric) RETURNS TABLE("transaction_id" "uuid", "remaining_balance" bigint, "credits_charged" bigint, "quote" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_quote jsonb;
  v_credits bigint;
  v_area_km2 numeric;
  v_charge record;
begin
  v_quote := public.price_satellite_survey(p_categories, p_half_deg, p_latitude);
  v_credits := (v_quote ->> 'credits')::bigint;
  v_area_km2 := (v_quote ->> 'surface_area_km2')::numeric;

  select * into v_charge
  from public.spend_workspace_ai_credits(
    p_workspace_id,
    p_user_id,
    p_operation_id,
    'satellite.survey',
    coalesce(
      nullif(p_description, ''),
      format(
        'Satellite survey · %s km2 · %s credit%s',
        round(v_area_km2, 1),
        v_credits,
        case when v_credits = 1 then '' else 's' end
      )
    ),
    v_credits
  );

  return query select v_charge.transaction_id, v_charge.remaining_balance, v_charge.credits_charged, v_quote;
end;
$$;


ALTER FUNCTION "public"."charge_satellite_survey"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_description" "text", "p_categories" "text"[], "p_half_deg" numeric, "p_latitude" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."charge_satellite_survey"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_description" "text", "p_categories" "text"[], "p_half_deg" numeric, "p_latitude" numeric) IS 'Prices a survey from its own specification and debits the workspace for exactly that amount. Service role only: it is the only path that spends credits for a survey.';



CREATE OR REPLACE FUNCTION "public"."claim_next_survey_run"("p_worker_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."claim_next_survey_run"("p_worker_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_business_workspace"("workspace_name" "text", "workspace_slug" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_slug text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if coalesce(trim(workspace_name), '') = '' then
    raise exception 'Workspace name is required.';
  end if;

  v_slug := public.slugify(coalesce(nullif(workspace_slug, ''), workspace_name));

  insert into public.workspaces (
    name,
    slug,
    type,
    owner_user_id
  )
  values (
    trim(workspace_name),
    v_slug,
    'business',
    v_user_id
  )
  returning id into v_workspace_id;

  insert into public.workspace_settings (workspace_id)
  values (v_workspace_id);

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    v_workspace_id,
    v_user_id,
    'owner',
    'active',
    now()
  );

  update public.profiles
  set default_workspace_id = coalesce(default_workspace_id, v_workspace_id),
      updated_at = now()
  where id = v_user_id;

  return v_workspace_id;
end;
$$;


ALTER FUNCTION "public"."create_business_workspace"("workspace_name" "text", "workspace_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_survey_run"("p_run_id" "uuid") RETURNS TABLE("storage_path" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."delete_survey_run"("p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_survey_runs_for_job"("p_workspace_id" "uuid", "p_job_id" "uuid", "p_client_name" "text" DEFAULT NULL::"text") RETURNS TABLE("storage_path" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."delete_survey_runs_for_job"("p_workspace_id" "uuid", "p_job_id" "uuid", "p_client_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_business_workspace_for_team_and_dispatch"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_workspace_id uuid;
begin
  v_workspace_id := coalesce(new.workspace_id, old.workspace_id);

  if v_workspace_id is null then
    raise exception 'A workspace_id is required.';
  end if;

  if not public.is_business_workspace(v_workspace_id) then
    raise exception 'This action is only available for business workspaces.';
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."enforce_business_workspace_for_team_and_dispatch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_workspace_storage_quota"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'storage', 'pg_temp'
    AS $$
declare
  v_workspace_id uuid;
  v_used_bytes bigint;
  v_limit_bytes bigint;
  v_old_bytes bigint := 0;
  v_new_bytes bigint;
begin
  if new.bucket_id not in ('workspace-private', 'workspace-public') then
    return new;
  end if;

  begin
    v_workspace_id := (string_to_array(new.name, '/'))[1]::uuid;
  exception when invalid_text_representation then
    return new;
  end;

  select coalesce(sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)), 0)
  into v_used_bytes
  from storage.objects o
  where o.bucket_id in ('workspace-private', 'workspace-public')
    and o.name like v_workspace_id::text || '/%';

  if tg_op = 'UPDATE'
    and old.bucket_id in ('workspace-private', 'workspace-public')
    and old.name like v_workspace_id::text || '/%' then
    v_old_bytes := coalesce(nullif(old.metadata ->> 'size', '')::bigint, 0);
  end if;
  v_new_bytes := coalesce(nullif(new.metadata ->> 'size', '')::bigint, 0);
  v_limit_bytes := public.workspace_storage_limit_bytes(v_workspace_id);

  if greatest(0, v_used_bytes - v_old_bytes) + v_new_bytes > v_limit_bytes then
    raise exception using
      errcode = 'P0002',
      message = 'STORAGE_QUOTA_EXCEEDED: New uploads are paused. Existing files are retained; renew storage or remove files before uploading.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_workspace_storage_quota"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_project_creator_member"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.created_by is not null then
    insert into public.project_members (workspace_id, project_id, user_id, role)
    values (new.workspace_id, new.id, new.created_by, 'manager')
    on conflict (project_id, user_id) do nothing;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_project_creator_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fail_survey_run"("p_run_id" "uuid", "p_error" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."fail_survey_run"("p_run_id" "uuid", "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fulfil_workspace_package_purchase"("p_transaction_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_transaction public.workspace_pesepay_transactions%rowtype;
  v_balance bigint;
  v_ledger_id uuid;
  v_purchase_id uuid;
begin
  select * into v_transaction
  from public.workspace_pesepay_transactions
  where id = p_transaction_id
    and kind in ('ai_credit_purchase', 'storage_purchase')
  for update;

  if not found then
    raise exception 'Package purchase not found';
  end if;
  if v_transaction.status = 'refunded' then
    raise exception 'A refunded purchase cannot be fulfilled again';
  end if;
  if v_transaction.status = 'completed' and v_transaction.related_id is not null then
    return v_transaction.related_id;
  end if;

  if v_transaction.kind = 'ai_credit_purchase' then
    if v_transaction.credit_amount is null then
      raise exception 'AI credit purchase snapshot is incomplete';
    end if;

    insert into public.workspace_ai_credit_accounts (workspace_id)
    values (v_transaction.workspace_id)
    on conflict (workspace_id) do nothing;

    update public.workspace_ai_credit_accounts
    set balance = balance + v_transaction.credit_amount,
        updated_at = now()
    where workspace_id = v_transaction.workspace_id
    returning balance into v_balance;

    insert into public.workspace_ai_credit_transactions (
      workspace_id, actor_user_id, kind, credits_delta, balance_after,
      operation_id, description, related_id
    ) values (
      v_transaction.workspace_id, v_transaction.user_id, 'purchase',
      v_transaction.credit_amount, v_balance,
      'package:' || v_transaction.id::text,
      v_transaction.description, v_transaction.id
    ) returning id into v_ledger_id;

    update public.workspace_pesepay_transactions
    set status = 'completed', related_id = v_ledger_id,
        completed_at = coalesce(completed_at, now())
    where id = v_transaction.id;
    return v_ledger_id;
  end if;

  if v_transaction.storage_mb is null or v_transaction.duration_days is null then
    raise exception 'Storage purchase snapshot is incomplete';
  end if;

  insert into public.workspace_storage_purchases (
    id, workspace_id, purchased_by, plan_id, storage_mb, amount,
    currency_code, payment_method, paid_at, starts_at, expires_at,
    included_in_base_quota
  ) values (
    v_transaction.id, v_transaction.workspace_id, v_transaction.user_id,
    v_transaction.package_id, v_transaction.storage_mb, v_transaction.amount,
    v_transaction.currency_code,
    case when v_transaction.pesepay_reference is null then 'balance' else 'pesepay_checkout' end,
    now(), now(), now() + make_interval(days => v_transaction.duration_days), false
  )
  on conflict (id) do nothing
  returning id into v_purchase_id;

  if v_purchase_id is null then
    v_purchase_id := v_transaction.id;
  end if;

  update public.workspace_pesepay_transactions
  set status = 'completed', related_id = v_purchase_id,
      completed_at = coalesce(completed_at, now())
  where id = v_transaction.id;
  return v_purchase_id;
end;
$$;


ALTER FUNCTION "public"."fulfil_workspace_package_purchase"("p_transaction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_database_size"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT pg_database_size(current_database());
$$;


ALTER FUNCTION "public"."get_database_size"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_financial_overview"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_gross numeric;
  v_refunds numeric;
  v_fees numeric;
  v_infrastructure numeric;
  v_transactions bigint;
  v_successful bigint;
  v_ai_credit_units bigint;
  v_storage_mb bigint;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_platform_admin
  ) then
    raise exception 'Platform administrator access required';
  end if;

  select
    coalesce(sum(t.amount) filter (
      where t.status = 'completed' and t.currency_code = 'USD'
        and t.kind in ('storage_purchase', 'ai_credit_purchase', 'invoice_payment')
    ), 0),
    coalesce(sum(t.amount) filter (where t.status = 'refunded' and t.currency_code = 'USD'), 0),
    coalesce(sum(t.estimated_payment_fee) filter (
      where t.status in ('completed', 'refunded') and t.currency_code = 'USD'
    ), 0),
    coalesce(sum(t.estimated_infrastructure_cost) filter (
      where t.status in ('completed', 'refunded') and t.currency_code = 'USD'
    ), 0),
    count(*),
    count(*) filter (where t.status = 'completed'),
    coalesce(sum(t.credit_amount) filter (where t.status = 'completed' and t.kind = 'ai_credit_purchase'), 0),
    coalesce(sum(t.storage_mb) filter (where t.status = 'completed' and t.kind = 'storage_purchase'), 0)
  into v_gross, v_refunds, v_fees, v_infrastructure, v_transactions, v_successful, v_ai_credit_units, v_storage_mb
  from public.workspace_pesepay_transactions t;

  return jsonb_build_object(
    'gross_revenue', v_gross,
    'refunds', v_refunds,
    'payment_fees', v_fees,
    'infrastructure_costs', v_infrastructure,
    'estimated_profit', v_gross - v_refunds - v_fees - v_infrastructure,
    'transaction_volume', v_transactions,
    'successful_orders', v_successful,
    'ai_credits_sold', v_ai_credit_units,
    'storage_mb_sold', v_storage_mb,
    'currency_code', 'USD',
    'cost_basis', 'Configurable estimates recorded at purchase time, not reconciled actual provider invoices.'
  );
end;
$$;


ALTER FUNCTION "public"."get_platform_financial_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tables_size"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = 'public';
$$;


ALTER FUNCTION "public"."get_tables_size"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workspace_billing_overview"("p_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_balance bigint;
  v_credits_used bigint;
  v_total_spent numeric;
  v_total_spent_zwl numeric;
  v_wallet_balance numeric;
  v_successful_purchases bigint;
  v_pending_payments bigint;
  v_failed_payments bigint;
  v_storage jsonb;
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Not authorised to inspect this workspace billing';
  end if;

  select coalesce(ca.balance, 0), coalesce(u.used, 0)
  into v_balance, v_credits_used
  from (select 1) seed
  left join public.workspace_ai_credit_accounts ca on ca.workspace_id = p_workspace_id
  left join (
    select -sum(t.credits_delta) as used
    from public.workspace_ai_credit_transactions t
    where t.workspace_id = p_workspace_id and t.kind = 'usage'
  ) u on true;

  select
    coalesce(sum(t.amount) filter (
      where t.status = 'completed' and t.currency_code = 'USD'
        and t.kind in ('storage_purchase', 'ai_credit_purchase', 'invoice_payment')
    ), 0),
    coalesce(sum(t.amount) filter (
      where t.status = 'completed' and t.currency_code = 'ZWL'
        and t.kind in ('storage_purchase', 'ai_credit_purchase', 'invoice_payment')
    ), 0),
    count(*) filter (
      where t.status = 'completed' and t.kind in ('storage_purchase', 'ai_credit_purchase', 'invoice_payment')
    ),
    count(*) filter (where t.status = 'pending'),
    count(*) filter (where t.status in ('failed', 'cancelled'))
  into v_total_spent, v_total_spent_zwl, v_successful_purchases, v_pending_payments, v_failed_payments
  from public.workspace_pesepay_transactions t
  where t.workspace_id = p_workspace_id;

  select coalesce(sum(w.balance), 0) into v_wallet_balance
  from public.workspace_pesepay_wallets w
  where w.workspace_id = p_workspace_id;

  v_storage := public.get_workspace_storage_usage(p_workspace_id);
  return jsonb_build_object(
    'ai_credit_balance', v_balance,
    'ai_credits_used', v_credits_used,
    'wallet_balance', v_wallet_balance,
    'total_spent', v_total_spent,
    'total_spent_zwl', v_total_spent_zwl,
    'currency_code', 'USD',
    'successful_purchases', v_successful_purchases,
    'pending_payments', v_pending_payments,
    'failed_payments', v_failed_payments,
    'storage', v_storage
  );
end;
$$;


ALTER FUNCTION "public"."get_workspace_billing_overview"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workspace_storage_usage"("p_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage', 'pg_temp'
    AS $$
declare
  v_used_bytes bigint;
  v_file_count integer;
  v_limit_bytes bigint;
  v_limit_mb numeric;
  v_purchased_mb numeric;
  v_expiring_mb numeric;
  v_next_expiry timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  ) then
    raise exception 'Not authorised to inspect this workspace storage';
  end if;

  select coalesce(sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)), 0)
  into v_used_bytes
  from storage.objects o
  where o.bucket_id in ('workspace-private', 'workspace-public')
    and o.name like p_workspace_id::text || '/%';

  select count(*)::integer into v_file_count
  from public.attachments a
  where a.workspace_id = p_workspace_id;

  v_limit_bytes := public.workspace_storage_limit_bytes(p_workspace_id);
  v_limit_mb := v_limit_bytes / 1048576.0;

  select
    coalesce(sum(sp.storage_mb), 0)::numeric,
    coalesce(sum(sp.storage_mb) filter (
      where sp.expires_at is not null and sp.expires_at <= now() + interval '7 days'
    ), 0)::numeric,
    min(sp.expires_at)
  into v_purchased_mb, v_expiring_mb, v_next_expiry
  from public.workspace_storage_purchases sp
  where sp.workspace_id = p_workspace_id
    and not sp.included_in_base_quota
    and sp.starts_at <= now()
    and (sp.expires_at is null or sp.expires_at > now());

  return jsonb_build_object(
    'used_bytes', v_used_bytes,
    'file_count', v_file_count,
    'limit_mb', round(v_limit_mb, 2),
    'base_limit_mb', v_limit_mb - coalesce(v_purchased_mb, 0),
    'purchased_storage_mb', coalesce(v_purchased_mb, 0),
    'expiring_storage_mb', coalesce(v_expiring_mb, 0),
    'next_storage_expiration', v_next_expiry,
    'used_mb', round(v_used_bytes / 1048576.0, 2),
    'percent', case when v_limit_bytes = 0 then 0 else round((v_used_bytes::numeric / v_limit_bytes * 100), 1) end,
    'over_quota', v_used_bytes > v_limit_bytes,
    'upload_allowed', v_used_bytes < v_limit_bytes
  );
end;
$$;


ALTER FUNCTION "public"."get_workspace_storage_usage"("p_workspace_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_workspace_storage_usage"("p_workspace_id" "uuid") IS 'Returns file storage usage stats for a workspace. Requires workspace membership.';



CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_workspace_role"("target_workspace_id" "uuid", "allowed_roles" "public"."workspace_member_role"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role = any (allowed_roles)
  );
$$;


ALTER FUNCTION "public"."has_workspace_role"("target_workspace_id" "uuid", "allowed_roles" "public"."workspace_member_role"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_business_workspace"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.type = 'business'
      and w.archived_at is null
  );
$$;


ALTER FUNCTION "public"."is_business_workspace"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_listing_seller"("target_listing_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.marketplace_listings l
    where l.id = target_listing_id
      and is_workspace_member(l.workspace_id)
  );
$$;


ALTER FUNCTION "public"."is_listing_seller"("target_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_platform_admin"() IS 'True when profiles.is_platform_admin for auth.uid(). SECURITY DEFINER avoids RLS recursion.';



CREATE OR REPLACE FUNCTION "public"."is_workspace_member"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_workspace_member"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_email_identity"("p_user_id" "uuid", "p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_email text := lower(trim(p_email));
  v_owner uuid;
begin
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;

  select id into v_owner from auth.users where lower(email) = v_email;
  if v_owner is not null and v_owner <> p_user_id then
    raise exception 'EMAIL_ALREADY_IN_USE' using errcode = 'P0001';
  end if;

  insert into auth.identities (id, user_id, provider, provider_id, identity_data,
                               last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_user_id, 'email', p_user_id::text,
    jsonb_build_object('sub', p_user_id::text, 'email', v_email, 'email_verified', true),
    now(), now(), now()
  )
  on conflict (provider_id, provider) do nothing;
end;
$_$;


ALTER FUNCTION "public"."link_email_identity"("p_user_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_web3_identity"("p_user_id" "uuid", "p_chain" "text", "p_address" "text", "p_identity_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_provider_id text;
  v_normalized  text;
  v_owner       uuid;
  v_wallet_owner uuid;
begin
  if p_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_chain not in ('ethereum', 'solana') then
    raise exception 'UNSUPPORTED_CHAIN' using errcode = 'P0001';
  end if;

  -- Normalise: EVM addresses are hex and case-insensitive, Solana are base58.
  if p_chain = 'ethereum' then
    if p_address !~* '^0x[0-9a-f]{40}$' then
      raise exception 'INVALID_ADDRESS' using errcode = 'P0001';
    end if;
    v_normalized := lower(p_address);
  else
    if p_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
      raise exception 'INVALID_ADDRESS' using errcode = 'P0001';
    end if;
    v_normalized := p_address;
  end if;

  v_provider_id := 'web3:' || p_chain || ':' || v_normalized;

  -- Account-takeover guard: an address may belong to exactly one account.
  select user_id into v_owner
    from auth.identities
   where provider = 'web3' and provider_id = v_provider_id;

  if v_owner is not null and v_owner <> p_user_id then
    raise exception 'WALLET_ALREADY_LINKED' using errcode = 'P0001';
  end if;

  select user_id into v_wallet_owner
    from public.linked_wallets
   where chain = p_chain and address = v_normalized;

  if v_wallet_owner is not null and v_wallet_owner <> p_user_id then
    raise exception 'WALLET_ALREADY_LINKED' using errcode = 'P0001';
  end if;

  -- Attach the identity Supabase Auth resolves on the next
  -- `signInWithWeb3({ chain })` so a linked wallet signs into THIS account
  -- instead of creating a duplicate one.
  if v_owner is null then
    insert into auth.identities (id, user_id, provider, provider_id, identity_data,
                                 last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(),
      p_user_id,
      'web3',
      v_provider_id,
      jsonb_build_object(
        'sub',     v_provider_id,
        'chain',   p_chain,
        'address', v_normalized,
        'network', coalesce(p_identity_data ->> 'network', ''),
        'domain',  coalesce(p_identity_data ->> 'domain', ''),
        'statement', coalesce(p_identity_data ->> 'statement', '')
      ),
      now(), now(), now()
    )
    on conflict (provider_id, provider) do nothing;
  end if;

  insert into public.linked_wallets (user_id, chain, address, provider_id, updated_at)
  values (p_user_id, p_chain, v_normalized, v_provider_id, now())
  on conflict (chain, address) do update
    set user_id      = excluded.user_id,
        provider_id  = excluded.provider_id,
        updated_at   = now();
end;
$_$;


ALTER FUNCTION "public"."link_web3_identity"("p_user_id" "uuid", "p_chain" "text", "p_address" "text", "p_identity_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_workspace_activity_log"("p_workspace_id" "uuid", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" bigint, "workspace_id" "uuid", "actor_user_id" "uuid", "entity_table" "text", "entity_id" "uuid", "action" "text", "details" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Only workspace members can read this activity log.';
  end if;

  return query
    select
      a.id,
      a.workspace_id,
      a.actor_user_id,
      a.entity_table,
      a.entity_id,
      a.action,
      a.details,
      a.created_at
    from audit.activity_log a
    where a.workspace_id = p_workspace_id
    order by a.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;


ALTER FUNCTION "public"."list_workspace_activity_log"("p_workspace_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."list_workspace_activity_log"("p_workspace_id" "uuid", "p_limit" integer, "p_offset" integer) IS 'SECURITY DEFINER RPC so authenticated workspace members can read their own audit.activity_log rows.';



CREATE OR REPLACE FUNCTION "public"."log_activity"("p_workspace_id" "uuid", "p_entity_table" "text", "p_entity_id" "uuid", "p_action" "text", "p_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Only workspace members can log activity.';
  end if;

  insert into audit.activity_log (workspace_id, actor_user_id, entity_table, entity_id, action, details)
  values (p_workspace_id, auth.uid(), p_entity_table, p_entity_id, p_action, p_details);
end;
$$;


ALTER FUNCTION "public"."log_activity"("p_workspace_id" "uuid", "p_entity_table" "text", "p_entity_id" "uuid", "p_action" "text", "p_details" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_activity"("p_workspace_id" "uuid", "p_entity_table" "text", "p_entity_id" "uuid", "p_action" "text", "p_details" "jsonb") IS 'SECURITY DEFINER RPC so authenticated workspace members can write audit.activity_log rows.';



CREATE OR REPLACE FUNCTION "public"."market_item_workspace"("p_kind" "text", "p_item_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case p_kind
    when 'listing' then (select workspace_id from public.marketplace_listings where id = p_item_id)
    when 'professional' then (select workspace_id from public.professionals where id = p_item_id)
    when 'job' then (select workspace_id from public.market_job_posts where id = p_item_id)
    when 'firm' then (select workspace_id from public.market_firms where id = p_item_id)
    when 'event' then (select workspace_id from public.market_events where id = p_item_id)
  end;
$$;


ALTER FUNCTION "public"."market_item_workspace"("p_kind" "text", "p_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."path_first_segment_uuid"("path" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
declare
  first_segment text;
begin
  first_segment := split_part(path, '/', 1);

  if first_segment ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return first_segment::uuid;
  end if;

  return null;
end;
$_$;


ALTER FUNCTION "public"."path_first_segment_uuid"("path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_workspace_invoice_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_invoice_id" "uuid", "p_request_id" "uuid") RETURNS TABLE("payment_id" "uuid", "remaining_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_balance numeric(14, 2);
  v_wallet public.workspace_pesepay_wallets%rowtype;
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select role::text into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = p_user_id
    and status = 'active';
  if v_role is null or v_role not in ('owner', 'admin', 'finance') then
    raise exception 'Only workspace owners, admins, and finance managers can pay invoices from the balance';
  end if;

  select * into v_payment
  from public.payments
  where id = p_request_id
  for update;

  if found then
    if v_payment.workspace_id <> p_workspace_id
      or v_payment.created_by is distinct from p_user_id
      or v_payment.invoice_id is distinct from p_invoice_id
      or v_payment.payment_method <> 'PesePay balance' then
      raise exception 'Invoice payment request is not reusable';
    end if;
    select balance into v_balance
    from public.workspace_pesepay_wallets
    where workspace_id = p_workspace_id and user_id = p_user_id;
    return query select v_payment.id, v_balance;
    return;
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if v_invoice.status = 'paid' then
    raise exception 'Invoice is already paid';
  end if;
  if v_invoice.currency_code <> 'USD' or v_invoice.total <= 0 then
    raise exception 'Only positive USD invoices can be paid from the PesePay balance';
  end if;

  select * into v_wallet
  from public.workspace_pesepay_wallets
  where workspace_id = p_workspace_id and user_id = p_user_id
  for update;
  if not found or v_wallet.balance < v_invoice.total then
    raise exception 'Insufficient PesePay balance. Add funds before paying this invoice';
  end if;

  update public.workspace_pesepay_wallets
  set balance = balance - v_invoice.total, updated_at = now()
  where id = v_wallet.id
  returning balance into v_balance;

  insert into public.payments (
    id, workspace_id, invoice_id, amount, paid_on, payment_method,
    reference, notes, created_by
  ) values (
    p_request_id, p_workspace_id, p_invoice_id, v_invoice.total, current_date, 'PesePay balance',
    'WALLET-' || p_request_id::text,
    'Invoice ' || v_invoice.invoice_number || ' paid from PesePay balance', p_user_id
  );

  update public.invoices
  set status = 'paid', paid_at = now()
  where id = v_invoice.id;

  insert into public.workspace_pesepay_transactions (
    id, wallet_id, workspace_id, user_id, kind, amount, currency_code,
    status, description, related_id, completed_at
  ) values (
    p_request_id, v_wallet.id, p_workspace_id, p_user_id, 'invoice_payment', v_invoice.total, 'USD',
    'completed', 'Invoice ' || v_invoice.invoice_number || ' payment', p_invoice_id, now()
  );

  return query select p_request_id, v_balance;
end;
$$;


ALTER FUNCTION "public"."pay_workspace_invoice_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_invoice_id" "uuid", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_workspace_package_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_package_id" "text", "p_request_id" "uuid") RETURNS TABLE("purchase_id" "uuid", "remaining_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_package public.billing_packages%rowtype;
  v_wallet public.workspace_pesepay_wallets%rowtype;
  v_existing public.workspace_pesepay_transactions%rowtype;
  v_balance numeric(14, 2);
  v_related_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select role::text into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = p_user_id
    and status = 'active';
  if v_role is null or v_role not in ('owner', 'admin', 'finance') then
    raise exception 'Only workspace owners, admins, and finance managers can purchase packages';
  end if;

  select * into v_existing
  from public.workspace_pesepay_transactions
  where id = p_request_id
  for update;

  if found then
    if v_existing.workspace_id <> p_workspace_id
      or v_existing.user_id <> p_user_id
      or v_existing.package_id is distinct from p_package_id
      or v_existing.pesepay_reference is not null
      or v_existing.status <> 'completed' then
      raise exception 'Package payment request is not reusable';
    end if;
    select balance into v_balance
    from public.workspace_pesepay_wallets
    where workspace_id = p_workspace_id and user_id = p_user_id;
    return query select v_existing.related_id, v_balance;
    return;
  end if;

  select * into v_package
  from public.billing_packages
  where id = p_package_id and active;
  if not found then
    raise exception 'Unknown or inactive package';
  end if;

  select * into v_wallet
  from public.workspace_pesepay_wallets
  where workspace_id = p_workspace_id and user_id = p_user_id
  for update;
  if not found or v_wallet.balance < v_package.amount then
    raise exception 'Insufficient PesePay balance. Add funds or use PesePay checkout';
  end if;

  update public.workspace_pesepay_wallets
  set balance = balance - v_package.amount, updated_at = now()
  where id = v_wallet.id
  returning balance into v_balance;

  insert into public.workspace_pesepay_transactions (
    id, wallet_id, workspace_id, user_id, kind, amount, currency_code,
    status, description, package_id, credit_amount, storage_mb, duration_days,
    estimated_infrastructure_cost, estimated_payment_fee
  ) values (
    p_request_id, v_wallet.id, p_workspace_id, p_user_id,
    case when v_package.kind = 'ai_credits' then 'ai_credit_purchase' else 'storage_purchase' end,
    v_package.amount, v_package.currency_code, 'pending', v_package.label,
    v_package.id, v_package.credits, v_package.storage_mb, v_package.duration_days,
    v_package.estimated_infrastructure_cost, v_package.estimated_payment_fee
  );

  v_related_id := public.fulfil_workspace_package_purchase(p_request_id);
  return query select v_related_id, v_balance;
end;
$$;


ALTER FUNCTION "public"."pay_workspace_package_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_package_id" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_workspace_storage_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_plan_id" "text", "p_request_id" "uuid") RETURNS TABLE("purchase_id" "uuid", "remaining_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select * from public.pay_workspace_package_with_balance(
    p_workspace_id, p_user_id, p_plan_id, p_request_id
  );
end;
$$;


ALTER FUNCTION "public"."pay_workspace_storage_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_plan_id" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."price_satellite_survey"("p_categories" "text"[], "p_half_deg" numeric, "p_latitude" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_area_km2 numeric;
  v_area_ha numeric;
  v_total bigint := 0;
  v_line jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_category text;
  v_rate public.survey_credit_rates%rowtype;
  v_credits bigint;
  v_area_credits numeric;
begin
  if p_categories is null or array_length(p_categories, 1) is null then
    raise exception 'Choose at least one survey category.';
  end if;

  v_area_km2 := public.survey_surface_area_km2(p_half_deg, p_latitude);
  v_area_ha := v_area_km2 * 100;

  foreach v_category in array p_categories loop
    select * into v_rate
    from public.survey_credit_rates
    where category = v_category and active;
    if not found then
      raise exception 'Unknown survey category: %', v_category;
    end if;

    -- The marginal cost of the ground, before the floor is applied.
    v_area_credits := v_rate.per_hectare_credits * v_area_ha;
    v_credits := greatest(
      v_rate.minimum_credits,
      ceil(v_rate.base_credits + v_area_credits)::bigint
    );

    v_total := v_total + v_credits;

    v_line := jsonb_build_object(
      'category', v_rate.category,
      'label', v_rate.label,
      'base_credits', v_rate.base_credits,
      'area_credits', round(v_area_credits, 2),
      'credits', v_credits,
      'minimum_credits', v_rate.minimum_credits
    );
    v_rows := v_rows || jsonb_build_array(v_line);
  end loop;

  return jsonb_build_object(
    'credits', v_total,
    'surface_area_km2', v_area_km2,
    'surface_area_ha', round(v_area_ha, 1),
    'half_deg', p_half_deg,
    'latitude', p_latitude,
    'categories', p_categories,
    'lines', v_rows
  );
end;
$$;


ALTER FUNCTION "public"."price_satellite_survey"("p_categories" "text"[], "p_half_deg" numeric, "p_latitude" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."price_satellite_survey"("p_categories" "text"[], "p_half_deg" numeric, "p_latitude" numeric) IS 'The credit cost of a survey, priced from its survey types and the ground they cover. Readable by any signed-in member so the form can quote a job before it is queued.';



CREATE OR REPLACE FUNCTION "public"."project_cad_metrics"("p_project_id" "uuid") RETURNS TABLE("points" integer, "linework" integer, "surfaces" integer, "qa_flags" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    coalesce(jsonb_array_length(model -> 'points'), 0)::integer,
    coalesce(jsonb_array_length(model -> 'linework'), 0)::integer,
    coalesce(jsonb_array_length(model -> 'surfaces'), 0)::integer,
    (
      select count(*)::integer
      from jsonb_array_elements(coalesce(model -> 'points', '[]'::jsonb)) p
      where upper(coalesce(p ->> 'code', '')) like '%QA%'
         or upper(coalesce(p ->> 'code', '')) like '%CHECK%'
         or upper(coalesce(p ->> 'code', '')) like '%FLAG%'
         or upper(coalesce(p ->> 'code', '')) like '%REVIEW%'
    )
  from public.project_cad_drawings
  where project_id = project_cad_metrics.p_project_id;
$$;


ALTER FUNCTION "public"."project_cad_metrics"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_ai_credit_ledger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  raise exception 'AI credit ledger entries are immutable';
end;
$$;


ALTER FUNCTION "public"."protect_ai_credit_ledger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_file_anchor_chunks"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Anchor chunk records are immutable';
  end if;
  if exists (
    select 1 from public.file_anchor_operations op
    where op.id = old.operation_id
      and op.status in ('submitted', 'confirming', 'anchored')
  ) then
    raise exception 'Chunks covered by a Solana anchor cannot be removed';
  end if;
  return old;
end;
$$;


ALTER FUNCTION "public"."protect_file_anchor_chunks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_file_anchor_operations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('submitted', 'confirming', 'anchored') then
      raise exception 'An anchor record that reached Solana cannot be deleted';
    end if;
    return old;
  end if;

  if old.status in ('submitted', 'confirming', 'anchored')
    and new.status not in ('submitted', 'confirming', 'anchored', 'failed') then
    raise exception 'An anchor record that reached Solana cannot be reset';
  end if;
  if new.workspace_id is distinct from old.workspace_id
    or new.attachment_id is distinct from old.attachment_id
    or new.created_by is distinct from old.created_by then
    raise exception 'Anchor ownership cannot be reassigned';
  end if;
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_file_anchor_operations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_auth_nonces"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  delete from public.auth_nonces
   where expires_at < now() - interval '1 day';
$$;


ALTER FUNCTION "public"."prune_auth_nonces"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_survey_run"("p_run_id" "uuid", "p_result" "jsonb", "p_targets" "jsonb", "p_deliverables" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."publish_survey_run"("p_run_id" "uuid", "p_result" "jsonb", "p_targets" "jsonb", "p_deliverables" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_pesepay_transaction_refund"("p_transaction_id" "uuid", "p_reason" "text") RETURNS TABLE("status" "text", "credits_granted" bigint, "credits_reclaimed" bigint, "storage_mb_revoked" integer, "balance_reclaimed" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_transaction public.workspace_pesepay_transactions%rowtype;
  v_balance bigint;
  v_wallet_balance numeric;
  v_already bigint := 0;
  v_granted bigint := 0;
  v_reclaimed bigint := 0;
  v_revoked_mb integer := 0;
  v_balance_reclaimed numeric := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_platform_admin
  ) then
    raise exception 'Platform administrator access required';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A refund needs a written reason';
  end if;

  -- One lock per payment, so two administrators recording the same refund
  -- cannot both claw back the same credits.
  perform pg_advisory_xact_lock(hashtextextended('refund:' || p_transaction_id::text, 0));

  select * into v_transaction
  from public.workspace_pesepay_transactions
  where id = p_transaction_id
  for update;
  if not found then
    raise exception 'Transaction not found';
  end if;

  -- Repeating the call is a no-op, not a second claw-back.
  if v_transaction.status = 'refunded' then
    return query select
      v_transaction.status,
      coalesce(v_transaction.credit_amount, 0)::bigint,
      0::bigint,
      0,
      0::numeric;
    return;
  end if;
  if v_transaction.status <> 'completed' then
    raise exception 'Only a completed payment can be refunded (this one is %)',
      v_transaction.status;
  end if;

  if v_transaction.kind = 'ai_credit_purchase' then
    v_granted := coalesce(v_transaction.credit_amount, 0);

    insert into public.workspace_ai_credit_accounts (workspace_id)
    values (v_transaction.workspace_id)
    on conflict (workspace_id) do nothing;

    select balance into v_balance
    from public.workspace_ai_credit_accounts
    where workspace_id = v_transaction.workspace_id
    for update;

    -- An administrator may already have reversed this grant with the credit
    -- correction tool, so count what is already gone. Without that, the two
    -- correction paths could each take the same credits.
    select coalesce(sum(-t.credits_delta), 0)::bigint into v_already
    from public.workspace_ai_credit_transactions t
    where t.workspace_id = v_transaction.workspace_id
      and t.kind = 'reversal'
      and t.related_id = v_transaction.related_id
      and t.credits_delta < 0;

    v_reclaimed := least(
      greatest(v_granted - v_already, 0),
      greatest(coalesce(v_balance, 0), 0)
    );
    if v_reclaimed > 0 then
      update public.workspace_ai_credit_accounts
      set balance = balance - v_reclaimed, updated_at = now()
      where workspace_id = v_transaction.workspace_id
      returning balance into v_balance;

      insert into public.workspace_ai_credit_transactions (
        workspace_id, actor_user_id, kind, credits_delta, balance_after,
        operation_id, description, related_id
      ) values (
        v_transaction.workspace_id, auth.uid(), 'reversal', -v_reclaimed, v_balance,
        'refund:' || v_transaction.id::text,
        'Refund of ' || v_transaction.description,
        v_transaction.related_id
      );
    end if;
  end if;

  if v_transaction.kind = 'storage_purchase' then
    -- Ends the allocation window instead of deleting anything: the quota
    -- function counts purchases where expires_at > now(), so the bytes stay
    -- available and simply stop being paid for.
    update public.workspace_storage_purchases
    set expires_at = greatest(
      starts_at + interval '1 second',
      least(expires_at, now())
    )
    where id = v_transaction.related_id
      and workspace_id = v_transaction.workspace_id
      and not included_in_base_quota
      and starts_at <= now()
      and (expires_at is null or expires_at > now())
    returning storage_mb into v_revoked_mb;
  end if;

  if v_transaction.kind = 'deposit' then
    select balance into v_wallet_balance
    from public.workspace_pesepay_wallets
    where id = v_transaction.wallet_id
    for update;

    v_balance_reclaimed := least(coalesce(v_wallet_balance, 0), v_transaction.amount);
    if v_balance_reclaimed > 0 then
      update public.workspace_pesepay_wallets
      set balance = balance - v_balance_reclaimed, updated_at = now()
      where id = v_transaction.wallet_id;
    end if;
  end if;

  update public.workspace_pesepay_transactions
  set status = 'refunded',
      refunded_at = now(),
      refund_reason = trim(p_reason),
      refunded_by = auth.uid()
  where id = v_transaction.id;

  return query select
    'refunded'::text,
    v_granted,
    v_reclaimed,
    v_revoked_mb,
    v_balance_reclaimed;
end;
$$;


ALTER FUNCTION "public"."record_pesepay_transaction_refund"("p_transaction_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_pesepay_transaction_refund"("p_transaction_id" "uuid", "p_reason" "text") IS 'Record a refund settled with the provider and revoke what the payment granted. Platform administrators only; idempotent per payment.';



CREATE OR REPLACE FUNCTION "public"."refund_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_reason" "text") RETURNS TABLE("transaction_id" "uuid", "remaining_balance" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_usage public.workspace_ai_credit_transactions%rowtype;
  v_existing public.workspace_ai_credit_transactions%rowtype;
  v_balance bigint;
  v_transaction_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_operation_id, 0));

  select * into v_usage
  from public.workspace_ai_credit_transactions
  where workspace_id = p_workspace_id
    and kind = 'usage'
    and operation_id = p_operation_id
  for update;
  if not found then
    raise exception 'AI usage transaction not found';
  end if;
  if v_usage.actor_user_id is distinct from p_user_id then
    raise exception 'Not authorised to refund this AI operation';
  end if;

  select * into v_existing
  from public.workspace_ai_credit_transactions
  where workspace_id = p_workspace_id
    and kind = 'refund'
    and operation_id = p_operation_id;
  if found then
    select balance into v_balance
    from public.workspace_ai_credit_accounts
    where workspace_id = p_workspace_id;
    return query select v_existing.id, v_balance;
    return;
  end if;

  update public.workspace_ai_credit_accounts
  set balance = balance - v_usage.credits_delta, updated_at = now()
  where workspace_id = p_workspace_id
  returning balance into v_balance;

  insert into public.workspace_ai_credit_transactions (
    workspace_id, actor_user_id, kind, credits_delta, balance_after,
    operation_id, description, related_id
  ) values (
    p_workspace_id, p_user_id, 'refund', -v_usage.credits_delta, v_balance,
    p_operation_id, coalesce(nullif(p_reason, ''), 'AI operation failed'), v_usage.id
  ) returning id into v_transaction_id;

  return query select v_transaction_id, v_balance;
end;
$$;


ALTER FUNCTION "public"."refund_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remaining_signin_methods"("p_user_id" "uuid", "p_exclude_provider_id" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select (
    select count(*)::integer
      from auth.identities
     where user_id = p_user_id
       and (p_exclude_provider_id is null
            or not (provider = 'web3' and provider_id = p_exclude_provider_id))
  ) + (
    -- A password is a sign-in method in its own right: an account may hold an
    -- email identity without a password (or vice versa).
    select case
             when exists (
               select 1 from auth.users
                where id = p_user_id
                  and encrypted_password is not null
                  and length(encrypted_password) > 0
             )
             then 1 else 0
           end::integer
  );
$$;


ALTER FUNCTION "public"."remaining_signin_methods"("p_user_id" "uuid", "p_exclude_provider_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_workspace_ai_credits"("p_workspace_id" "uuid", "p_transaction_id" "uuid", "p_reason" "text") RETURNS TABLE("transaction_id" "uuid", "remaining_balance" bigint, "credits_reversed" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_original public.workspace_ai_credit_transactions%rowtype;
  v_existing public.workspace_ai_credit_transactions%rowtype;
  v_balance bigint;
  v_delta bigint;
  v_operation_id text;
  v_transaction_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_platform_admin
  ) then
    raise exception 'Platform administrator access required';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reversal needs a written reason';
  end if;

  v_operation_id := 'reverse:' || p_transaction_id::text;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || v_operation_id, 0));

  select * into v_original
  from public.workspace_ai_credit_transactions
  where id = p_transaction_id
    and workspace_id = p_workspace_id;
  if not found then
    raise exception 'AI credit entry not found in this workspace';
  end if;
  if v_original.kind not in ('purchase', 'usage', 'refund') then
    raise exception 'Only purchases, usage and refunds can be reversed';
  end if;
  -- Recording a provider refund already takes these credits back. Reversing the
  -- same purchase again would be a second claw-back of one grant.
  if v_original.kind = 'purchase' and exists (
    select 1 from public.workspace_pesepay_transactions t
    where t.id = v_original.related_id
      and t.status = 'refunded'
  ) then
    raise exception
      'That purchase was refunded; its credits were reclaimed when the refund was recorded';
  end if;

  -- Repeating a reversal is a no-op, not a second credit.
  select * into v_existing
  from public.workspace_ai_credit_transactions
  where workspace_id = p_workspace_id
    and kind = 'reversal'
    and operation_id = v_operation_id;
  if found then
    select balance into v_balance
    from public.workspace_ai_credit_accounts
    where workspace_id = p_workspace_id;
    return query select v_existing.id, v_balance, -v_existing.credits_delta;
    return;
  end if;

  insert into public.workspace_ai_credit_accounts (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  select balance into v_balance
  from public.workspace_ai_credit_accounts
  where workspace_id = p_workspace_id
  for update;

  v_delta := -v_original.credits_delta;
  if v_balance + v_delta < 0 then
    raise exception
      'Reversal would take the workspace below zero credits (% available)',
      v_balance;
  end if;

  update public.workspace_ai_credit_accounts
  set balance = balance + v_delta, updated_at = now()
  where workspace_id = p_workspace_id
  returning balance into v_balance;

  insert into public.workspace_ai_credit_transactions (
    workspace_id, actor_user_id, kind, credits_delta, balance_after,
    operation_id, description, related_id
  ) values (
    p_workspace_id, auth.uid(), 'reversal', v_delta, v_balance,
    v_operation_id, trim(p_reason), v_original.id
  ) returning id into v_transaction_id;

  return query select v_transaction_id, v_balance, abs(v_delta);
end;
$$;


ALTER FUNCTION "public"."reverse_workspace_ai_credits"("p_workspace_id" "uuid", "p_transaction_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reverse_workspace_ai_credits"("p_workspace_id" "uuid", "p_transaction_id" "uuid", "p_reason" "text") IS 'Append a reversing ledger entry for one AI credit entry. Platform administrators only; idempotent per reversed entry; never moves fiat money.';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_custom_solana_wallet_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_custom_solana_wallet_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_default_payment_method"("p_workspace_id" "uuid", "p_method_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    public.has_workspace_role(p_workspace_id, array['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])
    or public.is_platform_admin()
  ) then
    raise exception 'Insufficient permissions to set default payment method.';
  end if;

  update public.payment_methods
  set is_default = false, updated_at = now()
  where workspace_id = p_workspace_id
    and is_default = true;

  update public.payment_methods
  set is_default = true, updated_at = now()
  where id = p_method_id
    and workspace_id = p_workspace_id;
end;
$$;


ALTER FUNCTION "public"."set_default_payment_method"("p_workspace_id" "uuid", "p_method_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_default_workspace"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'You are not a member of this workspace.';
  end if;

  update public.profiles
  set default_workspace_id = target_workspace_id,
      updated_at = now()
  where id = v_user_id;

  return true;
end;
$$;


ALTER FUNCTION "public"."set_default_workspace"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_workspace_package_purchase"("p_reference" "text", "p_amount" numeric, "p_currency_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_transaction public.workspace_pesepay_transactions%rowtype;
begin
  select * into v_transaction
  from public.workspace_pesepay_transactions
  where pesepay_reference = p_reference
    and kind in ('ai_credit_purchase', 'storage_purchase')
  for update;

  if not found then
    raise exception 'Package purchase not found';
  end if;
  if p_amount is null
    or p_currency_code is null
    or abs(v_transaction.amount - p_amount) > 0.01
    or v_transaction.currency_code <> p_currency_code then
    raise exception 'Pesepay amount or currency does not match the package purchase';
  end if;

  return public.fulfil_workspace_package_purchase(v_transaction.id);
end;
$$;


ALTER FUNCTION "public"."settle_workspace_package_purchase"("p_reference" "text", "p_amount" numeric, "p_currency_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_workspace_pesepay_deposit"("p_reference" "text", "p_amount" numeric, "p_currency_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_transaction public.workspace_pesepay_transactions%rowtype;
begin
  select * into v_transaction
  from public.workspace_pesepay_transactions
  where pesepay_reference = p_reference
    and kind = 'deposit'
  for update;

  if not found then
    raise exception 'Wallet deposit not found';
  end if;

  if p_amount is null
    or p_currency_code is null
    or abs(v_transaction.amount - p_amount) > 0.01
    or v_transaction.currency_code <> p_currency_code then
    raise exception 'Pesepay amount or currency does not match the wallet deposit';
  end if;

  if v_transaction.status = 'completed' then
    return;
  end if;

  update public.workspace_pesepay_wallets
  set balance = balance + v_transaction.amount,
      updated_at = now()
  where id = v_transaction.wallet_id;

  if not found then
    raise exception 'Wallet not found for deposit';
  end if;

  update public.workspace_pesepay_transactions
  set status = 'completed', completed_at = now()
  where id = v_transaction.id;
end;
$$;


ALTER FUNCTION "public"."settle_workspace_pesepay_deposit"("p_reference" "text", "p_amount" numeric, "p_currency_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shares_workspace_with_profile"("target_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs
      on theirs.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = target_profile_id
      and theirs.status = 'active'
  );
$$;


ALTER FUNCTION "public"."shares_workspace_with_profile"("target_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slugify"("value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select nullif(
    trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;


ALTER FUNCTION "public"."slugify"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."spend_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_operation" "text", "p_description" "text") RETURNS TABLE("transaction_id" "uuid", "remaining_balance" bigint, "credits_charged" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select * from public.spend_workspace_ai_credits(
    p_workspace_id, p_user_id, p_operation_id, p_operation, p_description, null
  );
end;
$$;


ALTER FUNCTION "public"."spend_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_operation" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."spend_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_operation" "text", "p_description" "text", "p_credits" bigint) RETURNS TABLE("transaction_id" "uuid", "remaining_balance" bigint, "credits_charged" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rate public.billing_operation_rates%rowtype;
  v_balance bigint;
  v_existing public.workspace_ai_credit_transactions%rowtype;
  v_transaction_id uuid;
  v_amount bigint;
begin
  if p_operation_id is null or length(p_operation_id) > 160 then
    raise exception 'A valid AI operation ID is required';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'Not authorised to spend workspace AI credits';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_operation_id, 0));

  select * into v_existing
  from public.workspace_ai_credit_transactions
  where workspace_id = p_workspace_id
    and kind = 'usage'
    and operation_id = p_operation_id;

  if found then
    if v_existing.actor_user_id is distinct from p_user_id then
      raise exception 'AI operation ID is not reusable by another user';
    end if;
    select balance into v_balance
    from public.workspace_ai_credit_accounts
    where workspace_id = p_workspace_id;
    return query select v_existing.id, v_balance, -v_existing.credits_delta;
    return;
  end if;

  select * into v_rate
  from public.billing_operation_rates
  where operation = p_operation and active;
  if not found then
    raise exception 'AI operation is not configured for billing';
  end if;

  v_amount := coalesce(p_credits, v_rate.credits);
  if v_amount is null or v_amount <= 0 then
    raise exception 'AI operation is not configured for billing';
  end if;

  insert into public.workspace_ai_credit_accounts (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  select balance into v_balance
  from public.workspace_ai_credit_accounts
  where workspace_id = p_workspace_id
  for update;
  if v_balance < v_amount then
    raise exception using errcode = 'P0002', message = 'INSUFFICIENT_AI_CREDITS';
  end if;

  update public.workspace_ai_credit_accounts
  set balance = balance - v_amount, updated_at = now()
  where workspace_id = p_workspace_id
  returning balance into v_balance;

  insert into public.workspace_ai_credit_transactions (
    workspace_id, actor_user_id, kind, credits_delta, balance_after,
    operation_id, description
  ) values (
    p_workspace_id, p_user_id, 'usage', -v_amount, v_balance,
    p_operation_id, coalesce(nullif(p_description, ''), p_operation)
  ) returning id into v_transaction_id;

  return query select v_transaction_id, v_balance, v_amount;
end;
$$;


ALTER FUNCTION "public"."spend_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_operation" "text", "p_description" "text", "p_credits" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."survey_surface_area_km2"("p_half_deg" numeric, "p_latitude" numeric) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_half numeric;
  v_lat numeric;
  v_width_m numeric;
  v_height_m numeric;
begin
  v_half := coalesce(p_half_deg, 0);
  v_lat := coalesce(p_latitude, 0);

  if v_half <= 0 or v_half > 0.5 then
    raise exception 'The study area must be between 0 and 0.5 degrees each way.';
  end if;
  if v_lat < -90 or v_lat > 90 then
    raise exception 'Latitude must be a number between -90 and 90.';
  end if;

  -- The mean metres in a degree of longitude at this latitude, and the mean metres in
  -- a degree of latitude. Both are the same spherical constants the engine's own
  -- extent labels are built from.
  v_width_m := 2 * v_half * 111320 * cos(radians(v_lat));
  v_height_m := 2 * v_half * 110574;

  return round((v_width_m * v_height_m) / 1000000, 3);
end;
$$;


ALTER FUNCTION "public"."survey_surface_area_km2"("p_half_deg" numeric, "p_latitude" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."survey_surface_area_km2"("p_half_deg" numeric, "p_latitude" numeric) IS 'Ground area of a survey bounding box in km2, measured the way the engine measures it: a half-degree box each way, in metres, at the latitude of the target.';



CREATE OR REPLACE FUNCTION "public"."touch_project_cad_drawings"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_project_cad_drawings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_advance_booking"("p_booking_id" "uuid", "p_to_status" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.transport_bookings;
  v_allowed boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can move a booking';
  end if;
  if p_to_status not in ('picked_up', 'in_transit', 'at_hub', 'out_for_delivery',
                         'delivered', 'exception', 'failed') then
    raise exception 'That is not a state a booking can be moved to';
  end if;

  select * into v_booking from public.transport_bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;

  v_allowed := case
    when v_booking.status = 'confirmed'
      then p_to_status in ('picked_up', 'exception', 'failed')
    when v_booking.status = 'pending_load_check'
      then p_to_status in ('exception', 'failed')
    when v_booking.status = 'picked_up'
      then p_to_status in ('in_transit', 'at_hub', 'exception')
    when v_booking.status = 'in_transit'
      then p_to_status in ('at_hub', 'exception')
    when v_booking.status = 'at_hub'
      then p_to_status in ('out_for_delivery', 'delivered', 'exception')
    when v_booking.status = 'out_for_delivery'
      then p_to_status in ('delivered', 'exception', 'failed')
    when v_booking.status = 'exception'
      then p_to_status in ('in_transit', 'at_hub', 'delivered', 'failed')
    else false
  end;
  if not v_allowed then
    raise exception 'A % booking cannot move to %', v_booking.status, p_to_status;
  end if;

  update public.transport_bookings
     set status = p_to_status,
         collected_at = coalesce(collected_at,
           case when p_to_status = 'picked_up' then now() end),
         delivered_at = coalesce(delivered_at,
           case when p_to_status = 'delivered' then now() end),
         updated_at = now()
   where id = p_booking_id;

  insert into public.transport_booking_events
    (booking_id, from_status, to_status, actor_kind, actor_id, note)
  values
    (p_booking_id, v_booking.status, p_to_status, 'platform', auth.uid(), p_note);
end;
$$;


ALTER FUNCTION "public"."transport_advance_booking"("p_booking_id" "uuid", "p_to_status" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_advance_departure"("p_departure_id" "uuid", "p_to_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v public.transport_departures;
  v_pending integer;
  v_unverified integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can move a run';
  end if;

  select * into v from public.transport_departures where id = p_departure_id for update;
  if not found then
    raise exception 'That run does not exist';
  end if;

  -- Parenthesised rather than a CASE: plpgsql ends an IF condition at the first
  -- THEN it sees, and a CASE's own THENs land inside that expression.
  if not (
        v.status in ('open', 'quorum_met', 'overdue')
        and p_to_status in ('quorum_met', 'rolling', 'cancelled')
     or v.status = 'rolling'        and p_to_status = 'in_transit'
     or v.status = 'in_transit'     and p_to_status in ('at_destination', 'closed')
     or v.status = 'at_destination' and p_to_status = 'closed'
  ) then
    raise exception 'A % run cannot move to %', v.status, p_to_status;
  end if;

  -- The whole reason the fee comes first: nothing rides unless it has been paid
  -- for, and bulk unless a person has checked it fits.
  if p_to_status = 'rolling' then
    select count(*) into v_pending from public.transport_bookings
     where departure_id = p_departure_id
       and status in ('pending_payment', 'pending_load_check');
    if v_pending > 0 then
      raise exception '% booking(s) still need a confirmed fee or a load check before this run can roll',
        v_pending;
    end if;

    select count(*) into v_unverified
      from public.transport_vehicles ve
     where ve.id = v.vehicle_id and ve.verification_status <> 'verified';
    if v.vehicle_id is not null and v_unverified > 0 then
      raise exception 'That run is assigned to a vehicle that is not verified';
    end if;
  end if;

  update public.transport_departures
     set status = p_to_status,
         departed_at = case when p_to_status = 'in_transit' and departed_at is null
                            then now() else departed_at end,
         arrived_at = case when p_to_status = 'at_destination' then now() else arrived_at end,
         updated_at = now()
   where id = p_departure_id;
end;
$$;


ALTER FUNCTION "public"."transport_advance_departure"("p_departure_id" "uuid", "p_to_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_apply_quorum"("p_departure_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v public.transport_departures;
  v_ratio numeric;
begin
  select * into v from public.transport_departures where id = p_departure_id;
  if not found or v.status not in ('open', 'quorum_met') then
    return;
  end if;

  v_ratio := public.transport_load_ratio(v);

  if v.status = 'open' and v_ratio >= v.target_load_ratio then
    update public.transport_departures set status = 'quorum_met', updated_at = now()
     where id = p_departure_id;
  elsif now() >= v.backstop_at then
    update public.transport_departures
       set status = case when v.booked_slots = 0 and v.booked_kg = 0
                         then 'expired' else 'overdue' end,
           updated_at = now()
     where id = p_departure_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."transport_apply_quorum"("p_departure_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_approve_load"("p_booking_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can approve a load';
  end if;

  select status into v_status from public.transport_bookings where id = p_booking_id for update;
  if v_status is null then
    raise exception 'Booking not found';
  end if;
  if v_status <> 'pending_load_check' then
    raise exception 'That booking is not waiting on a load check';
  end if;

  update public.transport_bookings
     set status = 'confirmed', updated_at = now()
   where id = p_booking_id;

  insert into public.transport_booking_events
    (booking_id, from_status, to_status, actor_kind, actor_id, note)
  values
    (p_booking_id, v_status, 'confirmed', 'platform', auth.uid(),
     coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Load checked and accepted'));
end;
$$;


ALTER FUNCTION "public"."transport_approve_load"("p_booking_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_cancel_booking"("p_booking_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.transport_bookings;
  v_cutoff timestamptz;
  v_is_admin boolean;
begin
  select b.* into v_booking from public.transport_bookings b where b.id = p_booking_id
    for update;
  if not found then
    raise exception 'Booking not found';
  end if;

  select booking_cutoff_at into v_cutoff
    from public.transport_departures where id = v_booking.departure_id;

  v_is_admin := public.is_platform_admin();
  if not v_is_admin and not public.is_workspace_member(v_booking.workspace_id) then
    raise exception 'You cannot cancel that booking';
  end if;
  if v_booking.status not in ('pending_payment', 'pending_load_check', 'confirmed') then
    raise exception 'A % booking cannot be cancelled', v_booking.status;
  end if;
  -- A customer may back out until the run closes for booking; after that the
  -- capacity is committed to whoever else is on board.
  if not v_is_admin and now() >= v_cutoff then
    raise exception 'Bookings cannot be cancelled once that run has closed for booking';
  end if;

  perform public.transport_release_capacity(p_booking_id);

  update public.transport_bookings
     set status = 'cancelled',
         cancel_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), cancel_reason),
         fee_status = case when fee_status = 'paid' then 'refunded' else fee_status end,
         updated_at = now()
   where id = p_booking_id;

  insert into public.transport_booking_events
    (booking_id, from_status, to_status, actor_kind, actor_id, note)
  values
    (p_booking_id, v_booking.status, 'cancelled',
     case when v_is_admin then 'platform' else 'customer' end, auth.uid(),
     coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Cancelled')
       || case when v_booking.fee_status = 'paid'
               then ' · fee refund due' else '' end);
end;
$$;


ALTER FUNCTION "public"."transport_cancel_booking"("p_booking_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_cancel_departure"("p_departure_id" "uuid", "p_reason" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can cancel a run';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A cancelled run needs a stated reason';
  end if;

  update public.transport_bookings
     set status = 'cancelled',
         cancel_reason = p_reason,
         fee_status = case when fee_status = 'paid' then 'refunded' else fee_status end,
         updated_at = now()
   where departure_id = p_departure_id
     and status in ('pending_payment', 'pending_load_check', 'confirmed');
  get diagnostics v_count = row_count;

  update public.transport_departures
     set status = 'cancelled',
         cancel_reason = p_reason,
         booked_slots = 0,
         booked_kg = 0,
         updated_at = now()
   where id = p_departure_id;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."transport_cancel_departure"("p_departure_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_confirm_fee"("p_booking_id" "uuid", "p_provider" "text", "p_reference" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status text;
  v_new_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can confirm a fee';
  end if;
  if p_provider not in ('solana', 'pesepay') then
    raise exception 'Unknown payment provider';
  end if;

  select status into v_status from public.transport_bookings where id = p_booking_id for update;
  if v_status is null then
    raise exception 'Booking not found';
  end if;
  if v_status <> 'pending_payment' then
    raise exception 'That booking is already %', v_status;
  end if;

  v_new_status := case
    when (select mode from public.transport_bookings where id = p_booking_id) = 'parcel'
      then 'confirmed'
    else 'pending_load_check'
  end;

  update public.transport_bookings
     set fee_status = 'paid',
         payment_provider = p_provider,
         payment_reference = p_reference,
         status = v_new_status,
         updated_at = now()
   where id = p_booking_id;

  insert into public.transport_booking_events
    (booking_id, from_status, to_status, actor_kind, actor_id, note)
  values
    (p_booking_id, v_status, v_new_status, 'platform', auth.uid(),
     'Fee confirmed via ' || p_provider
       || case when p_reference is null then '' else ' · ' || p_reference end);
end;
$$;


ALTER FUNCTION "public"."transport_confirm_fee"("p_booking_id" "uuid", "p_provider" "text", "p_reference" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."transport_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tracking_code" "text" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "departure_id" "uuid" NOT NULL,
    "listing_id" "uuid",
    "order_id" "uuid",
    "mode" "text" DEFAULT 'parcel'::"text" NOT NULL,
    "slots" integer DEFAULT 1 NOT NULL,
    "weight_kg" numeric(12,2) DEFAULT 0 NOT NULL,
    "contents" "text" NOT NULL,
    "pickup_city_id" "uuid" NOT NULL,
    "dropoff_city_id" "uuid" NOT NULL,
    "recipient_name" "text" NOT NULL,
    "recipient_phone" "text",
    "fulfilment" "text" DEFAULT 'hub_collection'::"text" NOT NULL,
    "fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "fee_status" "text" DEFAULT 'pending_payment'::"text" NOT NULL,
    "payment_provider" "text",
    "payment_reference" "text",
    "status" "text" DEFAULT 'pending_payment'::"text" NOT NULL,
    "cancel_reason" "text",
    "capacity_released_at" timestamp with time zone,
    "collected_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "proof_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transport_bookings_check" CHECK (("pickup_city_id" <> "dropoff_city_id")),
    CONSTRAINT "transport_bookings_check1" CHECK ((("slots" > 0) OR ("weight_kg" > (0)::numeric))),
    CONSTRAINT "transport_bookings_fee_check" CHECK (("fee" >= (0)::numeric)),
    CONSTRAINT "transport_bookings_fee_status_check" CHECK (("fee_status" = ANY (ARRAY['pending_payment'::"text", 'paid'::"text", 'refunded'::"text", 'waived'::"text", 'failed'::"text"]))),
    CONSTRAINT "transport_bookings_fulfilment_check" CHECK (("fulfilment" = ANY (ARRAY['hub_collection'::"text", 'final_mile'::"text"]))),
    CONSTRAINT "transport_bookings_mode_check" CHECK (("mode" = ANY (ARRAY['parcel'::"text", 'bulk_share'::"text", 'charter'::"text"]))),
    CONSTRAINT "transport_bookings_payment_provider_check" CHECK ((("payment_provider" IS NULL) OR ("payment_provider" = ANY (ARRAY['solana'::"text", 'pesepay'::"text"])))),
    CONSTRAINT "transport_bookings_slots_check" CHECK (("slots" >= 0)),
    CONSTRAINT "transport_bookings_status_check" CHECK (("status" = ANY (ARRAY['pending_payment'::"text", 'pending_load_check'::"text", 'confirmed'::"text", 'picked_up'::"text", 'in_transit'::"text", 'at_hub'::"text", 'out_for_delivery'::"text", 'delivered'::"text", 'exception'::"text", 'failed'::"text", 'cancelled'::"text", 'expired'::"text"]))),
    CONSTRAINT "transport_bookings_weight_kg_check" CHECK (("weight_kg" >= (0)::numeric))
);


ALTER TABLE "public"."transport_bookings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_create_booking"("p_workspace_id" "uuid", "p_departure_id" "uuid", "p_mode" "text", "p_slots" integer, "p_weight_kg" numeric, "p_contents" "text", "p_pickup_city_id" "uuid", "p_dropoff_city_id" "uuid", "p_recipient_name" "text", "p_fulfilment" "text" DEFAULT 'hub_collection'::"text", "p_recipient_phone" "text" DEFAULT NULL::"text", "p_listing_id" "uuid" DEFAULT NULL::"uuid", "p_order_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."transport_bookings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_departure public.transport_departures;
  v_route public.transport_routes;
  v_slots integer := coalesce(p_slots, 0);
  v_weight numeric := coalesce(p_weight_kg, 0);
  v_fee numeric(12, 2);
  v_pickup_seq integer;
  v_dropoff_seq integer;
  v_booking public.transport_bookings;
begin
  if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'You are not a member of that workspace';
  end if;
  if p_mode not in ('parcel', 'bulk_share', 'charter') then
    raise exception 'Unknown booking mode';
  end if;
  if p_fulfilment not in ('hub_collection', 'final_mile') then
    raise exception 'Unknown fulfilment option';
  end if;
  if btrim(coalesce(p_contents, '')) = '' or btrim(coalesce(p_recipient_name, '')) = '' then
    raise exception 'Contents and recipient name are required';
  end if;

  select * into v_departure from public.transport_departures where id = p_departure_id
    for update;
  if not found then
    raise exception 'That run does not exist';
  end if;
  if v_departure.is_sample then
    raise exception 'That run is part of the specimen network and is not open for booking';
  end if;

  perform public.transport_apply_quorum(v_departure.id);
  select * into v_departure from public.transport_departures where id = p_departure_id;

  if v_departure.status not in ('open', 'quorum_met') then
    raise exception 'That run is not accepting bookings (it is %)', v_departure.status;
  end if;
  if now() > v_departure.booking_cutoff_at then
    raise exception 'Bookings on that run closed at %', v_departure.booking_cutoff_at;
  end if;

  select * into v_route from public.transport_routes where id = v_departure.route_id;
  if v_route.status <> 'published' then
    raise exception 'That corridor is not open for transport';
  end if;

  v_pickup_seq := public.transport_stop_sequence(v_route.id, p_pickup_city_id);
  v_dropoff_seq := public.transport_stop_sequence(v_route.id, p_dropoff_city_id);
  if v_pickup_seq is null or v_dropoff_seq is null then
    raise exception 'That run does not pass through both of those cities';
  end if;
  if v_pickup_seq >= v_dropoff_seq then
    raise exception 'The drop-off city has to come after the pick-up city on this corridor';
  end if;

  if p_mode = 'charter' then
    -- Buying the vehicle buys every unit on it. Both dimensions are priced out
    -- and the larger wins, which is the same grammar the pooled rate below uses
    -- and the only way a tipper — six load beds, fifteen tonnes — comes out at
    -- its real value instead of six slots' worth.
    v_slots := v_departure.capacity_slots;
    v_weight := v_departure.capacity_kg;
    v_fee := round(
      greatest(
        v_route.fare_per_slot * v_departure.capacity_slots,
        v_route.fare_per_kg * v_departure.capacity_kg
      ), 2
    );
  else
    if v_slots <= 0 and v_weight <= 0 then
      raise exception 'Say how much space you need';
    end if;
    v_fee := round(
      greatest(v_slots * v_route.fare_per_slot, v_weight * v_route.fare_per_kg)
        + case when p_fulfilment = 'final_mile' then v_route.fare_final_mile else 0 end,
      2
    );
  end if;

  if v_slots > v_departure.capacity_slots - v_departure.booked_slots then
    raise exception 'Only % of % slots left on this run',
      greatest(0, v_departure.capacity_slots - v_departure.booked_slots),
      v_departure.capacity_slots;
  end if;
  if v_weight > v_departure.capacity_kg - v_departure.booked_kg then
    raise exception 'Only % kg left on this run',
      greatest(0, round(v_departure.capacity_kg - v_departure.booked_kg, 2));
  end if;

  insert into public.transport_bookings (
    tracking_code, workspace_id, departure_id, listing_id, order_id, mode,
    slots, weight_kg, contents, pickup_city_id, dropoff_city_id,
    recipient_name, recipient_phone, fulfilment, fee, currency,
    fee_status, status
  ) values (
    public.transport_new_tracking_code(), p_workspace_id, p_departure_id,
    p_listing_id, p_order_id, p_mode, v_slots, v_weight,
    btrim(p_contents), p_pickup_city_id, p_dropoff_city_id,
    btrim(p_recipient_name), p_recipient_phone, p_fulfilment, v_fee,
    v_route.currency, 'pending_payment', 'pending_payment'
  ) returning * into v_booking;

  update public.transport_departures
     set booked_slots = booked_slots + v_booking.slots,
         booked_kg = booked_kg + v_booking.weight_kg,
         updated_at = now()
   where id = v_departure.id;

  insert into public.transport_booking_events
    (booking_id, from_status, to_status, actor_kind, actor_id, note)
  values
    (v_booking.id, null, v_booking.status, 'customer', auth.uid(),
     'Held ' || v_booking.slots || ' slot(s) and ' || v_booking.weight_kg
       || ' kg on run ' || v_route.code);

  perform public.transport_apply_quorum(v_departure.id);

  return v_booking;
end;
$$;


ALTER FUNCTION "public"."transport_create_booking"("p_workspace_id" "uuid", "p_departure_id" "uuid", "p_mode" "text", "p_slots" integer, "p_weight_kg" numeric, "p_contents" "text", "p_pickup_city_id" "uuid", "p_dropoff_city_id" "uuid", "p_recipient_name" "text", "p_fulfilment" "text", "p_recipient_phone" "text", "p_listing_id" "uuid", "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_direct_distance_km"("p_lat_a" numeric, "p_lng_a" numeric, "p_lat_b" numeric, "p_lng_b" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select round(
    (2 * 6371 * asin(
      least(1.0::double precision, sqrt(
        power(sin(radians((p_lat_b - p_lat_a) / 2)), 2)
        + cos(radians(p_lat_a)) * cos(radians(p_lat_b))
          * power(sin(radians((p_lng_b - p_lng_a) / 2)), 2)
      ))
    ))::numeric, 2
  );
$$;


ALTER FUNCTION "public"."transport_direct_distance_km"("p_lat_a" numeric, "p_lng_a" numeric, "p_lat_b" numeric, "p_lng_b" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_evaluate_departures"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_expired integer := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can evaluate departures';
  end if;

  -- The selection is materialised so the release and the marking below both act
  -- on exactly the same set of rows.
  with stale as materialized (
    select b.id, b.departure_id, b.slots, b.weight_kg
      from public.transport_bookings b
      join public.transport_departures d on d.id = b.departure_id
     where b.status = 'pending_payment'
       and b.capacity_released_at is null
       and now() > d.booking_cutoff_at
  ),
  freed as (
    update public.transport_departures d
       set booked_slots = greatest(0, d.booked_slots - s.total_slots),
           booked_kg = greatest(0, d.booked_kg - s.total_weight)
      from (
        select departure_id,
               sum(slots)::integer as total_slots,
               sum(weight_kg)::numeric as total_weight
          from stale
         group by departure_id
      ) s
     where s.departure_id = d.id
  )
  update public.transport_bookings b
     set status = 'expired',
         capacity_released_at = now(),
         updated_at = now()
    from stale s
   where b.id = s.id;
  get diagnostics v_expired = row_count;

  update public.transport_departures d
     set status = case
           when d.status = 'open'
                and public.transport_load_ratio(d) >= d.target_load_ratio
             then 'quorum_met'
           when now() >= d.backstop_at and d.booked_slots = 0 and d.booked_kg = 0
             then 'expired'
           when d.status = 'open' and now() >= d.backstop_at
             then 'overdue'
           else d.status
         end,
         updated_at = now()
   where d.status in ('open', 'quorum_met');

  return v_expired;
end;
$$;


ALTER FUNCTION "public"."transport_evaluate_departures"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transport_departures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "vehicle_class_id" "uuid",
    "planned_departure_at" timestamp with time zone NOT NULL,
    "booking_cutoff_at" timestamp with time zone NOT NULL,
    "backstop_at" timestamp with time zone NOT NULL,
    "target_load_ratio" numeric(4,3) DEFAULT 0.600 NOT NULL,
    "capacity_slots" integer NOT NULL,
    "capacity_kg" numeric(12,2) NOT NULL,
    "booked_slots" integer DEFAULT 0 NOT NULL,
    "booked_kg" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "departed_at" timestamp with time zone,
    "arrived_at" timestamp with time zone,
    "cancel_reason" "text",
    "private_booking_id" "uuid",
    "is_sample" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transport_departures_booked_kg_check" CHECK (("booked_kg" >= (0)::numeric)),
    CONSTRAINT "transport_departures_booked_slots_check" CHECK (("booked_slots" >= 0)),
    CONSTRAINT "transport_departures_capacity_kg_check" CHECK (("capacity_kg" > (0)::numeric)),
    CONSTRAINT "transport_departures_capacity_slots_check" CHECK (("capacity_slots" > 0)),
    CONSTRAINT "transport_departures_check" CHECK (("booked_slots" <= "capacity_slots")),
    CONSTRAINT "transport_departures_check1" CHECK (("booked_kg" <= "capacity_kg")),
    CONSTRAINT "transport_departures_check2" CHECK (("booking_cutoff_at" <= "planned_departure_at")),
    CONSTRAINT "transport_departures_check3" CHECK (("booking_cutoff_at" < "backstop_at")),
    CONSTRAINT "transport_departures_route_cutoff" CHECK (("planned_departure_at" <= "backstop_at")),
    CONSTRAINT "transport_departures_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'quorum_met'::"text", 'overdue'::"text", 'rolling'::"text", 'in_transit'::"text", 'at_destination'::"text", 'closed'::"text", 'cancelled'::"text", 'expired'::"text"]))),
    CONSTRAINT "transport_departures_target_load_ratio_check" CHECK ((("target_load_ratio" >= 0.05) AND ("target_load_ratio" <= 1.000)))
);


ALTER TABLE "public"."transport_departures" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_governing_dimension"("p_departure" "public"."transport_departures") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when p_departure.booked_slots::numeric / p_departure.capacity_slots::numeric
       >= p_departure.booked_kg::numeric / p_departure.capacity_kg::numeric
      then 'slots'
    else 'weight'
  end;
$$;


ALTER FUNCTION "public"."transport_governing_dimension"("p_departure" "public"."transport_departures") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_load_ratio"("p_departure" "public"."transport_departures") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select greatest(
    p_departure.booked_slots::numeric / p_departure.capacity_slots::numeric,
    p_departure.booked_kg::numeric / p_departure.capacity_kg::numeric
  );
$$;


ALTER FUNCTION "public"."transport_load_ratio"("p_departure" "public"."transport_departures") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_new_tracking_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  candidate text;
begin
  loop
    candidate := 'SS-' || upper(encode(gen_random_bytes(4), 'hex'));
    exit when not exists (
      select 1 from public.transport_bookings where tracking_code = candidate
    );
  end loop;
  return candidate;
end;
$$;


ALTER FUNCTION "public"."transport_new_tracking_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_offers_for_city"("p_destination_city_id" "uuid") RETURNS TABLE("departure_id" "uuid", "route_id" "uuid", "route_code" "text", "route_name" "text", "origin_city_id" "uuid", "origin_city" "text", "destination_city" "text", "fare_per_slot" numeric, "fare_per_kg" numeric, "currency" "text", "free_slots" integer, "free_kg" numeric, "load_percent" numeric, "target_percent" numeric, "status" "text", "planned_departure_at" timestamp with time zone, "booking_cutoff_at" timestamp with time zone, "is_sample" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select
    d.id,
    r.id,
    r.code,
    r.name,
    c_origin.id,
    c_origin.name,
    c_destination.name,
    r.fare_per_slot,
    r.fare_per_kg,
    r.currency,
    (d.capacity_slots - d.booked_slots),
    round(d.capacity_kg - d.booked_kg, 2),
    round(public.transport_load_ratio(d) * 100, 1),
    round(d.target_load_ratio * 100, 1),
    d.status,
    d.planned_departure_at,
    d.booking_cutoff_at,
    d.is_sample
  from public.transport_departures d
  join public.transport_routes r on r.id = d.route_id
  join public.transport_cities c_origin on c_origin.id = r.origin_city_id
  join public.transport_cities c_destination on c_destination.id = p_destination_city_id
  join public.transport_route_stops s_dest
    on s_dest.route_id = r.id and s_dest.city_id = p_destination_city_id
  where r.status = 'published'
    and d.status in ('open', 'quorum_met')
    and now() < d.booking_cutoff_at
    and exists (
      select 1 from public.transport_route_stops s_origin
       where s_origin.route_id = r.id
         and s_origin.city_id = r.origin_city_id
         and s_origin.sequence < s_dest.sequence
    )
  order by d.planned_departure_at;
end;
$$;


ALTER FUNCTION "public"."transport_offers_for_city"("p_destination_city_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_record_checkpoint"("p_departure_id" "uuid", "p_city_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_city public.transport_cities;
  v_next integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can report a checkpoint';
  end if;

  select * into v_city from public.transport_cities where id = p_city_id;
  if not found then
    raise exception 'That city is not on the network';
  end if;

  select coalesce(max(sequence), 0) + 1 into v_next
    from public.transport_checkpoints where departure_id = p_departure_id;

  insert into public.transport_checkpoints
    (departure_id, city_id, latitude, longitude, sequence, reported_by, note)
  values
    (p_departure_id, p_city_id, v_city.latitude, v_city.longitude, v_next,
     auth.uid(), nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;


ALTER FUNCTION "public"."transport_record_checkpoint"("p_departure_id" "uuid", "p_city_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_release_capacity"("p_booking_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.transport_departures d
     set booked_slots = greatest(0, d.booked_slots - b.slots),
         booked_kg = greatest(0, d.booked_kg - b.weight_kg)
    from public.transport_bookings b
   where b.id = p_booking_id
     and b.departure_id = d.id
     and b.capacity_released_at is null;

  update public.transport_bookings
     set capacity_released_at = now()
   where id = p_booking_id
     and capacity_released_at is null
     and exists (
       select 1 from public.transport_departures d
       where d.id = transport_bookings.departure_id
     );
end;
$$;


ALTER FUNCTION "public"."transport_release_capacity"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transport_stop_sequence"("p_route_id" "uuid", "p_city_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  select min(sequence)
  from public.transport_route_stops
  where route_id = p_route_id and city_id = p_city_id;
$$;


ALTER FUNCTION "public"."transport_stop_sequence"("p_route_id" "uuid", "p_city_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unlink_email_signin"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_remaining integer;
begin
  select public.remaining_signin_methods(p_user_id, null) -
         (select case
                   when exists (
                     select 1 from auth.identities
                      where user_id = p_user_id and provider = 'email'
                   ) then 1 else 0
                 end::integer) -
         (select case
                   when exists (
                     select 1 from auth.users
                      where id = p_user_id
                        and encrypted_password is not null
                        and length(encrypted_password) > 0
                   ) then 1 else 0
                 end::integer)
    into v_remaining;

  -- `remaining_signin_methods` counts identities + password; subtract the two
  -- email-owned pieces to learn what would be left without them.
  if v_remaining < 1 then
    raise exception 'LAST_SIGN_IN_METHOD' using errcode = 'P0001';
  end if;

  delete from auth.identities
   where user_id = p_user_id and provider = 'email';

  update auth.users
     set encrypted_password = '',
         updated_at = now()
   where id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."unlink_email_signin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unlink_web3_identity"("p_user_id" "uuid", "p_chain" "text", "p_address" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_provider_id text;
  v_normalized  text;
  v_remaining   integer;
begin
  if p_chain = 'ethereum' then
    v_normalized := lower(p_address);
  else
    v_normalized := p_address;
  end if;
  v_provider_id := 'web3:' || p_chain || ':' || v_normalized;

  if not exists (
    select 1 from public.linked_wallets
     where user_id = p_user_id and chain = p_chain and address = v_normalized
  ) then
    raise exception 'WALLET_NOT_LINKED' using errcode = 'P0001';
  end if;

  select public.remaining_signin_methods(p_user_id, v_provider_id)
    into v_remaining;

  if v_remaining < 1 then
    raise exception 'LAST_SIGN_IN_METHOD' using errcode = 'P0001';
  end if;

  delete from auth.identities
   where user_id = p_user_id
     and provider = 'web3'
     and provider_id = v_provider_id;

  delete from public.linked_wallets
   where user_id = p_user_id
     and chain = p_chain
     and address = v_normalized;
end;
$$;


ALTER FUNCTION "public"."unlink_web3_identity"("p_user_id" "uuid", "p_chain" "text", "p_address" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_marketplace_wallet"("p_workspace_id" "uuid", "p_address" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."update_marketplace_wallet"("p_workspace_id" "uuid", "p_address" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_survey_run_progress"("p_run_id" "uuid", "p_stage" "text", "p_progress" integer, "p_status" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."update_survey_run_progress"("p_run_id" "uuid", "p_stage" "text", "p_progress" integer, "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inv_workspace_id uuid;
  invoice_total numeric(12,2);
  paid_total numeric(12,2);
begin
  -- Load the invoice referenced by the payment.
  select workspace_id, total
  into inv_workspace_id, invoice_total
  from public.invoices
  where id = new.invoice_id;

  if not found then
    raise exception 'Invoice % not found.', new.invoice_id;
  end if;

  -- 1. Workspace isolation: the invoice must belong to the payment workspace.
  if inv_workspace_id is distinct from new.workspace_id then
    raise exception 'Payment invoice does not belong to the payment workspace.';
  end if;

  -- 2. Over-payment guard: cumulative payments cannot exceed the invoice total.
  select coalesce(sum(amount), 0)
  into paid_total
  from public.payments
  where invoice_id = new.invoice_id
    and id is distinct from new.id;

  if paid_total + new.amount > invoice_total then
    raise exception
      'Payment amount % exceeds the remaining invoice balance (%).',
      new.amount,
      invoice_total - paid_total;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."workspace_storage_limit_bytes"("p_workspace_id" "uuid") RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select (
    coalesce((select w.storage_limit_mb from public.workspaces w where w.id = p_workspace_id), 0)::bigint
    + coalesce((
        select sum(sp.storage_mb)
        from public.workspace_storage_purchases sp
        where sp.workspace_id = p_workspace_id
          and not sp.included_in_base_quota
          and sp.starts_at <= now()
          and (sp.expires_at is null or sp.expires_at > now())
      ), 0)::bigint
  ) * 1048576;
$$;


ALTER FUNCTION "public"."workspace_storage_limit_bytes"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'New chat'::"text" NOT NULL,
    "session_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "summary" "text" DEFAULT ''::"text" NOT NULL,
    "summary_through" timestamp with time zone,
    "context" "text" DEFAULT 'dashboard'::"text" NOT NULL,
    CONSTRAINT "ai_conversations_context_check" CHECK (("context" = ANY (ARRAY['dashboard'::"text", 'cad'::"text"])))
);


ALTER TABLE "public"."ai_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_memory" (
    "conversation_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."ai_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_run_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "workspace_id" "uuid",
    "conversation_id" "uuid",
    "project_id" "uuid",
    "model" "text" NOT NULL,
    "context" "text" DEFAULT 'dashboard'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "rounds" integer DEFAULT 0 NOT NULL,
    "tool_calls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "events" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "final_text" "text",
    "outcome" "text" DEFAULT 'success'::"text" NOT NULL,
    "error" "text",
    CONSTRAINT "ai_run_logs_outcome_check" CHECK (("outcome" = ANY (ARRAY['success'::"text", 'error'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."ai_run_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "body" "text" NOT NULL,
    "examples" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asset_calibrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "calibration_date" "date" NOT NULL,
    "next_calibration_date" "date",
    "calibration_status" "public"."calibration_status" DEFAULT 'scheduled'::"public"."calibration_status" NOT NULL,
    "certificate_number" "text",
    "certificate_path" "text",
    "provider_name" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "_deleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."asset_calibrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asset_maintenance_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "serviced_on" "date" NOT NULL,
    "description" "text" NOT NULL,
    "cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "provider_name" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "_deleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."asset_maintenance_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "asset_code" "text",
    "name" "text" NOT NULL,
    "kind" "public"."asset_kind" DEFAULT 'instrument'::"public"."asset_kind" NOT NULL,
    "category" "text",
    "make" "text",
    "model" "text",
    "serial_number" "text",
    "status" "public"."asset_status" DEFAULT 'available'::"public"."asset_status" NOT NULL,
    "purchase_date" "date",
    "purchase_cost" numeric(12,2),
    "current_value" numeric(12,2),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "_deleted" boolean DEFAULT false NOT NULL,
    "photos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "assets_photos_max_six" CHECK (("cardinality"("photos") <= 6))
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."assets"."photos" IS 'Ordered photo paths in the public asset-media bucket; index 0 is the marketplace cover.';



CREATE TABLE IF NOT EXISTS "public"."attachment_tags" (
    "attachment_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attachment_tags" OWNER TO "postgres";


COMMENT ON TABLE "public"."attachment_tags" IS 'Many-to-many join between attachments and tags.';



CREATE TABLE IF NOT EXISTS "public"."attachment_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "attachment_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "content_hash" "text",
    "size_bytes" bigint,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attachment_versions" OWNER TO "postgres";


COMMENT ON TABLE "public"."attachment_versions" IS 'Archived copies of previous file contents for an attachment.';



CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "entity_table" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "bucket_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "visibility" "public"."attachment_visibility" DEFAULT 'private'::"public"."attachment_visibility" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint,
    "storage_tier" "public"."attachment_storage_tier" DEFAULT 'off_chain'::"public"."attachment_storage_tier" NOT NULL,
    "chain_status" "public"."attachment_chain_status" DEFAULT 'none'::"public"."attachment_chain_status" NOT NULL,
    "content_hash" "text",
    "chain_tx_signature" "text",
    "chain_network" "text",
    "anchored_at" timestamp with time zone,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "folder_id" "uuid",
    "chain_program_address" "text",
    "anchor_mode" "text",
    "anchor_operation_id" "uuid",
    "anchor_fee_lamports" bigint,
    CONSTRAINT "attachments_anchor_mode_check" CHECK ((("anchor_mode" IS NULL) OR ("anchor_mode" = ANY (ARRAY['hash'::"text", 'full_file'::"text"]))))
);


ALTER TABLE "public"."attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_nonces" (
    "nonce" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "user_id" "uuid",
    "chain" "text",
    "address" "text",
    "client_hash" "text",
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    CONSTRAINT "auth_nonces_expiry_after_issue" CHECK (("expires_at" > "issued_at")),
    CONSTRAINT "auth_nonces_purpose_check" CHECK (("purpose" = ANY (ARRAY['siwe_login'::"text", 'siwe_link'::"text", 'siws_login'::"text", 'siws_link'::"text"])))
);


ALTER TABLE "public"."auth_nonces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_operation_rates" (
    "operation" "text" NOT NULL,
    "credits" bigint NOT NULL,
    "estimated_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_operation_rates_credits_check" CHECK (("credits" > 0)),
    CONSTRAINT "billing_operation_rates_estimated_cost_check" CHECK (("estimated_cost" >= (0)::numeric))
);


ALTER TABLE "public"."billing_operation_rates" OWNER TO "postgres";


COMMENT ON TABLE "public"."billing_operation_rates" IS 'Credit rate per AI operation. For a fixed-price operation (ai.chat) the credits column is the price. For a priced-by-specification operation (satellite.survey) it is the floor, and the real price comes from survey_credit_rates.';



CREATE TABLE IF NOT EXISTS "public"."billing_packages" (
    "id" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text" NOT NULL,
    "credits" bigint,
    "storage_mb" integer,
    "duration_days" integer,
    "amount" numeric(12,2) NOT NULL,
    "currency_code" "text" DEFAULT 'USD'::"text" NOT NULL,
    "estimated_infrastructure_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "estimated_payment_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_packages_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "billing_packages_check" CHECK (((("kind" = 'ai_credits'::"text") AND ("credits" IS NOT NULL) AND ("storage_mb" IS NULL) AND ("duration_days" IS NULL)) OR (("kind" = 'storage'::"text") AND ("credits" IS NULL) AND ("storage_mb" IS NOT NULL) AND ("duration_days" IS NOT NULL)))),
    CONSTRAINT "billing_packages_credits_check" CHECK ((("credits" IS NULL) OR ("credits" > 0))),
    CONSTRAINT "billing_packages_currency_code_check" CHECK (("currency_code" = 'USD'::"text")),
    CONSTRAINT "billing_packages_duration_days_check" CHECK ((("duration_days" IS NULL) OR ("duration_days" > 0))),
    CONSTRAINT "billing_packages_estimated_infrastructure_cost_check" CHECK (("estimated_infrastructure_cost" >= (0)::numeric)),
    CONSTRAINT "billing_packages_estimated_payment_fee_check" CHECK (("estimated_payment_fee" >= (0)::numeric)),
    CONSTRAINT "billing_packages_kind_check" CHECK (("kind" = ANY (ARRAY['ai_credits'::"text", 'storage'::"text"]))),
    CONSTRAINT "billing_packages_storage_mb_check" CHECK ((("storage_mb" IS NULL) OR ("storage_mb" > 0)))
);


ALTER TABLE "public"."billing_packages" OWNER TO "postgres";


COMMENT ON TABLE "public"."billing_packages" IS 'Sellable AI credit and storage packages. Cost estimates follow PRICING.md; RLS is SELECT-only for authenticated, so the operator changes prices by migration.';



COMMENT ON COLUMN "public"."billing_packages"."estimated_infrastructure_cost" IS 'Marginal Supabase cost at purchase time. Excludes the shared platform subscription, egress inside the Pro allowance, and any storage held after the package expires.';



COMMENT ON COLUMN "public"."billing_packages"."estimated_payment_fee" IS 'Assumed merchant fee at 3.5% pending the contracted PesePay rate; not verified.';



CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edited_at" timestamp with time zone,
    CONSTRAINT "chat_messages_content_check" CHECK ((("length"(TRIM(BOTH FROM "content")) >= 1) AND ("length"(TRIM(BOTH FROM "content")) <= 2000)))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."chat_messages"."edited_at" IS 'When the message was last edited by its author. NULL means unedited.';



CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "full_name" "text" NOT NULL,
    "title" "text",
    "contact_type" "text",
    "email" "text",
    "phone" "text",
    "last_contact_at" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "_deleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_solana_wallets" (
    "user_id" "uuid" NOT NULL,
    "wallet_address" "text" NOT NULL,
    "salt" "text" NOT NULL,
    "iv" "text" NOT NULL,
    "ciphertext" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."custom_solana_wallets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."embedded_solana_wallets" (
    "user_id" "uuid" NOT NULL,
    "wallet_address" "text" NOT NULL,
    "encrypted_key" "text" NOT NULL,
    "iv" "text" NOT NULL,
    "salt" "text" NOT NULL,
    "encrypted_mnemonic" "text",
    "mnemonic_iv" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "embedded_solana_wallets_user_id_check" CHECK (("user_id" = "auth"."uid"()))
);


ALTER TABLE "public"."embedded_solana_wallets" OWNER TO "postgres";


COMMENT ON TABLE "public"."embedded_solana_wallets" IS 'Encrypted embedded Solana wallet keys and optional seed phrases. Secret keys are encrypted client-side with a user PIN; this table only stores ciphertext.';



COMMENT ON COLUMN "public"."embedded_solana_wallets"."encrypted_mnemonic" IS 'BIP-39 seed phrase encrypted client-side with the same PIN used for encrypted_key.';



COMMENT ON COLUMN "public"."embedded_solana_wallets"."mnemonic_iv" IS 'Initialization vector for the encrypted_mnemonic AES-GCM ciphertext.';



CREATE TABLE IF NOT EXISTS "public"."expense_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "entry_date" "date" NOT NULL,
    "category" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "vendor" "text",
    "reimbursable" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "_deleted" boolean DEFAULT false NOT NULL,
    CONSTRAINT "expense_entries_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."expense_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."file_anchor_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operation_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "chunk_index" integer NOT NULL,
    "bucket_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "size_bytes" integer NOT NULL,
    "content_hash" "text" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "file_anchor_chunks_bucket_name_check" CHECK (("bucket_name" = ANY (ARRAY['workspace-private'::"text", 'workspace-public'::"text"]))),
    CONSTRAINT "file_anchor_chunks_chunk_index_check" CHECK (("chunk_index" >= 0)),
    CONSTRAINT "file_anchor_chunks_content_hash_check" CHECK (("content_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "file_anchor_chunks_size_bytes_check" CHECK (("size_bytes" > 0))
);


ALTER TABLE "public"."file_anchor_chunks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."file_anchor_chunks"."size_bytes" IS 'Plaintext chunk size; the stored object is larger by the 12-byte IV and the 16-byte GCM tag.';



COMMENT ON COLUMN "public"."file_anchor_chunks"."content_hash" IS 'SHA-256 of the plaintext chunk — what the manifest and the chain commit to, not of the stored ciphertext.';



CREATE TABLE IF NOT EXISTS "public"."file_anchor_operations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "attachment_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "mode" "text" NOT NULL,
    "bucket_name" "text" DEFAULT 'workspace-private'::"text" NOT NULL,
    "network" "text" NOT NULL,
    "wallet_address" "text",
    "status" "text" DEFAULT 'preparing'::"text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size_bytes" bigint DEFAULT 0 NOT NULL,
    "mime_type" "text",
    "chunk_size" integer,
    "chunk_count" integer,
    "uploaded_chunks" integer DEFAULT 0 NOT NULL,
    "file_hash" "text",
    "manifest_hash" "text",
    "manifest" "jsonb",
    "manifest_storage_path" "text",
    "memo" "text",
    "tx_signature" "text",
    "tx_slot" bigint,
    "fee_lamports" bigint,
    "error_message" "text",
    "verification_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "encryption" "jsonb",
    CONSTRAINT "file_anchor_operations_bucket_name_check" CHECK (("bucket_name" = ANY (ARRAY['workspace-private'::"text", 'workspace-public'::"text"]))),
    CONSTRAINT "file_anchor_operations_check" CHECK (("uploaded_chunks" <= COALESCE("chunk_count", "uploaded_chunks"))),
    CONSTRAINT "file_anchor_operations_chunk_count_check" CHECK ((("chunk_count" IS NULL) OR ("chunk_count" > 0))),
    CONSTRAINT "file_anchor_operations_chunk_size_check" CHECK ((("chunk_size" IS NULL) OR ("chunk_size" > 0))),
    CONSTRAINT "file_anchor_operations_encryption_shape" CHECK ((("encryption" IS NULL) OR (("encryption" ?& ARRAY['version'::"text", 'algorithm'::"text", 'kdf'::"text", 'iterations'::"text", 'salt'::"text", 'iv'::"text", 'wrapped_key'::"text"]) AND (("encryption" ->> 'algorithm'::"text") = 'AES-256-GCM'::"text") AND (("encryption" ->> 'kdf'::"text") = 'PBKDF2-SHA256'::"text") AND ("jsonb_typeof"(("encryption" -> 'iterations'::"text")) = 'number'::"text") AND ((("encryption" ->> 'iterations'::"text"))::numeric >= (100000)::numeric)))),
    CONSTRAINT "file_anchor_operations_fee_lamports_check" CHECK ((("fee_lamports" IS NULL) OR ("fee_lamports" >= 0))),
    CONSTRAINT "file_anchor_operations_file_hash_check" CHECK ((("file_hash" IS NULL) OR ("file_hash" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "file_anchor_operations_file_size_bytes_check" CHECK (("file_size_bytes" >= 0)),
    CONSTRAINT "file_anchor_operations_manifest_hash_check" CHECK ((("manifest_hash" IS NULL) OR ("manifest_hash" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "file_anchor_operations_mode_check" CHECK (("mode" = ANY (ARRAY['hash'::"text", 'full_file'::"text"]))),
    CONSTRAINT "file_anchor_operations_status_check" CHECK (("status" = ANY (ARRAY['preparing'::"text", 'uploading'::"text", 'ready'::"text", 'submitting'::"text", 'submitted'::"text", 'confirming'::"text", 'anchored'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "file_anchor_operations_uploaded_chunks_check" CHECK (("uploaded_chunks" >= 0)),
    CONSTRAINT "file_anchor_operations_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['unverified'::"text", 'verified'::"text", 'mismatch'::"text"])))
);


ALTER TABLE "public"."file_anchor_operations" OWNER TO "postgres";


COMMENT ON TABLE "public"."file_anchor_operations" IS 'One row per anchoring attempt: hash-only (ssv1) or hybrid full-file (ssv2).';



COMMENT ON COLUMN "public"."file_anchor_operations"."manifest_hash" IS 'SHA-256 of the canonical chunk manifest; the value written on-chain alongside the file digest.';



COMMENT ON COLUMN "public"."file_anchor_operations"."encryption" IS 'Wrapped AES-256 data key for this operation''s chunks. NULL means the record predates chunk encryption and its stored chunks are plaintext.';



CREATE TABLE IF NOT EXISTS "public"."folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "name" "text" NOT NULL,
    "path" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."folders" OWNER TO "postgres";


COMMENT ON TABLE "public"."folders" IS 'Hierarchical file folders scoped to a workspace. parent_id is null for root-level folders.';



CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "line_number" integer DEFAULT 1 NOT NULL,
    "description" "text" NOT NULL,
    "qty" numeric(12,2) DEFAULT 1 NOT NULL,
    "unit" "text",
    "rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "organization_id" "uuid",
    "contact_id" "uuid",
    "invoice_number" "text" NOT NULL,
    "issue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date",
    "status" "public"."invoice_status" DEFAULT 'draft'::"public"."invoice_status" NOT NULL,
    "currency_code" "text" DEFAULT 'USD'::"text" NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "paid_at" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pesepay_reference" "text"
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_assignment_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "_deleted" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_assignment_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_assignment_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "workspace_member_id" "uuid" NOT NULL,
    "assignment_role" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "_deleted" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_assignment_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "job_id" "uuid",
    "assignment_date" "date" NOT NULL,
    "status" "public"."assignment_status" DEFAULT 'draft'::"public"."assignment_status" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "_deleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."job_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "job_id" "uuid",
    "title" "text" NOT NULL,
    "event_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "event_date" "date" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "location" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "_deleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."job_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "job_type" "text",
    "location" "text",
    "status" "public"."job_status" DEFAULT 'planned'::"public"."job_status" NOT NULL,
    "scheduled_start" timestamp with time zone,
    "scheduled_end" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "_deleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."linked_wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "chain" "text" NOT NULL,
    "address" "text" NOT NULL,
    "provider_id" "text" NOT NULL,
    "linked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "linked_wallets_address_check" CHECK ((("char_length"("address") >= 32) AND ("char_length"("address") <= 64))),
    CONSTRAINT "linked_wallets_chain_check" CHECK (("chain" = ANY (ARRAY['ethereum'::"text", 'solana'::"text"])))
);


ALTER TABLE "public"."linked_wallets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "kind" "text" DEFAULT 'course'::"text" NOT NULL,
    "provider" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "location" "text" NOT NULL,
    "price" numeric DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "description" "text",
    "certification_body" "text",
    "seats_left" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "venue_address" "text",
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "instructor" "text",
    "agenda" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "registration_url" "text",
    "registration_deadline" timestamp with time zone,
    "cpd_points" numeric,
    "capacity" integer,
    "photo_path" "text",
    "is_remote" boolean DEFAULT false NOT NULL,
    "city" "text",
    "country" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."market_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "market_kind" "text" NOT NULL,
    "market_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."market_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_firms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "services" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "location" "text" NOT NULL,
    "about" "text",
    "verified" boolean DEFAULT false NOT NULL,
    "staff_count" integer,
    "founded_year" integer,
    "latitude" double precision,
    "longitude" double precision,
    "is_global" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "website" "text",
    "contact_email" "text",
    "logo_path" "text",
    "accreditations" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "service_areas" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_remote" boolean DEFAULT false NOT NULL,
    "city" "text",
    "country" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."market_firms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_inquiries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "intent" "text" DEFAULT 'enquiry'::"text" NOT NULL,
    "requester_user_id" "uuid" NOT NULL,
    "requester_workspace_id" "uuid",
    "requester_name" "text",
    "requester_email" "text",
    "message" "text",
    "desired_start_date" "date",
    "seats" integer,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    CONSTRAINT "market_inquiries_kind_check" CHECK (("kind" = ANY (ARRAY['listing'::"text", 'professional'::"text", 'job'::"text", 'firm'::"text", 'event'::"text"]))),
    CONSTRAINT "market_inquiries_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."market_inquiries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_job_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "discipline" "text" NOT NULL,
    "employment_type" "text" DEFAULT 'contract'::"text" NOT NULL,
    "rate" numeric,
    "rate_per" "text",
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "location" "text" NOT NULL,
    "description" "text",
    "requirements" "text"[],
    "latitude" double precision,
    "longitude" double precision,
    "is_global" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "closes_at" timestamp with time zone,
    "starts_on" "date",
    "seniority" "text",
    "benefits" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "apply_url" "text",
    "photo_path" "text",
    "is_remote" boolean DEFAULT false NOT NULL,
    "city" "text",
    "country" "text",
    CONSTRAINT "market_job_posts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'draft'::"text"])))
);


ALTER TABLE "public"."market_job_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "author_user_id" "uuid" NOT NULL,
    "rating" smallint NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "market_reviews_kind_check" CHECK (("kind" = ANY (ARRAY['professional'::"text", 'firm'::"text"]))),
    CONSTRAINT "market_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."market_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_saved_searches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "query" "text" DEFAULT ''::"text" NOT NULL,
    "scope" "text" DEFAULT 'all'::"text" NOT NULL,
    "sort" "text" DEFAULT 'newest'::"text" NOT NULL,
    "listing_category" "text" DEFAULT 'all'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."market_saved_searches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "condition" "text" NOT NULL,
    "price" numeric NOT NULL,
    "currency" "text" NOT NULL,
    "seller" "text" NOT NULL,
    "location" "text" NOT NULL,
    "description" "text",
    "specs" "text"[],
    "is_global" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asset_id" "uuid",
    "seller_wallet_address" "text",
    "listing_type" "text",
    "latitude" double precision,
    "longitude" double precision,
    "category" "text" DEFAULT 'instrument'::"text" NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "quantity" integer DEFAULT 1 NOT NULL,
    "serial_number" "text",
    "manufacture_year" integer,
    "delivery" "text",
    "warranty_months" integer,
    "available_from" "date",
    "available_to" "date",
    "negotiable" boolean DEFAULT false NOT NULL,
    "is_remote" boolean DEFAULT false NOT NULL,
    "city" "text",
    "country" "text",
    "is_verified" boolean DEFAULT false NOT NULL,
    CONSTRAINT "marketplace_listings_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'reserved'::"text", 'sold'::"text", 'withdrawn'::"text"])))
);


ALTER TABLE "public"."marketplace_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "buyer_workspace_id" "uuid" NOT NULL,
    "listing_workspace_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" NOT NULL,
    "platform_fee_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "provider" "text" DEFAULT 'manual'::"text" NOT NULL,
    "external_payment_ref" "text",
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."marketplace_orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."marketplace_orders" IS 'Optional order log (e.g. manual reconciliation). No payment processor is integrated.';



CREATE TABLE IF NOT EXISTS "public"."marketplace_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "requester_workspace_id" "uuid" NOT NULL,
    "requester_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text",
    "desired_start_date" "date",
    "desired_end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."marketplace_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."marketplace_requests" IS 'Lightweight inquiry/request for a marketplace listing. Status: pending, accepted, declined, cancelled.';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "status" "public"."notification_status" DEFAULT 'unread'::"public"."notification_status" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "organization_type" "public"."organization_type" DEFAULT 'client'::"public"."organization_type" NOT NULL,
    "email" "text",
    "phone" "text",
    "address" "text",
    "city" "text",
    "country_code" "text" DEFAULT 'ZW'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "_deleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "label" "text" NOT NULL,
    "detail" "text" NOT NULL,
    "holder" "text",
    "expiry" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_methods_type_check" CHECK (("type" = ANY (ARRAY['Card'::"text", 'Mobile Money'::"text", 'Bank Transfer'::"text", 'Crypto Wallet'::"text"])))
);


ALTER TABLE "public"."payment_methods" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payment_methods"."detail" IS 'For Crypto Wallet payment methods this stores the wallet address.';



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "paid_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_method" "text",
    "reference" "text",
    "notes" "text",
    "tx_signature" "text",
    "chain" "text",
    "wallet_address" "text",
    "token_mint" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portfolio_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "year" "text",
    "image_path" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."portfolio_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professionals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "discipline" "text" NOT NULL,
    "experience" "text" NOT NULL,
    "location" "text" NOT NULL,
    "rate" numeric NOT NULL,
    "rate_per" "text" NOT NULL,
    "currency" "text" NOT NULL,
    "availability" "text" NOT NULL,
    "rating" numeric DEFAULT 0,
    "reviews" integer DEFAULT 0,
    "skills" "text"[],
    "bio" "text",
    "certifications" "text"[],
    "is_global" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "avatar_path" "text",
    "banner_path" "text",
    "is_verified" boolean DEFAULT false NOT NULL,
    "is_remote" boolean DEFAULT false NOT NULL,
    "city" "text",
    "country" "text",
    "languages" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "travel_radius_km" integer,
    "credential_issuer" "text",
    "credential_expires_on" "date"
);


ALTER TABLE "public"."professionals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."professionals"."avatar_path" IS 'Path of the profile photo in the public portfolio-media bucket.';



COMMENT ON COLUMN "public"."professionals"."banner_path" IS 'Path of the cover banner image in the public portfolio-media bucket.';



COMMENT ON COLUMN "public"."professionals"."is_verified" IS 'Platform-verified badge shown on public portfolio surfaces.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "professional_title" "text",
    "promo_code" "text",
    "phone" "text",
    "bio" "text",
    "avatar_path" "text",
    "default_workspace_id" "uuid",
    "is_platform_admin" boolean DEFAULT false NOT NULL,
    "auth_signup_account_type" "text",
    "onboarding_complete" boolean DEFAULT false NOT NULL,
    "deletion_requested_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "registration_no" "text",
    "company_name" "text",
    "city" "text",
    "country_code" "text",
    "website" "text",
    "linkedin" "text",
    "specializations" "text",
    "email_notifications" boolean DEFAULT true NOT NULL,
    CONSTRAINT "profiles_auth_signup_account_type_chk" CHECK ((("auth_signup_account_type" IS NULL) OR ("auth_signup_account_type" = ANY (ARRAY['personal'::"text", 'business'::"text", 'platform_admin'::"text"]))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."is_platform_admin" IS 'Trusted operators only; set in SQL by platform administrators. Enables cross-tenant admin API via RLS policies.';



COMMENT ON COLUMN "public"."profiles"."auth_signup_account_type" IS 'Signup metadata: personal | business | platform_admin. Written only by handle_new_auth_user().';



COMMENT ON COLUMN "public"."profiles"."deletion_requested_at" IS 'When the user requested account deletion. Starts a grace period before permanent removal.';



COMMENT ON COLUMN "public"."profiles"."deleted_at" IS 'Soft-delete timestamp. Account becomes inaccessible after this time.';



CREATE TABLE IF NOT EXISTS "public"."project_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "content" "text" NOT NULL,
    "activity_type" "text" DEFAULT 'note'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_cad_drawings" (
    "project_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "model" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_cad_drawings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "relation" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "code" "text",
    "name" "text" NOT NULL,
    "description" "text",
    "phase" "text",
    "datum" "text",
    "progress" numeric(5,2) DEFAULT 0 NOT NULL,
    "points" integer DEFAULT 0 NOT NULL,
    "status" "public"."project_status" DEFAULT 'draft'::"public"."project_status" NOT NULL,
    "starts_on" "date",
    "ends_on" "date",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "axis_convention" "text" DEFAULT 'yx'::"text" NOT NULL,
    "crs_type" "text" DEFAULT 'local'::"text" NOT NULL,
    "crs_epsg" "text",
    "local_origin_e" numeric(12,3) DEFAULT 0 NOT NULL,
    "local_origin_n" numeric(12,3) DEFAULT 0 NOT NULL,
    "bearing_format" "text" DEFAULT 'azimuth'::"text" NOT NULL,
    "angle_entry" "text" DEFAULT 'packed'::"text" NOT NULL,
    "coord_decimals" integer DEFAULT 3 NOT NULL,
    "_deleted" boolean DEFAULT false NOT NULL,
    CONSTRAINT "projects_progress_check" CHECK ((("progress" >= (0)::numeric) AND ("progress" <= (100)::numeric)))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON COLUMN "public"."projects"."axis_convention" IS 'Display convention for coordinate readouts: yx (Gauss, Y=Easting first) or xy (UTM, X=Easting first).';



COMMENT ON COLUMN "public"."projects"."crs_type" IS 'Coordinate system type: local, projected, or other.';



COMMENT ON COLUMN "public"."projects"."crs_epsg" IS 'Optional EPSG code when crs_type is projected.';



COMMENT ON COLUMN "public"."projects"."local_origin_e" IS 'Easting value treated as 0 in the local site grid.';



COMMENT ON COLUMN "public"."projects"."local_origin_n" IS 'Northing value treated as 0 in the local site grid.';



COMMENT ON COLUMN "public"."projects"."bearing_format" IS 'Direction display format: azimuth, quadrant, or gon.';



COMMENT ON COLUMN "public"."projects"."angle_entry" IS 'Angle entry mode: packed, dms, decimal, or gon.';



COMMENT ON COLUMN "public"."projects"."coord_decimals" IS 'Decimal places for coordinate and distance readouts (0..6).';































CREATE TABLE IF NOT EXISTS "public"."transport_checkpoints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "departure_id" "uuid" NOT NULL,
    "city_id" "uuid" NOT NULL,
    "latitude" numeric(9,6) NOT NULL,
    "longitude" numeric(9,6) NOT NULL,
    "sequence" integer NOT NULL,
    "reported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reported_by" "uuid" NOT NULL,
    "note" "text",
    CONSTRAINT "transport_checkpoints_sequence_check" CHECK (("sequence" >= 1))
);


ALTER TABLE "public"."transport_checkpoints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transport_cities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "country" "text" DEFAULT 'Zimbabwe'::"text" NOT NULL,
    "latitude" numeric(9,6) NOT NULL,
    "longitude" numeric(9,6) NOT NULL,
    "timezone" "text" DEFAULT 'Africa/Harare'::"text" NOT NULL,
    "hub_address" "text",
    "hub_hours" "text",
    "active" boolean DEFAULT true NOT NULL,
    "is_sample" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transport_cities_latitude_check" CHECK ((("latitude" >= ('-90'::integer)::numeric) AND ("latitude" <= (90)::numeric))),
    CONSTRAINT "transport_cities_longitude_check" CHECK ((("longitude" >= ('-180'::integer)::numeric) AND ("longitude" <= (180)::numeric)))
);


ALTER TABLE "public"."transport_cities" OWNER TO "postgres";






CREATE TABLE IF NOT EXISTS "public"."transport_routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "origin_city_id" "uuid" NOT NULL,
    "destination_city_id" "uuid" NOT NULL,
    "direct_distance_km" numeric(8,2),
    "fare_per_slot" numeric(12,2) DEFAULT 0 NOT NULL,
    "fare_per_kg" numeric(12,2) DEFAULT 0 NOT NULL,
    "fare_final_mile" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "status" "text" DEFAULT 'published'::"text" NOT NULL,
    "is_sample" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transport_routes_check" CHECK (("origin_city_id" <> "destination_city_id")),
    CONSTRAINT "transport_routes_fare_final_mile_check" CHECK (("fare_final_mile" >= (0)::numeric)),
    CONSTRAINT "transport_routes_fare_per_kg_check" CHECK (("fare_per_kg" >= (0)::numeric)),
    CONSTRAINT "transport_routes_fare_per_slot_check" CHECK (("fare_per_slot" >= (0)::numeric)),
    CONSTRAINT "transport_routes_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'paused'::"text", 'retired'::"text"])))
);


ALTER TABLE "public"."transport_routes" OWNER TO "postgres";






CREATE TABLE IF NOT EXISTS "public"."transport_vehicle_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "capacity_slots" integer NOT NULL,
    "capacity_kg" numeric(12,2) NOT NULL,
    "min_load_ratio" numeric(4,3) DEFAULT 0.600 NOT NULL,
    "default_backstop_days" integer DEFAULT 4 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transport_vehicle_classes_capacity_kg_check" CHECK (("capacity_kg" > (0)::numeric)),
    CONSTRAINT "transport_vehicle_classes_capacity_slots_check" CHECK (("capacity_slots" > 0)),
    CONSTRAINT "transport_vehicle_classes_default_backstop_days_check" CHECK ((("default_backstop_days" >= 1) AND ("default_backstop_days" <= 30))),
    CONSTRAINT "transport_vehicle_classes_min_load_ratio_check" CHECK ((("min_load_ratio" >= 0.05) AND ("min_load_ratio" <= 1.000)))
);


ALTER TABLE "public"."transport_vehicle_classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transport_vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "plate" "text" NOT NULL,
    "description" "text",
    "verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "insurance_reference" "text",
    "workspace_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "is_sample" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transport_vehicles_check" CHECK ((("verification_status" <> 'verified'::"text") OR (("verified_at" IS NOT NULL) AND ("verified_by" IS NOT NULL) AND ("insurance_reference" IS NOT NULL)))),
    CONSTRAINT "transport_vehicles_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."transport_vehicles" OWNER TO "postgres";










CREATE TABLE IF NOT EXISTS "public"."transport_route_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_id" "uuid" NOT NULL,
    "city_id" "uuid" NOT NULL,
    "sequence" integer NOT NULL,
    "stop_offset_km" numeric(8,2),
    "dwell_minutes" integer DEFAULT 45 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transport_route_stops_dwell_minutes_check" CHECK (("dwell_minutes" >= 0)),
    CONSTRAINT "transport_route_stops_sequence_check" CHECK (("sequence" >= 1))
);


ALTER TABLE "public"."transport_route_stops" OWNER TO "postgres";






CREATE TABLE IF NOT EXISTS "public"."quote_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "quote_id" "uuid" NOT NULL,
    "line_number" integer DEFAULT 1 NOT NULL,
    "description" "text" NOT NULL,
    "qty" numeric(12,2) DEFAULT 1 NOT NULL,
    "unit" "text",
    "rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quote_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "organization_id" "uuid",
    "contact_id" "uuid",
    "quote_number" "text" NOT NULL,
    "issue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "expires_on" "date",
    "status" "public"."quote_status" DEFAULT 'draft'::"public"."quote_status" NOT NULL,
    "currency_code" "text" DEFAULT 'USD'::"text" NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "accepted_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."solana_market_cache" (
    "id" smallint DEFAULT 1 NOT NULL,
    "payload" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "solana_market_cache_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."solana_market_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_credit_rates" (
    "category" "text" NOT NULL,
    "label" "text" NOT NULL,
    "base_credits" bigint NOT NULL,
    "per_hectare_credits" numeric(14,8) DEFAULT 0 NOT NULL,
    "minimum_credits" bigint NOT NULL,
    "estimated_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "survey_credit_rates_base_credits_check" CHECK (("base_credits" >= 0)),
    CONSTRAINT "survey_credit_rates_category_check" CHECK (("category" = ANY (ARRAY['water'::"text", 'minerals'::"text", 'soil'::"text", 'hazard'::"text"]))),
    CONSTRAINT "survey_credit_rates_estimated_cost_check" CHECK (("estimated_cost" >= (0)::numeric)),
    CONSTRAINT "survey_credit_rates_minimum_credits_check" CHECK (("minimum_credits" >= 0)),
    CONSTRAINT "survey_credit_rates_per_hectare_credits_check" CHECK (("per_hectare_credits" >= (0)::numeric))
);


ALTER TABLE "public"."survey_credit_rates" OWNER TO "postgres";


COMMENT ON TABLE "public"."survey_credit_rates" IS 'Credit cost per satellite survey type: a fixed cost for the engine plus a rate per hectare of analysed ground. Read-only for members; the operator changes prices by migration.';



COMMENT ON COLUMN "public"."survey_credit_rates"."minimum_credits" IS 'Floor for one survey of this type. Reached by small plots, where the fixed cost of reading the coverages dominates the area.';



CREATE TABLE IF NOT EXISTS "public"."survey_deliverables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "content_type" "text" NOT NULL,
    "size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "survey_deliverables_size_bytes_check" CHECK ((("size_bytes" IS NULL) OR ("size_bytes" >= 0)))
);


ALTER TABLE "public"."survey_deliverables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "project_id" "uuid",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "stage" "text",
    "progress" integer DEFAULT 0 NOT NULL,
    "latitude" numeric(9,6) NOT NULL,
    "longitude" numeric(9,6) NOT NULL,
    "half_deg" numeric(5,3) DEFAULT 0.12 NOT NULL,
    "categories" "text"[] DEFAULT ARRAY['water'::"text", 'minerals'::"text", 'soil'::"text", 'hazard'::"text"] NOT NULL,
    "client_name" "text" DEFAULT 'Site Survey'::"text" NOT NULL,
    "address" "text",
    "data_sources" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "composite" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "estimated_minutes" integer,
    "result" "jsonb",
    "error_message" "text",
    "worker_id" "text",
    "claimed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "job_id" "uuid",
    "quoted_credits" bigint,
    "surface_area_km2" numeric(12,3),
    "credit_quote" "jsonb",
    CONSTRAINT "survey_runs_categories_check" CHECK (("categories" <@ ARRAY['water'::"text", 'minerals'::"text", 'soil'::"text", 'hazard'::"text"])),
    CONSTRAINT "survey_runs_check" CHECK ((("status" <> 'succeeded'::"text") OR ("result" IS NOT NULL))),
    CONSTRAINT "survey_runs_check1" CHECK ((("progress" < 100) OR ("status" = 'succeeded'::"text"))),
    CONSTRAINT "survey_runs_estimated_minutes_check" CHECK (("estimated_minutes" > 0)),
    CONSTRAINT "survey_runs_half_deg_check" CHECK ((("half_deg" > (0)::numeric) AND ("half_deg" <= 0.5))),
    CONSTRAINT "survey_runs_latitude_check" CHECK ((("latitude" >= ('-90'::integer)::numeric) AND ("latitude" <= (90)::numeric))),
    CONSTRAINT "survey_runs_longitude_check" CHECK ((("longitude" >= ('-180'::integer)::numeric) AND ("longitude" <= (180)::numeric))),
    CONSTRAINT "survey_runs_progress_check" CHECK ((("progress" >= 0) AND ("progress" <= 100))),
    CONSTRAINT "survey_runs_quoted_credits_check" CHECK ((("quoted_credits" IS NULL) OR ("quoted_credits" > 0))),
    CONSTRAINT "survey_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'acquiring'::"text", 'surveying'::"text", 'publishing'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "survey_runs_surface_area_km2_check" CHECK ((("surface_area_km2" IS NULL) OR ("surface_area_km2" > (0)::numeric)))
);


ALTER TABLE "public"."survey_runs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."survey_runs"."progress" IS 'Engine-reported percent complete. Advisory only: it advances between categories, not within one.';



COMMENT ON COLUMN "public"."survey_runs"."quoted_credits" IS 'Credits charged for this run, priced from the survey types and the ground they covered.';



COMMENT ON COLUMN "public"."survey_runs"."surface_area_km2" IS 'Ground the run analysed, in square kilometres.';



COMMENT ON COLUMN "public"."survey_runs"."credit_quote" IS 'The full price breakdown for the run: one line per survey type with its fixed cost, its area cost and the credits it came to.';



CREATE TABLE IF NOT EXISTS "public"."survey_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "rank" integer NOT NULL,
    "latitude" numeric(9,6) NOT NULL,
    "longitude" numeric(9,6) NOT NULL,
    "score" numeric(6,3),
    "distance_km" numeric(8,3),
    "readout" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "survey_targets_category_check" CHECK (("category" = ANY (ARRAY['water'::"text", 'minerals'::"text", 'soil_land'::"text", 'hazard_safety'::"text"]))),
    CONSTRAINT "survey_targets_rank_check" CHECK (("rank" > 0))
);


ALTER TABLE "public"."survey_targets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."survey_targets"."score" IS 'Percentile rank inside this AOI only. Not comparable across sites and not a yield, grade or buildability claim.';



CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


COMMENT ON TABLE "public"."tags" IS 'Workspace-scoped labels that can be attached to files.';



CREATE TABLE IF NOT EXISTS "public"."time_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "entry_date" "date" NOT NULL,
    "task" "text" NOT NULL,
    "hours" numeric(6,2) NOT NULL,
    "billable" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "_deleted" boolean DEFAULT false NOT NULL,
    CONSTRAINT "time_entries_hours_check" CHECK (("hours" > (0)::numeric))
);


ALTER TABLE "public"."time_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transport_booking_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "actor_kind" "text" NOT NULL,
    "actor_id" "uuid",
    "note" "text",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transport_booking_events_actor_kind_check" CHECK (("actor_kind" = ANY (ARRAY['customer'::"text", 'platform'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."transport_booking_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_ai_credit_accounts" (
    "workspace_id" "uuid" NOT NULL,
    "balance" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_ai_credit_accounts_balance_check" CHECK (("balance" >= 0))
);


ALTER TABLE "public"."workspace_ai_credit_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_ai_credit_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "kind" "text" NOT NULL,
    "credits_delta" bigint NOT NULL,
    "balance_after" bigint NOT NULL,
    "operation_id" "text" NOT NULL,
    "description" "text" NOT NULL,
    "related_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_ai_credit_transactions_balance_after_check" CHECK (("balance_after" >= 0)),
    CONSTRAINT "workspace_ai_credit_transactions_credits_delta_check" CHECK (("credits_delta" <> 0)),
    CONSTRAINT "workspace_ai_credit_transactions_kind_check" CHECK (("kind" = ANY (ARRAY['purchase'::"text", 'usage'::"text", 'refund'::"text", 'reversal'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."workspace_ai_credit_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_ai_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "tag" "text" NOT NULL,
    "label" "text" NOT NULL,
    "base_url" "text" NOT NULL,
    "api_key_secret_id" "uuid",
    "api_key" "text",
    "default_model" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_ai_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."workspace_member_role" DEFAULT 'viewer'::"public"."workspace_member_role" NOT NULL,
    "invited_by" "uuid",
    "invitation_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."workspace_member_role" DEFAULT 'viewer'::"public"."workspace_member_role" NOT NULL,
    "status" "public"."workspace_member_status" DEFAULT 'active'::"public"."workspace_member_status" NOT NULL,
    "title" "text",
    "work_email" "text",
    "work_phone" "text",
    "invited_at" timestamp with time zone,
    "joined_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_pesepay_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "currency_code" "text" DEFAULT 'USD'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "pesepay_reference" "text",
    "related_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "package_id" "text",
    "credit_amount" bigint,
    "storage_mb" integer,
    "duration_days" integer,
    "estimated_infrastructure_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "estimated_payment_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "provider_status" "text",
    "refunded_at" timestamp with time zone,
    "refund_reason" "text",
    "refunded_by" "uuid",
    CONSTRAINT "workspace_pesepay_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "workspace_pesepay_transactions_credit_amount_check" CHECK ((("credit_amount" IS NULL) OR ("credit_amount" > 0))),
    CONSTRAINT "workspace_pesepay_transactions_currency_code_check" CHECK (("currency_code" = ANY (ARRAY['USD'::"text", 'ZWL'::"text"]))),
    CONSTRAINT "workspace_pesepay_transactions_duration_days_check" CHECK ((("duration_days" IS NULL) OR ("duration_days" > 0))),
    CONSTRAINT "workspace_pesepay_transactions_kind_check" CHECK (("kind" = ANY (ARRAY['deposit'::"text", 'storage_purchase'::"text", 'ai_credit_purchase'::"text", 'invoice_payment'::"text"]))),
    CONSTRAINT "workspace_pesepay_transactions_refund_shape" CHECK ((("status" <> 'refunded'::"text") OR (("refunded_at" IS NOT NULL) AND ("refund_reason" IS NOT NULL)))),
    CONSTRAINT "workspace_pesepay_transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text", 'refunded'::"text"]))),
    CONSTRAINT "workspace_pesepay_transactions_storage_mb_check" CHECK ((("storage_mb" IS NULL) OR ("storage_mb" > 0)))
);


ALTER TABLE "public"."workspace_pesepay_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_pesepay_wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "currency_code" "text" DEFAULT 'USD'::"text" NOT NULL,
    "balance" numeric(14,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_pesepay_wallets_balance_check" CHECK (("balance" >= (0)::numeric)),
    CONSTRAINT "workspace_pesepay_wallets_currency_code_check" CHECK (("currency_code" = 'USD'::"text"))
);


ALTER TABLE "public"."workspace_pesepay_wallets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_settings" (
    "workspace_id" "uuid" NOT NULL,
    "default_currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Africa/Harare'::"text" NOT NULL,
    "country_code" "text" DEFAULT 'ZW'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_storage_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "purchased_by" "uuid",
    "plan_id" "text" NOT NULL,
    "storage_mb" integer NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency_code" "text" NOT NULL,
    "payment_method" "text" DEFAULT 'balance'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "included_in_base_quota" boolean DEFAULT false NOT NULL,
    CONSTRAINT "workspace_storage_purchases_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "workspace_storage_purchases_currency_code_check" CHECK (("currency_code" = 'USD'::"text")),
    CONSTRAINT "workspace_storage_purchases_dates_check" CHECK ((("expires_at" IS NULL) OR ("expires_at" > "starts_at"))),
    CONSTRAINT "workspace_storage_purchases_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['balance'::"text", 'pesepay_checkout'::"text"]))),
    CONSTRAINT "workspace_storage_purchases_storage_mb_check" CHECK (("storage_mb" > 0))
);


ALTER TABLE "public"."workspace_storage_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "type" "public"."workspace_type" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "billing_email" "text",
    "currency_code" "text" DEFAULT 'USD'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Africa/Harare'::"text" NOT NULL,
    "country_code" "text" DEFAULT 'ZW'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "marketplace_wallet_address" "text",
    "storage_limit_mb" integer DEFAULT 500 NOT NULL
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


COMMENT ON COLUMN "public"."workspaces"."storage_limit_mb" IS 'Maximum file storage in megabytes for this workspace. Default 500 MB (free tier).';



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_session_key_key" UNIQUE ("session_key");



ALTER TABLE ONLY "public"."ai_memory"
    ADD CONSTRAINT "ai_memory_pkey" PRIMARY KEY ("conversation_id", "key");



ALTER TABLE ONLY "public"."ai_messages"
    ADD CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_run_logs"
    ADD CONSTRAINT "ai_run_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_skills"
    ADD CONSTRAINT "ai_skills_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."ai_skills"
    ADD CONSTRAINT "ai_skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_calibrations"
    ADD CONSTRAINT "asset_calibrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_maintenance_events"
    ADD CONSTRAINT "asset_maintenance_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_workspace_id_asset_code_key" UNIQUE ("workspace_id", "asset_code");



ALTER TABLE ONLY "public"."attachment_tags"
    ADD CONSTRAINT "attachment_tags_pkey" PRIMARY KEY ("attachment_id", "tag_id");



ALTER TABLE ONLY "public"."attachment_versions"
    ADD CONSTRAINT "attachment_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_bucket_name_storage_path_key" UNIQUE ("bucket_name", "storage_path");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_nonces"
    ADD CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("nonce");



ALTER TABLE ONLY "public"."billing_operation_rates"
    ADD CONSTRAINT "billing_operation_rates_pkey" PRIMARY KEY ("operation");



ALTER TABLE ONLY "public"."billing_packages"
    ADD CONSTRAINT "billing_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_solana_wallets"
    ADD CONSTRAINT "custom_solana_wallets_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."embedded_solana_wallets"
    ADD CONSTRAINT "embedded_solana_wallets_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."expense_entries"
    ADD CONSTRAINT "expense_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."file_anchor_chunks"
    ADD CONSTRAINT "file_anchor_chunks_operation_id_chunk_index_key" UNIQUE ("operation_id", "chunk_index");



ALTER TABLE ONLY "public"."file_anchor_chunks"
    ADD CONSTRAINT "file_anchor_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."file_anchor_operations"
    ADD CONSTRAINT "file_anchor_operations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_workspace_id_parent_id_name_key" UNIQUE ("workspace_id", "parent_id", "name");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_workspace_id_invoice_number_key" UNIQUE ("workspace_id", "invoice_number");



ALTER TABLE ONLY "public"."job_assignment_assets"
    ADD CONSTRAINT "job_assignment_assets_assignment_id_asset_id_key" UNIQUE ("assignment_id", "asset_id");



ALTER TABLE ONLY "public"."job_assignment_assets"
    ADD CONSTRAINT "job_assignment_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_assignment_members"
    ADD CONSTRAINT "job_assignment_members_assignment_id_workspace_member_id_key" UNIQUE ("assignment_id", "workspace_member_id");



ALTER TABLE ONLY "public"."job_assignment_members"
    ADD CONSTRAINT "job_assignment_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_assignments"
    ADD CONSTRAINT "job_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_events"
    ADD CONSTRAINT "job_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."linked_wallets"
    ADD CONSTRAINT "linked_wallets_chain_address_unique" UNIQUE ("chain", "address");



ALTER TABLE ONLY "public"."linked_wallets"
    ADD CONSTRAINT "linked_wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."linked_wallets"
    ADD CONSTRAINT "linked_wallets_user_chain_address_unique" UNIQUE ("user_id", "chain", "address");



ALTER TABLE ONLY "public"."market_events"
    ADD CONSTRAINT "market_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_favorites"
    ADD CONSTRAINT "market_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_favorites"
    ADD CONSTRAINT "market_favorites_user_id_market_kind_market_id_key" UNIQUE ("user_id", "market_kind", "market_id");



ALTER TABLE ONLY "public"."market_firms"
    ADD CONSTRAINT "market_firms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_inquiries"
    ADD CONSTRAINT "market_inquiries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_job_posts"
    ADD CONSTRAINT "market_job_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_reviews"
    ADD CONSTRAINT "market_reviews_kind_item_id_author_user_id_key" UNIQUE ("kind", "item_id", "author_user_id");



ALTER TABLE ONLY "public"."market_reviews"
    ADD CONSTRAINT "market_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_saved_searches"
    ADD CONSTRAINT "market_saved_searches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_saved_searches"
    ADD CONSTRAINT "market_saved_searches_user_id_query_scope_sort_listing_cate_key" UNIQUE ("user_id", "query", "scope", "sort", "listing_category");



ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_orders"
    ADD CONSTRAINT "marketplace_orders_external_payment_ref_key" UNIQUE ("external_payment_ref");



ALTER TABLE ONLY "public"."marketplace_orders"
    ADD CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_requests"
    ADD CONSTRAINT "marketplace_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_activities"
    ADD CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_cad_drawings"
    ADD CONSTRAINT "project_cad_drawings_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."project_contacts"
    ADD CONSTRAINT "project_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_contacts"
    ADD CONSTRAINT "project_contacts_project_id_contact_id_key" UNIQUE ("project_id", "contact_id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_user_id_key" UNIQUE ("project_id", "user_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_workspace_id_code_key" UNIQUE ("workspace_id", "code");



ALTER TABLE ONLY "public"."quote_items"
    ADD CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_workspace_id_quote_number_key" UNIQUE ("workspace_id", "quote_number");



ALTER TABLE ONLY "public"."solana_market_cache"
    ADD CONSTRAINT "solana_market_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_credit_rates"
    ADD CONSTRAINT "survey_credit_rates_pkey" PRIMARY KEY ("category");



ALTER TABLE ONLY "public"."survey_deliverables"
    ADD CONSTRAINT "survey_deliverables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_deliverables"
    ADD CONSTRAINT "survey_deliverables_run_id_kind_key" UNIQUE ("run_id", "kind");



ALTER TABLE ONLY "public"."survey_runs"
    ADD CONSTRAINT "survey_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_targets"
    ADD CONSTRAINT "survey_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_targets"
    ADD CONSTRAINT "survey_targets_run_id_category_rank_key" UNIQUE ("run_id", "category", "rank");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_workspace_id_name_key" UNIQUE ("workspace_id", "name");



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_booking_events"
    ADD CONSTRAINT "transport_booking_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_bookings"
    ADD CONSTRAINT "transport_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_bookings"
    ADD CONSTRAINT "transport_bookings_tracking_code_key" UNIQUE ("tracking_code");



ALTER TABLE ONLY "public"."transport_checkpoints"
    ADD CONSTRAINT "transport_checkpoints_departure_id_sequence_key" UNIQUE ("departure_id", "sequence");



ALTER TABLE ONLY "public"."transport_checkpoints"
    ADD CONSTRAINT "transport_checkpoints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_cities"
    ADD CONSTRAINT "transport_cities_name_country_key" UNIQUE ("name", "country");



ALTER TABLE ONLY "public"."transport_cities"
    ADD CONSTRAINT "transport_cities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_departures"
    ADD CONSTRAINT "transport_departures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_route_stops"
    ADD CONSTRAINT "transport_route_stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_route_stops"
    ADD CONSTRAINT "transport_route_stops_route_id_sequence_key" UNIQUE ("route_id", "sequence");



ALTER TABLE ONLY "public"."transport_routes"
    ADD CONSTRAINT "transport_routes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."transport_routes"
    ADD CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_vehicle_classes"
    ADD CONSTRAINT "transport_vehicle_classes_label_key" UNIQUE ("label");



ALTER TABLE ONLY "public"."transport_vehicle_classes"
    ADD CONSTRAINT "transport_vehicle_classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_vehicles"
    ADD CONSTRAINT "transport_vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_vehicles"
    ADD CONSTRAINT "transport_vehicles_plate_key" UNIQUE ("plate");



ALTER TABLE ONLY "public"."workspace_ai_credit_accounts"
    ADD CONSTRAINT "workspace_ai_credit_accounts_pkey" PRIMARY KEY ("workspace_id");



ALTER TABLE ONLY "public"."workspace_ai_credit_transactions"
    ADD CONSTRAINT "workspace_ai_credit_transacti_workspace_id_kind_operation_i_key" UNIQUE ("workspace_id", "kind", "operation_id");



ALTER TABLE ONLY "public"."workspace_ai_credit_transactions"
    ADD CONSTRAINT "workspace_ai_credit_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_ai_providers"
    ADD CONSTRAINT "workspace_ai_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_ai_providers"
    ADD CONSTRAINT "workspace_ai_providers_workspace_id_tag_key" UNIQUE ("workspace_id", "tag");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_invitation_token_key" UNIQUE ("invitation_token");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_workspace_id_email_key" UNIQUE ("workspace_id", "email");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_user_id_key" UNIQUE ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."workspace_pesepay_transactions"
    ADD CONSTRAINT "workspace_pesepay_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_pesepay_wallets"
    ADD CONSTRAINT "workspace_pesepay_wallets_id_workspace_id_user_id_key" UNIQUE ("id", "workspace_id", "user_id");



ALTER TABLE ONLY "public"."workspace_pesepay_wallets"
    ADD CONSTRAINT "workspace_pesepay_wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_pesepay_wallets"
    ADD CONSTRAINT "workspace_pesepay_wallets_workspace_id_user_id_key" UNIQUE ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."workspace_settings"
    ADD CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("workspace_id");



ALTER TABLE ONLY "public"."workspace_storage_purchases"
    ADD CONSTRAINT "workspace_storage_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_slug_key" UNIQUE ("slug");



CREATE UNIQUE INDEX IF NOT EXISTS "attachments_chain_tx_signature_key" ON "public"."attachments" USING "btree" ("chain_tx_signature") WHERE ("chain_tx_signature" IS NOT NULL);



CREATE INDEX IF NOT EXISTS "auth_nonces_expiry_idx" ON "public"."auth_nonces" USING "btree" ("expires_at");



CREATE INDEX IF NOT EXISTS "file_anchor_chunks_operation_idx" ON "public"."file_anchor_chunks" USING "btree" ("operation_id", "chunk_index");



CREATE INDEX IF NOT EXISTS "file_anchor_operations_attachment_idx" ON "public"."file_anchor_operations" USING "btree" ("attachment_id", "created_at" DESC);



CREATE UNIQUE INDEX IF NOT EXISTS "file_anchor_operations_signature_idx" ON "public"."file_anchor_operations" USING "btree" ("tx_signature") WHERE ("tx_signature" IS NOT NULL);



CREATE INDEX IF NOT EXISTS "file_anchor_operations_workspace_created_idx" ON "public"."file_anchor_operations" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX IF NOT EXISTS "idx_ai_conversations_user_updated" ON "public"."ai_conversations" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX IF NOT EXISTS "idx_ai_conversations_user_updated_context" ON "public"."ai_conversations" USING "btree" ("user_id", "context", "updated_at" DESC);



CREATE INDEX IF NOT EXISTS "idx_ai_memory_conversation_updated" ON "public"."ai_memory" USING "btree" ("conversation_id", "updated_at" DESC);



CREATE INDEX IF NOT EXISTS "idx_ai_messages_conversation_created" ON "public"."ai_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX IF NOT EXISTS "idx_ai_run_logs_conversation" ON "public"."ai_run_logs" USING "btree" ("conversation_id", "started_at" DESC);



CREATE INDEX IF NOT EXISTS "idx_ai_run_logs_user_started" ON "public"."ai_run_logs" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX IF NOT EXISTS "idx_ai_skills_active" ON "public"."ai_skills" USING "btree" ("active", "updated_at" DESC);



CREATE INDEX IF NOT EXISTS "idx_asset_calibrations_asset_id" ON "public"."asset_calibrations" USING "btree" ("asset_id");



CREATE INDEX IF NOT EXISTS "idx_asset_calibrations_workspace_updated" ON "public"."asset_calibrations" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_asset_maintenance_events_workspace_updated" ON "public"."asset_maintenance_events" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_assets_workspace_kind_status" ON "public"."assets" USING "btree" ("workspace_id", "kind", "status");



CREATE INDEX IF NOT EXISTS "idx_assets_workspace_updated" ON "public"."assets" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_attachment_tags_tag_id" ON "public"."attachment_tags" USING "btree" ("tag_id");



CREATE INDEX IF NOT EXISTS "idx_attachment_versions_attachment_id" ON "public"."attachment_versions" USING "btree" ("attachment_id", "created_at" DESC);



CREATE INDEX IF NOT EXISTS "idx_attachment_versions_workspace_id" ON "public"."attachment_versions" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_attachments_deleted_at" ON "public"."attachments" USING "btree" ("workspace_id", "deleted_at");



CREATE INDEX IF NOT EXISTS "idx_attachments_entity" ON "public"."attachments" USING "btree" ("workspace_id", "entity_table", "entity_id");



CREATE INDEX IF NOT EXISTS "idx_attachments_folder_id" ON "public"."attachments" USING "btree" ("folder_id");



CREATE INDEX IF NOT EXISTS "idx_attachments_updated_at" ON "public"."attachments" USING "btree" ("workspace_id", "updated_at" DESC);



CREATE INDEX IF NOT EXISTS "idx_attachments_workspace_chain_status" ON "public"."attachments" USING "btree" ("workspace_id", "chain_status");



CREATE INDEX IF NOT EXISTS "idx_chat_messages_workspace_created" ON "public"."chat_messages" USING "btree" ("workspace_id", "created_at" DESC, "id" DESC);



CREATE INDEX IF NOT EXISTS "idx_contacts_workspace_id" ON "public"."contacts" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_contacts_workspace_updated" ON "public"."contacts" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_embedded_solana_wallets_address" ON "public"."embedded_solana_wallets" USING "btree" ("wallet_address");



CREATE INDEX IF NOT EXISTS "idx_expense_entries_workspace_updated" ON "public"."expense_entries" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_expense_entries_workspace_user_date" ON "public"."expense_entries" USING "btree" ("workspace_id", "user_id", "entry_date" DESC);



CREATE INDEX IF NOT EXISTS "idx_folders_parent_id" ON "public"."folders" USING "btree" ("parent_id");



CREATE INDEX IF NOT EXISTS "idx_folders_workspace_id" ON "public"."folders" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_invoices_due_date" ON "public"."invoices" USING "btree" ("due_date");



CREATE INDEX IF NOT EXISTS "idx_invoices_workspace_status" ON "public"."invoices" USING "btree" ("workspace_id", "status");



CREATE INDEX IF NOT EXISTS "idx_job_assignment_assets_workspace_updated" ON "public"."job_assignment_assets" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_job_assignment_members_workspace_updated" ON "public"."job_assignment_members" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_job_assignments_workspace_date" ON "public"."job_assignments" USING "btree" ("workspace_id", "assignment_date");



CREATE INDEX IF NOT EXISTS "idx_job_assignments_workspace_updated" ON "public"."job_assignments" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_job_events_workspace_date" ON "public"."job_events" USING "btree" ("workspace_id", "event_date");



CREATE INDEX IF NOT EXISTS "idx_job_events_workspace_updated" ON "public"."job_events" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_jobs_workspace_id" ON "public"."jobs" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_jobs_workspace_status" ON "public"."jobs" USING "btree" ("workspace_id", "status");



CREATE INDEX IF NOT EXISTS "idx_jobs_workspace_updated" ON "public"."jobs" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_marketplace_listings_workspace_id" ON "public"."marketplace_listings" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_marketplace_orders_buyer" ON "public"."marketplace_orders" USING "btree" ("buyer_workspace_id");



CREATE INDEX IF NOT EXISTS "idx_marketplace_orders_listing" ON "public"."marketplace_orders" USING "btree" ("listing_id");



CREATE INDEX IF NOT EXISTS "idx_marketplace_requests_listing" ON "public"."marketplace_requests" USING "btree" ("listing_id");



CREATE INDEX IF NOT EXISTS "idx_marketplace_requests_requester" ON "public"."marketplace_requests" USING "btree" ("requester_workspace_id");



CREATE INDEX IF NOT EXISTS "idx_notifications_user_status" ON "public"."notifications" USING "btree" ("user_id", "status");



CREATE INDEX IF NOT EXISTS "idx_organizations_workspace_id" ON "public"."organizations" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_organizations_workspace_updated" ON "public"."organizations" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_payment_methods_workspace" ON "public"."payment_methods" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_payments_invoice_id" ON "public"."payments" USING "btree" ("invoice_id");



CREATE INDEX IF NOT EXISTS "idx_portfolio_items_professional_id" ON "public"."portfolio_items" USING "btree" ("professional_id");



CREATE INDEX IF NOT EXISTS "idx_portfolio_items_workspace_id" ON "public"."portfolio_items" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_professionals_workspace_id" ON "public"."professionals" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_project_activities_project_id" ON "public"."project_activities" USING "btree" ("project_id");



CREATE INDEX IF NOT EXISTS "idx_project_cad_drawings_workspace_id" ON "public"."project_cad_drawings" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_projects_workspace_id" ON "public"."projects" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_projects_workspace_status" ON "public"."projects" USING "btree" ("workspace_id", "status");



CREATE INDEX IF NOT EXISTS "idx_projects_workspace_updated" ON "public"."projects" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_quotes_workspace_status" ON "public"."quotes" USING "btree" ("workspace_id", "status");



CREATE INDEX IF NOT EXISTS "idx_tags_workspace_id" ON "public"."tags" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_time_entries_workspace_updated" ON "public"."time_entries" USING "btree" ("workspace_id", "updated_at", "id");



CREATE INDEX IF NOT EXISTS "idx_time_entries_workspace_user_date" ON "public"."time_entries" USING "btree" ("workspace_id", "user_id", "entry_date" DESC);



CREATE INDEX IF NOT EXISTS "idx_workspace_ai_providers_workspace" ON "public"."workspace_ai_providers" USING "btree" ("workspace_id", "sort_order");



CREATE INDEX IF NOT EXISTS "idx_workspace_invitations_email" ON "public"."workspace_invitations" USING "btree" ("lower"("email"));



CREATE INDEX IF NOT EXISTS "idx_workspace_invitations_workspace_id" ON "public"."workspace_invitations" USING "btree" ("workspace_id");



CREATE INDEX IF NOT EXISTS "idx_workspace_members_user_id" ON "public"."workspace_members" USING "btree" ("user_id");



CREATE INDEX IF NOT EXISTS "idx_workspace_members_workspace_id" ON "public"."workspace_members" USING "btree" ("workspace_id");



CREATE UNIQUE INDEX IF NOT EXISTS "invoices_pesepay_reference_idx" ON "public"."invoices" USING "btree" ("pesepay_reference") WHERE ("pesepay_reference" IS NOT NULL);



CREATE INDEX IF NOT EXISTS "linked_wallets_user_id_idx" ON "public"."linked_wallets" USING "btree" ("user_id");



CREATE INDEX IF NOT EXISTS "market_inquiries_item_idx" ON "public"."market_inquiries" USING "btree" ("kind", "item_id", "created_at" DESC);



CREATE INDEX IF NOT EXISTS "market_inquiries_requester_idx" ON "public"."market_inquiries" USING "btree" ("requester_user_id", "created_at" DESC);



CREATE INDEX IF NOT EXISTS "market_reviews_item_idx" ON "public"."market_reviews" USING "btree" ("kind", "item_id", "created_at" DESC);



CREATE UNIQUE INDEX IF NOT EXISTS "payments_reference_idx" ON "public"."payments" USING "btree" ("reference") WHERE ("reference" IS NOT NULL);



CREATE UNIQUE INDEX IF NOT EXISTS "payments_tx_signature_key" ON "public"."payments" USING "btree" ("tx_signature") WHERE ("tx_signature" IS NOT NULL);



CREATE INDEX IF NOT EXISTS "survey_deliverables_workspace_idx" ON "public"."survey_deliverables" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX IF NOT EXISTS "survey_runs_claim_idx" ON "public"."survey_runs" USING "btree" ("created_at") WHERE ("status" = ANY (ARRAY['queued'::"text", 'acquiring'::"text", 'surveying'::"text", 'publishing'::"text"]));



CREATE INDEX IF NOT EXISTS "survey_runs_job_id_idx" ON "public"."survey_runs" USING "btree" ("job_id");



CREATE INDEX IF NOT EXISTS "survey_runs_workspace_created_idx" ON "public"."survey_runs" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX IF NOT EXISTS "survey_targets_run_category_idx" ON "public"."survey_targets" USING "btree" ("run_id", "category", "rank");



CREATE INDEX IF NOT EXISTS "survey_targets_workspace_idx" ON "public"."survey_targets" USING "btree" ("workspace_id", "category");



CREATE INDEX IF NOT EXISTS "transport_booking_events_booking_idx" ON "public"."transport_booking_events" USING "btree" ("booking_id", "at");



CREATE INDEX IF NOT EXISTS "transport_bookings_departure_idx" ON "public"."transport_bookings" USING "btree" ("departure_id", "status");



CREATE INDEX IF NOT EXISTS "transport_bookings_workspace_idx" ON "public"."transport_bookings" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX IF NOT EXISTS "transport_departures_open_idx" ON "public"."transport_departures" USING "btree" ("status", "booking_cutoff_at");



CREATE INDEX IF NOT EXISTS "transport_departures_route_idx" ON "public"."transport_departures" USING "btree" ("route_id", "planned_departure_at" DESC);



CREATE INDEX IF NOT EXISTS "workspace_ai_credit_transactions_workspace_created_idx" ON "public"."workspace_ai_credit_transactions" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX IF NOT EXISTS "workspace_pesepay_transactions_created_idx" ON "public"."workspace_pesepay_transactions" USING "btree" ("workspace_id", "created_at" DESC, "id");



CREATE UNIQUE INDEX IF NOT EXISTS "workspace_pesepay_transactions_reference_idx" ON "public"."workspace_pesepay_transactions" USING "btree" ("pesepay_reference") WHERE ("pesepay_reference" IS NOT NULL);



CREATE INDEX IF NOT EXISTS "workspace_pesepay_transactions_user_created_idx" ON "public"."workspace_pesepay_transactions" USING "btree" ("workspace_id", "user_id", "created_at" DESC);



CREATE INDEX IF NOT EXISTS "workspace_storage_purchases_active_idx" ON "public"."workspace_storage_purchases" USING "btree" ("workspace_id", "starts_at", "expires_at") WHERE ("included_in_base_quota" = false);



CREATE INDEX IF NOT EXISTS "workspace_storage_purchases_workspace_created_idx" ON "public"."workspace_storage_purchases" USING "btree" ("workspace_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "attachments_updated_at" BEFORE UPDATE ON "public"."attachments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();






CREATE OR REPLACE TRIGGER "enforce_business_workspace_on_job_assignment_assets" BEFORE INSERT OR UPDATE ON "public"."job_assignment_assets" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_business_workspace_for_team_and_dispatch"();



CREATE OR REPLACE TRIGGER "enforce_business_workspace_on_job_assignment_members" BEFORE INSERT OR UPDATE ON "public"."job_assignment_members" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_business_workspace_for_team_and_dispatch"();



CREATE OR REPLACE TRIGGER "enforce_business_workspace_on_job_assignments" BEFORE INSERT OR UPDATE ON "public"."job_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_business_workspace_for_team_and_dispatch"();



CREATE OR REPLACE TRIGGER "enforce_business_workspace_on_job_events" BEFORE INSERT OR UPDATE ON "public"."job_events" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_business_workspace_for_team_and_dispatch"();



CREATE OR REPLACE TRIGGER "enforce_business_workspace_on_workspace_invitations" BEFORE INSERT OR UPDATE ON "public"."workspace_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_business_workspace_for_team_and_dispatch"();









CREATE OR REPLACE TRIGGER "folders_updated_at" BEFORE UPDATE ON "public"."folders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();





















CREATE OR REPLACE TRIGGER "set_updated_at_asset_calibrations" BEFORE UPDATE ON "public"."asset_calibrations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_asset_maintenance_events" BEFORE UPDATE ON "public"."asset_maintenance_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_assets" BEFORE UPDATE ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_contacts" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_expense_entries" BEFORE UPDATE ON "public"."expense_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_invoice_items" BEFORE UPDATE ON "public"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_invoices" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_job_assignment_assets" BEFORE UPDATE ON "public"."job_assignment_assets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_job_assignment_members" BEFORE UPDATE ON "public"."job_assignment_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_job_assignments" BEFORE UPDATE ON "public"."job_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_job_events" BEFORE UPDATE ON "public"."job_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_jobs" BEFORE UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_organizations" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_payments" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_projects" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_quote_items" BEFORE UPDATE ON "public"."quote_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_quotes" BEFORE UPDATE ON "public"."quotes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_time_entries" BEFORE UPDATE ON "public"."time_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_workspace_members" BEFORE UPDATE ON "public"."workspace_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_workspace_settings" BEFORE UPDATE ON "public"."workspace_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_workspaces" BEFORE UPDATE ON "public"."workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ensure_project_creator_member" AFTER INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_project_creator_member"();






CREATE OR REPLACE TRIGGER "trg_touch_project_cad_drawings" BEFORE UPDATE ON "public"."project_cad_drawings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_project_cad_drawings"();



CREATE OR REPLACE TRIGGER "trg_validate_payment" BEFORE INSERT OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_payment"();









ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_memory"
    ADD CONSTRAINT "ai_memory_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_messages"
    ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_messages"
    ADD CONSTRAINT "ai_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_run_logs"
    ADD CONSTRAINT "ai_run_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_run_logs"
    ADD CONSTRAINT "ai_run_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_calibrations"
    ADD CONSTRAINT "asset_calibrations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_calibrations"
    ADD CONSTRAINT "asset_calibrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_calibrations"
    ADD CONSTRAINT "asset_calibrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_maintenance_events"
    ADD CONSTRAINT "asset_maintenance_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_maintenance_events"
    ADD CONSTRAINT "asset_maintenance_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_maintenance_events"
    ADD CONSTRAINT "asset_maintenance_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachment_tags"
    ADD CONSTRAINT "attachment_tags_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachment_tags"
    ADD CONSTRAINT "attachment_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachment_versions"
    ADD CONSTRAINT "attachment_versions_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachment_versions"
    ADD CONSTRAINT "attachment_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attachment_versions"
    ADD CONSTRAINT "attachment_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_anchor_operation_id_fkey" FOREIGN KEY ("anchor_operation_id") REFERENCES "public"."file_anchor_operations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auth_nonces"
    ADD CONSTRAINT "auth_nonces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_solana_wallets"
    ADD CONSTRAINT "custom_solana_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."embedded_solana_wallets"
    ADD CONSTRAINT "embedded_solana_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_entries"
    ADD CONSTRAINT "expense_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expense_entries"
    ADD CONSTRAINT "expense_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_entries"
    ADD CONSTRAINT "expense_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_anchor_chunks"
    ADD CONSTRAINT "file_anchor_chunks_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "public"."file_anchor_operations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_anchor_chunks"
    ADD CONSTRAINT "file_anchor_chunks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_anchor_operations"
    ADD CONSTRAINT "file_anchor_operations_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_anchor_operations"
    ADD CONSTRAINT "file_anchor_operations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."file_anchor_operations"
    ADD CONSTRAINT "file_anchor_operations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_assignment_assets"
    ADD CONSTRAINT "job_assignment_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_assignment_assets"
    ADD CONSTRAINT "job_assignment_assets_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."job_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_assignment_assets"
    ADD CONSTRAINT "job_assignment_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_assignment_members"
    ADD CONSTRAINT "job_assignment_members_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."job_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_assignment_members"
    ADD CONSTRAINT "job_assignment_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_assignment_members"
    ADD CONSTRAINT "job_assignment_members_workspace_member_id_fkey" FOREIGN KEY ("workspace_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_assignments"
    ADD CONSTRAINT "job_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_assignments"
    ADD CONSTRAINT "job_assignments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_assignments"
    ADD CONSTRAINT "job_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_assignments"
    ADD CONSTRAINT "job_assignments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_events"
    ADD CONSTRAINT "job_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_events"
    ADD CONSTRAINT "job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_events"
    ADD CONSTRAINT "job_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_events"
    ADD CONSTRAINT "job_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."linked_wallets"
    ADD CONSTRAINT "linked_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_events"
    ADD CONSTRAINT "market_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_favorites"
    ADD CONSTRAINT "market_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_firms"
    ADD CONSTRAINT "market_firms_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_inquiries"
    ADD CONSTRAINT "market_inquiries_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_inquiries"
    ADD CONSTRAINT "market_inquiries_requester_workspace_id_fkey" FOREIGN KEY ("requester_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."market_job_posts"
    ADD CONSTRAINT "market_job_posts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_reviews"
    ADD CONSTRAINT "market_reviews_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_saved_searches"
    ADD CONSTRAINT "market_saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_orders"
    ADD CONSTRAINT "marketplace_orders_buyer_workspace_id_fkey" FOREIGN KEY ("buyer_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_orders"
    ADD CONSTRAINT "marketplace_orders_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."marketplace_orders"
    ADD CONSTRAINT "marketplace_orders_listing_workspace_id_fkey" FOREIGN KEY ("listing_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_requests"
    ADD CONSTRAINT "marketplace_requests_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_requests"
    ADD CONSTRAINT "marketplace_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_requests"
    ADD CONSTRAINT "marketplace_requests_requester_workspace_id_fkey" FOREIGN KEY ("requester_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_default_workspace_id_fkey" FOREIGN KEY ("default_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_activities"
    ADD CONSTRAINT "project_activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_activities"
    ADD CONSTRAINT "project_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_cad_drawings"
    ADD CONSTRAINT "project_cad_drawings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_cad_drawings"
    ADD CONSTRAINT "project_cad_drawings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_cad_drawings"
    ADD CONSTRAINT "project_cad_drawings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_contacts"
    ADD CONSTRAINT "project_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_contacts"
    ADD CONSTRAINT "project_contacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_contacts"
    ADD CONSTRAINT "project_contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quote_items"
    ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quote_items"
    ADD CONSTRAINT "quote_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_deliverables"
    ADD CONSTRAINT "survey_deliverables_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."survey_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_deliverables"
    ADD CONSTRAINT "survey_deliverables_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_runs"
    ADD CONSTRAINT "survey_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."survey_runs"
    ADD CONSTRAINT "survey_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_runs"
    ADD CONSTRAINT "survey_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_targets"
    ADD CONSTRAINT "survey_targets_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."survey_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_targets"
    ADD CONSTRAINT "survey_targets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transport_booking_events"
    ADD CONSTRAINT "transport_booking_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transport_booking_events"
    ADD CONSTRAINT "transport_booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."transport_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transport_bookings"
    ADD CONSTRAINT "transport_bookings_departure_fkey" FOREIGN KEY ("departure_id") REFERENCES "public"."transport_departures"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transport_bookings"
    ADD CONSTRAINT "transport_bookings_dropoff_city_id_fkey" FOREIGN KEY ("dropoff_city_id") REFERENCES "public"."transport_cities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transport_bookings"
    ADD CONSTRAINT "transport_bookings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transport_bookings"
    ADD CONSTRAINT "transport_bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transport_bookings"
    ADD CONSTRAINT "transport_bookings_pickup_city_id_fkey" FOREIGN KEY ("pickup_city_id") REFERENCES "public"."transport_cities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transport_bookings"
    ADD CONSTRAINT "transport_bookings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transport_checkpoints"
    ADD CONSTRAINT "transport_checkpoints_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."transport_cities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transport_checkpoints"
    ADD CONSTRAINT "transport_checkpoints_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "public"."transport_departures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transport_checkpoints"
    ADD CONSTRAINT "transport_checkpoints_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transport_departures"
    ADD CONSTRAINT "transport_departures_private_booking_id_fkey" FOREIGN KEY ("private_booking_id") REFERENCES "public"."transport_bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transport_departures"
    ADD CONSTRAINT "transport_departures_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transport_departures"
    ADD CONSTRAINT "transport_departures_vehicle_class_id_fkey" FOREIGN KEY ("vehicle_class_id") REFERENCES "public"."transport_vehicle_classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transport_departures"
    ADD CONSTRAINT "transport_departures_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."transport_vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transport_route_stops"
    ADD CONSTRAINT "transport_route_stops_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."transport_cities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transport_route_stops"
    ADD CONSTRAINT "transport_route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transport_routes"
    ADD CONSTRAINT "transport_routes_destination_city_id_fkey" FOREIGN KEY ("destination_city_id") REFERENCES "public"."transport_cities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transport_routes"
    ADD CONSTRAINT "transport_routes_origin_city_id_fkey" FOREIGN KEY ("origin_city_id") REFERENCES "public"."transport_cities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transport_vehicles"
    ADD CONSTRAINT "transport_vehicles_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."transport_vehicle_classes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transport_vehicles"
    ADD CONSTRAINT "transport_vehicles_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transport_vehicles"
    ADD CONSTRAINT "transport_vehicles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_ai_credit_accounts"
    ADD CONSTRAINT "workspace_ai_credit_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_ai_credit_transactions"
    ADD CONSTRAINT "workspace_ai_credit_transactions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_ai_credit_transactions"
    ADD CONSTRAINT "workspace_ai_credit_transactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_ai_providers"
    ADD CONSTRAINT "workspace_ai_providers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_pesepay_transactions"
    ADD CONSTRAINT "workspace_pesepay_transaction_wallet_id_workspace_id_user__fkey" FOREIGN KEY ("wallet_id", "workspace_id", "user_id") REFERENCES "public"."workspace_pesepay_wallets"("id", "workspace_id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_pesepay_transactions"
    ADD CONSTRAINT "workspace_pesepay_transactions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."billing_packages"("id");



ALTER TABLE ONLY "public"."workspace_pesepay_transactions"
    ADD CONSTRAINT "workspace_pesepay_transactions_refunded_by_fkey" FOREIGN KEY ("refunded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_pesepay_wallets"
    ADD CONSTRAINT "workspace_pesepay_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_pesepay_wallets"
    ADD CONSTRAINT "workspace_pesepay_wallets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_settings"
    ADD CONSTRAINT "workspace_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_storage_purchases"
    ADD CONSTRAINT "workspace_storage_purchases_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."billing_packages"("id");



ALTER TABLE ONLY "public"."workspace_storage_purchases"
    ADD CONSTRAINT "workspace_storage_purchases_purchased_by_fkey" FOREIGN KEY ("purchased_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_storage_purchases"
    ADD CONSTRAINT "workspace_storage_purchases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;







































ALTER TABLE "public"."ai_conversations" ENABLE ROW LEVEL SECURITY;














ALTER TABLE "public"."ai_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_messages" ENABLE ROW LEVEL SECURITY;











ALTER TABLE "public"."ai_run_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_skills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asset_calibrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_calibrations_manage_member" ON "public"."asset_calibrations" TO "authenticated" USING ("public"."can_manage_assets"("workspace_id")) WITH CHECK ("public"."can_manage_assets"("workspace_id"));



CREATE POLICY "asset_calibrations_select_member" ON "public"."asset_calibrations" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."asset_maintenance_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_maintenance_manage_member" ON "public"."asset_maintenance_events" TO "authenticated" USING ("public"."can_manage_assets"("workspace_id")) WITH CHECK ("public"."can_manage_assets"("workspace_id"));



CREATE POLICY "asset_maintenance_select_member" ON "public"."asset_maintenance_events" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assets_delete_manager" ON "public"."assets" FOR DELETE TO "authenticated" USING ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "assets_manage_member" ON "public"."assets" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_assets"("workspace_id"));



CREATE POLICY "assets_select_member" ON "public"."assets" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "assets_update_member" ON "public"."assets" FOR UPDATE TO "authenticated" USING ("public"."can_manage_assets"("workspace_id")) WITH CHECK ("public"."can_manage_assets"("workspace_id"));



ALTER TABLE "public"."attachment_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attachment_tags_manage_member" ON "public"."attachment_tags" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."attachments" "a"
  WHERE (("a"."id" = "attachment_tags"."attachment_id") AND "public"."can_manage_documents"("a"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."attachments" "a"
  WHERE (("a"."id" = "attachment_tags"."attachment_id") AND "public"."can_manage_documents"("a"."workspace_id")))));



CREATE POLICY "attachment_tags_select_member" ON "public"."attachment_tags" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."attachments" "a"
  WHERE (("a"."id" = "attachment_tags"."attachment_id") AND "public"."is_workspace_member"("a"."workspace_id")))));



ALTER TABLE "public"."attachment_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attachment_versions_manage_member" ON "public"."attachment_versions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."attachments" "a"
  WHERE (("a"."id" = "attachment_versions"."attachment_id") AND "public"."can_manage_documents"("a"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."attachments" "a"
  WHERE (("a"."id" = "attachment_versions"."attachment_id") AND "public"."can_manage_documents"("a"."workspace_id")))));



CREATE POLICY "attachment_versions_select_member" ON "public"."attachment_versions" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attachments_delete_member" ON "public"."attachments" FOR DELETE TO "authenticated" USING ("public"."can_manage_documents"("workspace_id"));



CREATE POLICY "attachments_manage_member" ON "public"."attachments" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_documents"("workspace_id"));



CREATE POLICY "attachments_select_member_or_public" ON "public"."attachments" FOR SELECT TO "authenticated" USING ((("visibility" = 'public'::"public"."attachment_visibility") OR "public"."is_workspace_member"("workspace_id")));



CREATE POLICY "attachments_update_member" ON "public"."attachments" FOR UPDATE TO "authenticated" USING ("public"."can_manage_documents"("workspace_id")) WITH CHECK ("public"."can_manage_documents"("workspace_id"));



ALTER TABLE "public"."auth_nonces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_operation_rates" ENABLE ROW LEVEL SECURITY;





ALTER TABLE "public"."billing_packages" ENABLE ROW LEVEL SECURITY;





ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_messages_delete_moderator" ON "public"."chat_messages" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_manage_workspace"("workspace_id")));



CREATE POLICY "chat_messages_insert_self" ON "public"."chat_messages" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."is_workspace_member"("workspace_id")));



CREATE POLICY "chat_messages_select_member" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_delete_manager" ON "public"."contacts" FOR DELETE TO "authenticated" USING ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "contacts_manage_member" ON "public"."contacts" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_sales"("workspace_id") OR "public"."can_manage_workspace"("workspace_id")));



CREATE POLICY "contacts_select_member" ON "public"."contacts" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "contacts_update_member" ON "public"."contacts" FOR UPDATE TO "authenticated" USING (("public"."can_manage_sales"("workspace_id") OR "public"."can_manage_workspace"("workspace_id"))) WITH CHECK (("public"."can_manage_sales"("workspace_id") OR "public"."can_manage_workspace"("workspace_id")));



ALTER TABLE "public"."custom_solana_wallets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."embedded_solana_wallets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "embedded_wallets_delete_own" ON "public"."embedded_solana_wallets" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "embedded_wallets_insert_own" ON "public"."embedded_solana_wallets" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "embedded_wallets_select_own" ON "public"."embedded_solana_wallets" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "embedded_wallets_update_own" ON "public"."embedded_solana_wallets" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."expense_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_entries_delete_own" ON "public"."expense_entries" FOR DELETE TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "expense_entries_insert_own" ON "public"."expense_entries" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "expense_entries_select_member" ON "public"."expense_entries" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "expense_entries_update_own" ON "public"."expense_entries" FOR UPDATE TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") AND ("user_id" = "auth"."uid"()))) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."file_anchor_chunks" ENABLE ROW LEVEL SECURITY;











ALTER TABLE "public"."file_anchor_operations" ENABLE ROW LEVEL SECURITY;














ALTER TABLE "public"."folders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "folders_manage_member" ON "public"."folders" TO "authenticated" USING ("public"."can_manage_documents"("workspace_id")) WITH CHECK ("public"."can_manage_documents"("workspace_id"));



CREATE POLICY "folders_select_member" ON "public"."folders" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_items_manage_finance" ON "public"."invoice_items" TO "authenticated" USING ("public"."can_manage_finance"("workspace_id")) WITH CHECK ("public"."can_manage_finance"("workspace_id"));



CREATE POLICY "invoice_items_select_member" ON "public"."invoice_items" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_delete_manager" ON "public"."invoices" FOR DELETE TO "authenticated" USING ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "invoices_manage_finance" ON "public"."invoices" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_finance"("workspace_id"));



CREATE POLICY "invoices_select_member" ON "public"."invoices" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "invoices_update_finance" ON "public"."invoices" FOR UPDATE TO "authenticated" USING ("public"."can_manage_finance"("workspace_id")) WITH CHECK ("public"."can_manage_finance"("workspace_id"));



ALTER TABLE "public"."job_assignment_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_assignment_assets_manage_ops" ON "public"."job_assignment_assets" TO "authenticated" USING ("public"."can_manage_business_operations"("workspace_id")) WITH CHECK ("public"."can_manage_business_operations"("workspace_id"));



CREATE POLICY "job_assignment_assets_select_member" ON "public"."job_assignment_assets" FOR SELECT TO "authenticated" USING (("public"."is_business_workspace"("workspace_id") AND "public"."is_workspace_member"("workspace_id")));



ALTER TABLE "public"."job_assignment_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_assignment_members_manage_ops" ON "public"."job_assignment_members" TO "authenticated" USING ("public"."can_manage_business_operations"("workspace_id")) WITH CHECK ("public"."can_manage_business_operations"("workspace_id"));



CREATE POLICY "job_assignment_members_select_member" ON "public"."job_assignment_members" FOR SELECT TO "authenticated" USING (("public"."is_business_workspace"("workspace_id") AND "public"."is_workspace_member"("workspace_id")));



ALTER TABLE "public"."job_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_assignments_manage_ops" ON "public"."job_assignments" TO "authenticated" USING ("public"."can_manage_business_operations"("workspace_id")) WITH CHECK ("public"."can_manage_business_operations"("workspace_id"));



CREATE POLICY "job_assignments_select_member" ON "public"."job_assignments" FOR SELECT TO "authenticated" USING (("public"."is_business_workspace"("workspace_id") AND "public"."is_workspace_member"("workspace_id")));



ALTER TABLE "public"."job_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_events_manage_ops" ON "public"."job_events" TO "authenticated" USING ("public"."can_manage_business_operations"("workspace_id")) WITH CHECK ("public"."can_manage_business_operations"("workspace_id"));



CREATE POLICY "job_events_select_member" ON "public"."job_events" FOR SELECT TO "authenticated" USING (("public"."is_business_workspace"("workspace_id") AND "public"."is_workspace_member"("workspace_id")));



ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;














ALTER TABLE "public"."linked_wallets" ENABLE ROW LEVEL SECURITY;








ALTER TABLE "public"."market_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."market_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."market_firms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."market_inquiries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."market_job_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."market_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."market_saved_searches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_listings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marketplace_listings_delete_permitted" ON "public"."marketplace_listings" FOR DELETE TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."can_manage_workspace"("workspace_id")));



CREATE POLICY "marketplace_listings_insert_permitted" ON "public"."marketplace_listings" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_platform_admin"() OR (("is_global" = false) AND "public"."can_manage_workspace"("workspace_id"))));



CREATE POLICY "marketplace_listings_select_member" ON "public"."marketplace_listings" FOR SELECT TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") OR "is_global" OR "public"."is_platform_admin"()));



CREATE POLICY "marketplace_listings_update_permitted" ON "public"."marketplace_listings" FOR UPDATE TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."can_manage_workspace"("workspace_id"))) WITH CHECK (("public"."is_platform_admin"() OR (("is_global" = false) AND "public"."can_manage_workspace"("workspace_id"))));



ALTER TABLE "public"."marketplace_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marketplace_orders_select_participant" ON "public"."marketplace_orders" FOR SELECT TO "authenticated" USING (("public"."is_workspace_member"("buyer_workspace_id") OR "public"."is_workspace_member"("listing_workspace_id")));



ALTER TABLE "public"."marketplace_requests" ENABLE ROW LEVEL SECURITY;











ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_insert_workspace_member" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_workspace_member"("workspace_id") AND (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "recipient"
  WHERE (("recipient"."workspace_id" = "notifications"."workspace_id") AND ("recipient"."user_id" = "notifications"."user_id") AND ("recipient"."status" = ANY (ARRAY['active'::"public"."workspace_member_status", 'invited'::"public"."workspace_member_status"])))))));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_delete_manager" ON "public"."organizations" FOR DELETE TO "authenticated" USING ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "organizations_manage_member" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_sales"("workspace_id") OR "public"."can_manage_workspace"("workspace_id")));



CREATE POLICY "organizations_select_member" ON "public"."organizations" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "organizations_update_member" ON "public"."organizations" FOR UPDATE TO "authenticated" USING (("public"."can_manage_sales"("workspace_id") OR "public"."can_manage_workspace"("workspace_id"))) WITH CHECK (("public"."can_manage_sales"("workspace_id") OR "public"."can_manage_workspace"("workspace_id")));



ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_methods_delete" ON "public"."payment_methods" FOR DELETE TO "authenticated" USING (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"public"."workspace_member_role", 'admin'::"public"."workspace_member_role"]) OR "public"."is_platform_admin"()));



CREATE POLICY "payment_methods_insert" ON "public"."payment_methods" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"public"."workspace_member_role", 'admin'::"public"."workspace_member_role"]) OR "public"."is_platform_admin"()));



CREATE POLICY "payment_methods_select" ON "public"."payment_methods" FOR SELECT TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") OR "public"."is_platform_admin"()));



CREATE POLICY "payment_methods_update" ON "public"."payment_methods" FOR UPDATE TO "authenticated" USING (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"public"."workspace_member_role", 'admin'::"public"."workspace_member_role"]) OR "public"."is_platform_admin"()));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_manage_finance" ON "public"."payments" TO "authenticated" USING ("public"."can_manage_finance"("workspace_id")) WITH CHECK ("public"."can_manage_finance"("workspace_id"));



CREATE POLICY "payments_select_member" ON "public"."payments" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."portfolio_items" ENABLE ROW LEVEL SECURITY;














ALTER TABLE "public"."professionals" ENABLE ROW LEVEL SECURITY;








CREATE POLICY "professionals_select_member" ON "public"."professionals" FOR SELECT TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") OR "is_global" OR "public"."is_platform_admin"()));






ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;





CREATE POLICY "profiles_select_platform_admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "profiles_select_self_or_shared_workspace" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."shares_workspace_with_profile"("id")));



CREATE POLICY "profiles_update_platform_admin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());






ALTER TABLE "public"."project_activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_activities_delete_member" ON "public"."project_activities" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_activities"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_activities"."project_id") AND ("projects"."created_by" = "auth"."uid"()))))));



CREATE POLICY "project_activities_insert_member" ON "public"."project_activities" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_activities"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_activities"."project_id") AND ("projects"."created_by" = "auth"."uid"()))))));



CREATE POLICY "project_activities_select_member" ON "public"."project_activities" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_activities"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_activities"."project_id") AND ("projects"."created_by" = "auth"."uid"()))))));



CREATE POLICY "project_activities_update_member" ON "public"."project_activities" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_activities"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_activities"."project_id") AND ("projects"."created_by" = "auth"."uid"())))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_activities"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_activities"."project_id") AND ("projects"."created_by" = "auth"."uid"()))))));



ALTER TABLE "public"."project_cad_drawings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_cad_drawings_delete_member" ON "public"."project_cad_drawings" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_cad_drawings"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_cad_drawings"."project_id") AND ("projects"."created_by" = "auth"."uid"()))))));



CREATE POLICY "project_cad_drawings_insert_member" ON "public"."project_cad_drawings" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_cad_drawings"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_cad_drawings"."project_id") AND ("projects"."created_by" = "auth"."uid"()))))));



CREATE POLICY "project_cad_drawings_select_member" ON "public"."project_cad_drawings" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_cad_drawings"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_cad_drawings"."project_id") AND ("projects"."created_by" = "auth"."uid"()))))));



CREATE POLICY "project_cad_drawings_update_member" ON "public"."project_cad_drawings" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_cad_drawings"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_cad_drawings"."project_id") AND ("projects"."created_by" = "auth"."uid"())))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_cad_drawings"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_cad_drawings"."project_id") AND ("projects"."created_by" = "auth"."uid"()))))));



ALTER TABLE "public"."project_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_contacts_manage_ops" ON "public"."project_contacts" TO "authenticated" USING (("public"."can_manage_operations"("workspace_id") OR "public"."can_manage_sales"("workspace_id"))) WITH CHECK (("public"."can_manage_operations"("workspace_id") OR "public"."can_manage_sales"("workspace_id")));



CREATE POLICY "project_contacts_select_member" ON "public"."project_contacts" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_members_manage_ops" ON "public"."project_members" TO "authenticated" USING ("public"."can_manage_business_operations"("workspace_id")) WITH CHECK ("public"."can_manage_business_operations"("workspace_id"));



CREATE POLICY "project_members_select_member" ON "public"."project_members" FOR SELECT TO "authenticated" USING (("public"."is_business_workspace"("workspace_id") AND "public"."is_workspace_member"("workspace_id")));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete_manager" ON "public"."projects" FOR DELETE TO "authenticated" USING ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "projects_manage_ops" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_operations"("workspace_id") OR "public"."can_manage_sales"("workspace_id")));



CREATE POLICY "projects_select_member" ON "public"."projects" FOR SELECT TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") OR "public"."is_platform_admin"()));



CREATE POLICY "projects_update_ops" ON "public"."projects" FOR UPDATE TO "authenticated" USING (("public"."can_manage_operations"("workspace_id") OR "public"."can_manage_sales"("workspace_id"))) WITH CHECK (("public"."can_manage_operations"("workspace_id") OR "public"."can_manage_sales"("workspace_id")));



ALTER TABLE "public"."quote_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quote_items_manage_member" ON "public"."quote_items" TO "authenticated" USING (("public"."can_manage_sales"("workspace_id") OR "public"."can_manage_finance"("workspace_id"))) WITH CHECK (("public"."can_manage_sales"("workspace_id") OR "public"."can_manage_finance"("workspace_id")));



CREATE POLICY "quote_items_select_member" ON "public"."quote_items" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."quotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotes_delete_manager" ON "public"."quotes" FOR DELETE TO "authenticated" USING ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "quotes_manage_member" ON "public"."quotes" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_sales"("workspace_id") OR "public"."can_manage_finance"("workspace_id")));



CREATE POLICY "quotes_select_member" ON "public"."quotes" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "quotes_update_member" ON "public"."quotes" FOR UPDATE TO "authenticated" USING (("public"."can_manage_sales"("workspace_id") OR "public"."can_manage_finance"("workspace_id"))) WITH CHECK (("public"."can_manage_sales"("workspace_id") OR "public"."can_manage_finance"("workspace_id")));



ALTER TABLE "public"."solana_market_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."survey_credit_rates" ENABLE ROW LEVEL SECURITY;





ALTER TABLE "public"."survey_deliverables" ENABLE ROW LEVEL SECURITY;








ALTER TABLE "public"."survey_runs" ENABLE ROW LEVEL SECURITY;








ALTER TABLE "public"."survey_targets" ENABLE ROW LEVEL SECURITY;








ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tags_manage_member" ON "public"."tags" TO "authenticated" USING ("public"."can_manage_documents"("workspace_id")) WITH CHECK ("public"."can_manage_documents"("workspace_id"));



CREATE POLICY "tags_select_member" ON "public"."tags" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."time_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "time_entries_delete_own" ON "public"."time_entries" FOR DELETE TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "time_entries_insert_own" ON "public"."time_entries" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "time_entries_select_member" ON "public"."time_entries" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "time_entries_update_own" ON "public"."time_entries" FOR UPDATE TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") AND ("user_id" = "auth"."uid"()))) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("user_id" = "auth"."uid"())));






























ALTER TABLE "public"."transport_booking_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transport_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transport_checkpoints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transport_cities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transport_departures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transport_route_stops" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transport_routes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transport_vehicle_classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transport_vehicles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_ai_credit_accounts" ENABLE ROW LEVEL SECURITY;





ALTER TABLE "public"."workspace_ai_credit_transactions" ENABLE ROW LEVEL SECURITY;





ALTER TABLE "public"."workspace_ai_providers" ENABLE ROW LEVEL SECURITY;








ALTER TABLE "public"."workspace_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_invitations_manage_manager" ON "public"."workspace_invitations" TO "authenticated" USING ("public"."can_manage_business_workspace"("workspace_id")) WITH CHECK ("public"."can_manage_business_workspace"("workspace_id"));



CREATE POLICY "workspace_invitations_select_manager" ON "public"."workspace_invitations" FOR SELECT TO "authenticated" USING ("public"."can_manage_business_workspace"("workspace_id"));



ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_members_manage_admin" ON "public"."workspace_members" TO "authenticated" USING ("public"."can_manage_business_workspace"("workspace_id")) WITH CHECK ("public"."can_manage_business_workspace"("workspace_id"));



CREATE POLICY "workspace_members_select_member" ON "public"."workspace_members" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "workspace_members_select_platform_admin" ON "public"."workspace_members" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



ALTER TABLE "public"."workspace_pesepay_transactions" ENABLE ROW LEVEL SECURITY;





ALTER TABLE "public"."workspace_pesepay_wallets" ENABLE ROW LEVEL SECURITY;





ALTER TABLE "public"."workspace_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_settings_select_member" ON "public"."workspace_settings" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "workspace_settings_update_manager" ON "public"."workspace_settings" FOR UPDATE TO "authenticated" USING ("public"."can_manage_workspace"("workspace_id")) WITH CHECK ("public"."can_manage_workspace"("workspace_id"));



ALTER TABLE "public"."workspace_storage_purchases" ENABLE ROW LEVEL SECURITY;





ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspaces_select_member" ON "public"."workspaces" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("id"));



CREATE POLICY "workspaces_select_platform_admin" ON "public"."workspaces" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "workspaces_update_platform_admin" ON "public"."workspaces" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_workspace_invitation"("target_invitation_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_workspace_invitation"("target_invitation_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_workspace_invitation"("target_invitation_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_list_audit_log"("p_limit" integer, "p_offset" integer, "p_workspace_id" "uuid", "p_action" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_audit_log"("p_limit" integer, "p_offset" integer, "p_workspace_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_audit_log"("p_limit" integer, "p_offset" integer, "p_workspace_id" "uuid", "p_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_workspace_summary"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_workspace_summary"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_workspace_summary"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_assets"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_assets"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_assets"("target_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_business_operations"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_business_operations"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_business_operations"("target_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_business_workspace"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_business_workspace"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_business_workspace"("target_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_documents"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_documents"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_documents"("target_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_finance"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_finance"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_finance"("target_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_operations"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_operations"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_operations"("target_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_sales"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_sales"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_sales"("target_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_workspace"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_workspace"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_workspace"("target_workspace_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_survey_run"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_survey_run"("p_run_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_survey_run"("p_run_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_survey_run"("p_run_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."charge_satellite_survey"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_description" "text", "p_categories" "text"[], "p_half_deg" numeric, "p_latitude" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."charge_satellite_survey"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_description" "text", "p_categories" "text"[], "p_half_deg" numeric, "p_latitude" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_next_survey_run"("p_worker_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_next_survey_run"("p_worker_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_business_workspace"("workspace_name" "text", "workspace_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_business_workspace"("workspace_name" "text", "workspace_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_business_workspace"("workspace_name" "text", "workspace_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_survey_run"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_survey_run"("p_run_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_survey_run"("p_run_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_survey_run"("p_run_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_survey_runs_for_job"("p_workspace_id" "uuid", "p_job_id" "uuid", "p_client_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_survey_runs_for_job"("p_workspace_id" "uuid", "p_job_id" "uuid", "p_client_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_survey_runs_for_job"("p_workspace_id" "uuid", "p_job_id" "uuid", "p_client_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_survey_runs_for_job"("p_workspace_id" "uuid", "p_job_id" "uuid", "p_client_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_business_workspace_for_team_and_dispatch"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_business_workspace_for_team_and_dispatch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_business_workspace_for_team_and_dispatch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_workspace_storage_quota"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_workspace_storage_quota"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_workspace_storage_quota"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_project_creator_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_project_creator_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_project_creator_member"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fail_survey_run"("p_run_id" "uuid", "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fail_survey_run"("p_run_id" "uuid", "p_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fulfil_workspace_package_purchase"("p_transaction_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fulfil_workspace_package_purchase"("p_transaction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_database_size"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_database_size"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_database_size"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_financial_overview"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_financial_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_financial_overview"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tables_size"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_tables_size"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tables_size"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_workspace_billing_overview"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_workspace_billing_overview"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workspace_billing_overview"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_workspace_storage_usage"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_workspace_storage_usage"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workspace_storage_usage"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_workspace_role"("target_workspace_id" "uuid", "allowed_roles" "public"."workspace_member_role"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_workspace_role"("target_workspace_id" "uuid", "allowed_roles" "public"."workspace_member_role"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_workspace_role"("target_workspace_id" "uuid", "allowed_roles" "public"."workspace_member_role"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_business_workspace"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_business_workspace"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_business_workspace"("target_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_listing_seller"("target_listing_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_listing_seller"("target_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_listing_seller"("target_listing_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_email_identity"("p_user_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_email_identity"("p_user_id" "uuid", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_web3_identity"("p_user_id" "uuid", "p_chain" "text", "p_address" "text", "p_identity_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_web3_identity"("p_user_id" "uuid", "p_chain" "text", "p_address" "text", "p_identity_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_workspace_activity_log"("p_workspace_id" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_workspace_activity_log"("p_workspace_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_workspace_activity_log"("p_workspace_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_activity"("p_workspace_id" "uuid", "p_entity_table" "text", "p_entity_id" "uuid", "p_action" "text", "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_activity"("p_workspace_id" "uuid", "p_entity_table" "text", "p_entity_id" "uuid", "p_action" "text", "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_activity"("p_workspace_id" "uuid", "p_entity_table" "text", "p_entity_id" "uuid", "p_action" "text", "p_details" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."market_item_workspace"("p_kind" "text", "p_item_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."market_item_workspace"("p_kind" "text", "p_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."market_item_workspace"("p_kind" "text", "p_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."market_item_workspace"("p_kind" "text", "p_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."path_first_segment_uuid"("path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."path_first_segment_uuid"("path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."path_first_segment_uuid"("path" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_workspace_invoice_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_invoice_id" "uuid", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_workspace_invoice_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_invoice_id" "uuid", "p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_workspace_package_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_package_id" "text", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_workspace_package_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_package_id" "text", "p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_workspace_storage_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_plan_id" "text", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_workspace_storage_with_balance"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_plan_id" "text", "p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."price_satellite_survey"("p_categories" "text"[], "p_half_deg" numeric, "p_latitude" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."price_satellite_survey"("p_categories" "text"[], "p_half_deg" numeric, "p_latitude" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."price_satellite_survey"("p_categories" "text"[], "p_half_deg" numeric, "p_latitude" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."project_cad_metrics"("p_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."project_cad_metrics"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."project_cad_metrics"("p_project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_ai_credit_ledger"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_ai_credit_ledger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_ai_credit_ledger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_file_anchor_chunks"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_file_anchor_chunks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_file_anchor_chunks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_file_anchor_operations"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_file_anchor_operations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_file_anchor_operations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_auth_nonces"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_auth_nonces"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_survey_run"("p_run_id" "uuid", "p_result" "jsonb", "p_targets" "jsonb", "p_deliverables" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_survey_run"("p_run_id" "uuid", "p_result" "jsonb", "p_targets" "jsonb", "p_deliverables" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_pesepay_transaction_refund"("p_transaction_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_pesepay_transaction_refund"("p_transaction_id" "uuid", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."record_pesepay_transaction_refund"("p_transaction_id" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."refund_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refund_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remaining_signin_methods"("p_user_id" "uuid", "p_exclude_provider_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remaining_signin_methods"("p_user_id" "uuid", "p_exclude_provider_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reverse_workspace_ai_credits"("p_workspace_id" "uuid", "p_transaction_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_workspace_ai_credits"("p_workspace_id" "uuid", "p_transaction_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reverse_workspace_ai_credits"("p_workspace_id" "uuid", "p_transaction_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_custom_solana_wallet_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_custom_solana_wallet_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_custom_solana_wallet_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_default_payment_method"("p_workspace_id" "uuid", "p_method_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_default_payment_method"("p_workspace_id" "uuid", "p_method_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_default_payment_method"("p_workspace_id" "uuid", "p_method_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_default_workspace"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_default_workspace"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_default_workspace"("target_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."settle_workspace_package_purchase"("p_reference" "text", "p_amount" numeric, "p_currency_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_workspace_package_purchase"("p_reference" "text", "p_amount" numeric, "p_currency_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."settle_workspace_pesepay_deposit"("p_reference" "text", "p_amount" numeric, "p_currency_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_workspace_pesepay_deposit"("p_reference" "text", "p_amount" numeric, "p_currency_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."shares_workspace_with_profile"("target_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."shares_workspace_with_profile"("target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shares_workspace_with_profile"("target_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."slugify"("value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slugify"("value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slugify"("value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."spend_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_operation" "text", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."spend_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_operation" "text", "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."spend_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_operation" "text", "p_description" "text", "p_credits" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."spend_workspace_ai_credits"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_operation_id" "text", "p_operation" "text", "p_description" "text", "p_credits" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."survey_surface_area_km2"("p_half_deg" numeric, "p_latitude" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."survey_surface_area_km2"("p_half_deg" numeric, "p_latitude" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."survey_surface_area_km2"("p_half_deg" numeric, "p_latitude" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_project_cad_drawings"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_project_cad_drawings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_project_cad_drawings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."transport_advance_booking"("p_booking_id" "uuid", "p_to_status" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_advance_booking"("p_booking_id" "uuid", "p_to_status" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_advance_booking"("p_booking_id" "uuid", "p_to_status" "text", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transport_advance_departure"("p_departure_id" "uuid", "p_to_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_advance_departure"("p_departure_id" "uuid", "p_to_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_advance_departure"("p_departure_id" "uuid", "p_to_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transport_apply_quorum"("p_departure_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."transport_approve_load"("p_booking_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_approve_load"("p_booking_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_approve_load"("p_booking_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transport_cancel_booking"("p_booking_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_cancel_booking"("p_booking_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_cancel_booking"("p_booking_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transport_cancel_departure"("p_departure_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_cancel_departure"("p_departure_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_cancel_departure"("p_departure_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transport_confirm_fee"("p_booking_id" "uuid", "p_provider" "text", "p_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_confirm_fee"("p_booking_id" "uuid", "p_provider" "text", "p_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_confirm_fee"("p_booking_id" "uuid", "p_provider" "text", "p_reference" "text") TO "service_role";



GRANT ALL ON TABLE "public"."transport_bookings" TO "anon";
GRANT ALL ON TABLE "public"."transport_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_bookings" TO "service_role";



REVOKE ALL ON FUNCTION "public"."transport_create_booking"("p_workspace_id" "uuid", "p_departure_id" "uuid", "p_mode" "text", "p_slots" integer, "p_weight_kg" numeric, "p_contents" "text", "p_pickup_city_id" "uuid", "p_dropoff_city_id" "uuid", "p_recipient_name" "text", "p_fulfilment" "text", "p_recipient_phone" "text", "p_listing_id" "uuid", "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_create_booking"("p_workspace_id" "uuid", "p_departure_id" "uuid", "p_mode" "text", "p_slots" integer, "p_weight_kg" numeric, "p_contents" "text", "p_pickup_city_id" "uuid", "p_dropoff_city_id" "uuid", "p_recipient_name" "text", "p_fulfilment" "text", "p_recipient_phone" "text", "p_listing_id" "uuid", "p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_create_booking"("p_workspace_id" "uuid", "p_departure_id" "uuid", "p_mode" "text", "p_slots" integer, "p_weight_kg" numeric, "p_contents" "text", "p_pickup_city_id" "uuid", "p_dropoff_city_id" "uuid", "p_recipient_name" "text", "p_fulfilment" "text", "p_recipient_phone" "text", "p_listing_id" "uuid", "p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transport_direct_distance_km"("p_lat_a" numeric, "p_lng_a" numeric, "p_lat_b" numeric, "p_lng_b" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_direct_distance_km"("p_lat_a" numeric, "p_lng_a" numeric, "p_lat_b" numeric, "p_lng_b" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_direct_distance_km"("p_lat_a" numeric, "p_lng_a" numeric, "p_lat_b" numeric, "p_lng_b" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."transport_evaluate_departures"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_evaluate_departures"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_evaluate_departures"() TO "service_role";



GRANT ALL ON TABLE "public"."transport_departures" TO "anon";
GRANT ALL ON TABLE "public"."transport_departures" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_departures" TO "service_role";



REVOKE ALL ON FUNCTION "public"."transport_governing_dimension"("p_departure" "public"."transport_departures") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_governing_dimension"("p_departure" "public"."transport_departures") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_governing_dimension"("p_departure" "public"."transport_departures") TO "service_role";
GRANT ALL ON FUNCTION "public"."transport_governing_dimension"("p_departure" "public"."transport_departures") TO "anon";



REVOKE ALL ON FUNCTION "public"."transport_load_ratio"("p_departure" "public"."transport_departures") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_load_ratio"("p_departure" "public"."transport_departures") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_load_ratio"("p_departure" "public"."transport_departures") TO "service_role";
GRANT ALL ON FUNCTION "public"."transport_load_ratio"("p_departure" "public"."transport_departures") TO "anon";



REVOKE ALL ON FUNCTION "public"."transport_new_tracking_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_new_tracking_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_new_tracking_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transport_offers_for_city"("p_destination_city_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transport_offers_for_city"("p_destination_city_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."transport_record_checkpoint"("p_departure_id" "uuid", "p_city_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_record_checkpoint"("p_departure_id" "uuid", "p_city_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_record_checkpoint"("p_departure_id" "uuid", "p_city_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transport_release_capacity"("p_booking_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."transport_stop_sequence"("p_route_id" "uuid", "p_city_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transport_stop_sequence"("p_route_id" "uuid", "p_city_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transport_stop_sequence"("p_route_id" "uuid", "p_city_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unlink_email_signin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unlink_email_signin"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unlink_web3_identity"("p_user_id" "uuid", "p_chain" "text", "p_address" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unlink_web3_identity"("p_user_id" "uuid", "p_chain" "text", "p_address" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_marketplace_wallet"("p_workspace_id" "uuid", "p_address" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_marketplace_wallet"("p_workspace_id" "uuid", "p_address" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_marketplace_wallet"("p_workspace_id" "uuid", "p_address" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_survey_run_progress"("p_run_id" "uuid", "p_stage" "text", "p_progress" integer, "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_survey_run_progress"("p_run_id" "uuid", "p_stage" "text", "p_progress" integer, "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_payment"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_payment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_payment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."workspace_storage_limit_bytes"("p_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."workspace_storage_limit_bytes"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."ai_conversations" TO "anon";
GRANT ALL ON TABLE "public"."ai_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_memory" TO "anon";
GRANT ALL ON TABLE "public"."ai_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_memory" TO "service_role";



GRANT ALL ON TABLE "public"."ai_messages" TO "anon";
GRANT ALL ON TABLE "public"."ai_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_messages" TO "service_role";



GRANT ALL ON TABLE "public"."ai_run_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_run_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_run_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_skills" TO "anon";
GRANT ALL ON TABLE "public"."ai_skills" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_skills" TO "service_role";



GRANT ALL ON TABLE "public"."asset_calibrations" TO "anon";
GRANT ALL ON TABLE "public"."asset_calibrations" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_calibrations" TO "service_role";



GRANT ALL ON TABLE "public"."asset_maintenance_events" TO "anon";
GRANT ALL ON TABLE "public"."asset_maintenance_events" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_maintenance_events" TO "service_role";



GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."attachment_tags" TO "anon";
GRANT ALL ON TABLE "public"."attachment_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."attachment_tags" TO "service_role";



GRANT ALL ON TABLE "public"."attachment_versions" TO "anon";
GRANT ALL ON TABLE "public"."attachment_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."attachment_versions" TO "service_role";



GRANT ALL ON TABLE "public"."attachments" TO "anon";
GRANT ALL ON TABLE "public"."attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."attachments" TO "service_role";



GRANT ALL ON TABLE "public"."auth_nonces" TO "service_role";



GRANT ALL ON TABLE "public"."billing_operation_rates" TO "anon";
GRANT ALL ON TABLE "public"."billing_operation_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_operation_rates" TO "service_role";



GRANT ALL ON TABLE "public"."billing_packages" TO "anon";
GRANT ALL ON TABLE "public"."billing_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_packages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."custom_solana_wallets" TO "anon";
GRANT ALL ON TABLE "public"."custom_solana_wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_solana_wallets" TO "service_role";



GRANT ALL ON TABLE "public"."embedded_solana_wallets" TO "anon";
GRANT ALL ON TABLE "public"."embedded_solana_wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."embedded_solana_wallets" TO "service_role";



GRANT ALL ON TABLE "public"."expense_entries" TO "anon";
GRANT ALL ON TABLE "public"."expense_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_entries" TO "service_role";



GRANT ALL ON TABLE "public"."file_anchor_chunks" TO "anon";
GRANT ALL ON TABLE "public"."file_anchor_chunks" TO "authenticated";
GRANT ALL ON TABLE "public"."file_anchor_chunks" TO "service_role";



GRANT ALL ON TABLE "public"."file_anchor_operations" TO "anon";
GRANT ALL ON TABLE "public"."file_anchor_operations" TO "authenticated";
GRANT ALL ON TABLE "public"."file_anchor_operations" TO "service_role";



GRANT ALL ON TABLE "public"."folders" TO "anon";
GRANT ALL ON TABLE "public"."folders" TO "authenticated";
GRANT ALL ON TABLE "public"."folders" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."job_assignment_assets" TO "anon";
GRANT ALL ON TABLE "public"."job_assignment_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."job_assignment_assets" TO "service_role";



GRANT ALL ON TABLE "public"."job_assignment_members" TO "anon";
GRANT ALL ON TABLE "public"."job_assignment_members" TO "authenticated";
GRANT ALL ON TABLE "public"."job_assignment_members" TO "service_role";



GRANT ALL ON TABLE "public"."job_assignments" TO "anon";
GRANT ALL ON TABLE "public"."job_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."job_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."job_events" TO "anon";
GRANT ALL ON TABLE "public"."job_events" TO "authenticated";
GRANT ALL ON TABLE "public"."job_events" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."linked_wallets" TO "service_role";
GRANT SELECT ON TABLE "public"."linked_wallets" TO "authenticated";



GRANT ALL ON TABLE "public"."market_events" TO "anon";
GRANT ALL ON TABLE "public"."market_events" TO "authenticated";
GRANT ALL ON TABLE "public"."market_events" TO "service_role";



GRANT ALL ON TABLE "public"."market_favorites" TO "anon";
GRANT ALL ON TABLE "public"."market_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."market_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."market_firms" TO "anon";
GRANT ALL ON TABLE "public"."market_firms" TO "authenticated";
GRANT ALL ON TABLE "public"."market_firms" TO "service_role";



GRANT ALL ON TABLE "public"."market_inquiries" TO "anon";
GRANT ALL ON TABLE "public"."market_inquiries" TO "authenticated";
GRANT ALL ON TABLE "public"."market_inquiries" TO "service_role";



GRANT ALL ON TABLE "public"."market_job_posts" TO "anon";
GRANT ALL ON TABLE "public"."market_job_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."market_job_posts" TO "service_role";



GRANT ALL ON TABLE "public"."market_reviews" TO "anon";
GRANT ALL ON TABLE "public"."market_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."market_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."market_saved_searches" TO "anon";
GRANT ALL ON TABLE "public"."market_saved_searches" TO "authenticated";
GRANT ALL ON TABLE "public"."market_saved_searches" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_listings" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_listings" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_orders" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_orders" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."marketplace_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_requests" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."portfolio_items" TO "anon";
GRANT ALL ON TABLE "public"."portfolio_items" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_items" TO "service_role";



GRANT ALL ON TABLE "public"."professionals" TO "anon";
GRANT ALL ON TABLE "public"."professionals" TO "authenticated";
GRANT ALL ON TABLE "public"."professionals" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."project_activities" TO "anon";
GRANT ALL ON TABLE "public"."project_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."project_activities" TO "service_role";



GRANT ALL ON TABLE "public"."project_cad_drawings" TO "anon";
GRANT ALL ON TABLE "public"."project_cad_drawings" TO "authenticated";
GRANT ALL ON TABLE "public"."project_cad_drawings" TO "service_role";



GRANT ALL ON TABLE "public"."project_contacts" TO "anon";
GRANT ALL ON TABLE "public"."project_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."project_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."project_members" TO "anon";
GRANT ALL ON TABLE "public"."project_members" TO "authenticated";
GRANT ALL ON TABLE "public"."project_members" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";
























GRANT ALL ON TABLE "public"."transport_checkpoints" TO "anon";
GRANT ALL ON TABLE "public"."transport_checkpoints" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_checkpoints" TO "service_role";



GRANT ALL ON TABLE "public"."transport_cities" TO "anon";
GRANT ALL ON TABLE "public"."transport_cities" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_cities" TO "service_role";






GRANT ALL ON TABLE "public"."transport_routes" TO "anon";
GRANT ALL ON TABLE "public"."transport_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_routes" TO "service_role";






GRANT ALL ON TABLE "public"."transport_vehicle_classes" TO "anon";
GRANT ALL ON TABLE "public"."transport_vehicle_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_vehicle_classes" TO "service_role";



GRANT ALL ON TABLE "public"."transport_vehicles" TO "anon";
GRANT ALL ON TABLE "public"."transport_vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_vehicles" TO "service_role";









GRANT ALL ON TABLE "public"."transport_route_stops" TO "anon";
GRANT ALL ON TABLE "public"."transport_route_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_route_stops" TO "service_role";






GRANT ALL ON TABLE "public"."quote_items" TO "anon";
GRANT ALL ON TABLE "public"."quote_items" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_items" TO "service_role";



GRANT ALL ON TABLE "public"."quotes" TO "anon";
GRANT ALL ON TABLE "public"."quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."quotes" TO "service_role";



GRANT ALL ON TABLE "public"."solana_market_cache" TO "service_role";



GRANT ALL ON TABLE "public"."survey_credit_rates" TO "anon";
GRANT ALL ON TABLE "public"."survey_credit_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_credit_rates" TO "service_role";



GRANT ALL ON TABLE "public"."survey_deliverables" TO "anon";
GRANT ALL ON TABLE "public"."survey_deliverables" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_deliverables" TO "service_role";



GRANT ALL ON TABLE "public"."survey_runs" TO "anon";
GRANT ALL ON TABLE "public"."survey_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_runs" TO "service_role";



GRANT ALL ON TABLE "public"."survey_targets" TO "anon";
GRANT ALL ON TABLE "public"."survey_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_targets" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."time_entries" TO "anon";
GRANT ALL ON TABLE "public"."time_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."time_entries" TO "service_role";



GRANT ALL ON TABLE "public"."transport_booking_events" TO "anon";
GRANT ALL ON TABLE "public"."transport_booking_events" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_booking_events" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_ai_credit_accounts" TO "anon";
GRANT ALL ON TABLE "public"."workspace_ai_credit_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_ai_credit_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_ai_credit_transactions" TO "anon";
GRANT ALL ON TABLE "public"."workspace_ai_credit_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_ai_credit_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_ai_providers" TO "anon";
GRANT ALL ON TABLE "public"."workspace_ai_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_ai_providers" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_invitations" TO "anon";
GRANT ALL ON TABLE "public"."workspace_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_pesepay_transactions" TO "anon";
GRANT ALL ON TABLE "public"."workspace_pesepay_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_pesepay_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_pesepay_wallets" TO "anon";
GRANT ALL ON TABLE "public"."workspace_pesepay_wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_pesepay_wallets" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_settings" TO "anon";
GRANT ALL ON TABLE "public"."workspace_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_settings" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_storage_purchases" TO "anon";
GRANT ALL ON TABLE "public"."workspace_storage_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_storage_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







