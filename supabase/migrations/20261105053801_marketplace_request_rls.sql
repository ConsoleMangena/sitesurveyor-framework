-- The marketplace request table was created directly in the hosted database, so
-- nothing in the migration history makes it: a local `db reset` loses it, and the
-- hosted copy kept the ad-hoc grants that came with it -- RLS switched on, not a
-- single policy, and INSERT/SELECT/UPDATE/DELETE/TRUNCATE for anon.
--
-- RLS with no policy denies everything, so the request flow that both markets use
-- could never write: "new row violates row-level security policy for table
-- marketplace_requests". Reads were silently empty too, which is why the seller
-- tab and My Requests looked like nobody had ever asked for anything.
--
-- The access model is the two parties the app already speaks of. The requester is
-- the user and workspace that sent the request; the seller is a member of the
-- workspace that owns the listing. A buyer opens a request as pending, on a
-- listing they are allowed to see, and may only cancel it. Accepting and
-- declining belongs to the seller, so a buyer cannot approve themselves into a
-- payment. anon keeps no access at all: a request is never public.
--
-- Recovered verbatim from supabase_migrations.schema_migrations on the hosted
-- database, where it sits as version 20261105053801.

create table if not exists public.marketplace_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings (id) on delete cascade,
  requester_workspace_id uuid not null references public.workspaces (id) on delete cascade,
  requester_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  message text,
  desired_start_date date,
  desired_end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketplace_requests_listing
  on public.marketplace_requests (listing_id);

create index if not exists idx_marketplace_requests_requester
  on public.marketplace_requests (requester_workspace_id);

alter table public.marketplace_requests enable row level security;

revoke all on public.marketplace_requests from anon;

revoke truncate, delete on public.marketplace_requests from authenticated;

grant select, insert, update on public.marketplace_requests to authenticated;

-- The seller half of every predicate: is this listing owned by a workspace the
-- caller belongs to? Security invoker on purpose -- the listing is read through
-- its own RLS, so this cannot reach a row the caller may not see.
create or replace function public.is_listing_seller(target_listing_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.marketplace_listings l
    where l.id = target_listing_id
      and is_workspace_member(l.workspace_id)
  );
$$;

drop policy if exists "marketplace_requests_select_participant" on public.marketplace_requests;
create policy "marketplace_requests_select_participant"
  on public.marketplace_requests
  for select
  to authenticated
  using (
    is_platform_admin()
    or (requester_user_id = auth.uid() and is_workspace_member(requester_workspace_id))
    or is_listing_seller(listing_id)
  );

drop policy if exists "marketplace_requests_insert_requester" on public.marketplace_requests;
create policy "marketplace_requests_insert_requester"
  on public.marketplace_requests
  for insert
  to authenticated
  with check (
    requester_user_id = auth.uid()
    and is_workspace_member(requester_workspace_id)
    and status = 'pending'
    and exists (
      select 1 from public.marketplace_listings l where l.id = listing_id
    )
  );

drop policy if exists "marketplace_requests_update_participant" on public.marketplace_requests;
create policy "marketplace_requests_update_participant"
  on public.marketplace_requests
  for update
  to authenticated
  using (
    is_platform_admin()
    or (requester_user_id = auth.uid() and is_workspace_member(requester_workspace_id))
    or is_listing_seller(listing_id)
  )
  with check (
    is_platform_admin()
    or (
      requester_user_id = auth.uid()
      and is_workspace_member(requester_workspace_id)
      and status = 'cancelled'
    )
    or (
      is_listing_seller(listing_id)
      and status in ('accepted', 'declined')
    )
  );
