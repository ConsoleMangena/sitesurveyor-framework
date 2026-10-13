-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 — Professional portfolio: photos, showcase gallery, verified badge
--
-- 1. professionals gains avatar_path / banner_path / is_verified
-- 2. new portfolio_items table (project showcase gallery)
-- 3. professionals writes relaxed from platform-admin-only to owning-workspace
--    members or admins (self-publish fix)
-- 4. public storage bucket `portfolio-media` (anon read, member-scoped writes)
-- 5. anonymous /market views extended: public_market_professionals gains media
--    columns; new public_market_portfolio_items view
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. New columns ──

alter table public.professionals
  add column if not exists avatar_path text,
  add column if not exists banner_path text,
  add column if not exists is_verified boolean not null default false;

comment on column public.professionals.avatar_path is
  'Path of the profile photo in the public portfolio-media bucket.';
comment on column public.professionals.banner_path is
  'Path of the cover banner image in the public portfolio-media bucket.';
comment on column public.professionals.is_verified is
  'Platform-verified badge shown on public portfolio surfaces.';

-- ── 2. Portfolio showcase items ──

create table if not exists public.portfolio_items (
  id uuid default gen_random_uuid() primary key,
  professional_id uuid not null
    references public.professionals (id) on delete cascade on update cascade,
  workspace_id uuid not null
    references public.workspaces (id) on delete cascade on update cascade,
  title text not null,
  description text,
  year text,
  image_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_portfolio_items_professional_id
  on public.portfolio_items (professional_id);
create index if not exists idx_portfolio_items_workspace_id
  on public.portfolio_items (workspace_id);

alter table public.portfolio_items enable row level security;

drop policy if exists "portfolio_items_select" on public.portfolio_items;
create policy "portfolio_items_select"
on public.portfolio_items
for select
to authenticated
using (
  public.is_workspace_member(workspace_id)
  or public.is_platform_admin()
  or exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.is_global
  )
);

drop policy if exists "portfolio_items_insert" on public.portfolio_items;
create policy "portfolio_items_insert"
on public.portfolio_items
for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id) or public.is_platform_admin()
);

drop policy if exists "portfolio_items_update" on public.portfolio_items;
create policy "portfolio_items_update"
on public.portfolio_items
for update
to authenticated
using (
  public.is_workspace_member(workspace_id) or public.is_platform_admin()
)
with check (
  public.is_workspace_member(workspace_id) or public.is_platform_admin()
);

drop policy if exists "portfolio_items_delete" on public.portfolio_items;
create policy "portfolio_items_delete"
on public.portfolio_items
for delete
to authenticated
using (
  public.is_workspace_member(workspace_id) or public.is_platform_admin()
);

-- ── 3. Self-publish fix: members may manage their own professional row ──

drop policy if exists "professionals_insert_platform_admin" on public.professionals;
create policy "professionals_insert_member"
on public.professionals
for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id) or public.is_platform_admin()
);

drop policy if exists "professionals_update_platform_admin" on public.professionals;
create policy "professionals_update_member"
on public.professionals
for update
to authenticated
using (
  public.is_workspace_member(workspace_id) or public.is_platform_admin()
)
with check (
  public.is_workspace_member(workspace_id) or public.is_platform_admin()
);

drop policy if exists "professionals_delete_platform_admin" on public.professionals;
create policy "professionals_delete_member"
on public.professionals
for delete
to authenticated
using (
  public.is_workspace_member(workspace_id) or public.is_platform_admin()
);

-- ── 4. Public media bucket ──

insert into storage.buckets (id, name, public)
values ('portfolio-media', 'portfolio-media', true)
on conflict (id) do update set public = true;

drop policy if exists "portfolio_media_public_read" on storage.objects;
create policy "portfolio_media_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'portfolio-media');

drop policy if exists "portfolio_media_member_insert" on storage.objects;
create policy "portfolio_media_member_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'portfolio-media'
  and public.is_workspace_member(public.path_first_segment_uuid(name))
);

drop policy if exists "portfolio_media_member_update" on storage.objects;
create policy "portfolio_media_member_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'portfolio-media'
  and public.is_workspace_member(public.path_first_segment_uuid(name))
)
with check (
  bucket_id = 'portfolio-media'
  and public.is_workspace_member(public.path_first_segment_uuid(name))
);

drop policy if exists "portfolio_media_member_delete" on storage.objects;
create policy "portfolio_media_member_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'portfolio-media'
  and public.is_workspace_member(public.path_first_segment_uuid(name))
);

-- ── 5. Anonymous /market views ──

create or replace view public.public_market_professionals as
select
  id,
  name,
  title,
  discipline,
  experience,
  location,
  rate,
  rate_per,
  currency,
  availability,
  rating,
  reviews,
  skills,
  bio,
  certifications,
  latitude,
  longitude,
  created_at,
  avatar_path,
  banner_path,
  is_verified
from public.professionals;

create or replace view public.public_market_portfolio_items as
select
  id,
  professional_id,
  title,
  description,
  year,
  image_path,
  sort_order,
  created_at
from public.portfolio_items;

grant select on public.public_market_professionals to anon, authenticated;
grant select on public.public_market_portfolio_items to anon, authenticated;
