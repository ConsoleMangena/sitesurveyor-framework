-- Marketplace completeness — fills the gaps in the public /market data.
--
--   1. Lifecycle: status + expiry so stale rows stop showing up.
--   2. Structured location: city / country / remote, alongside the free-text
--      `location` the rows were already published with.
--   3. Enrichment columns per category (listing detail, job terms, firm
--      contact, event logistics, professional credentials).
--   4. market_inquiries: one request path for every category, not just listings.
--   5. market_reviews: real review rows behind the professional/firm ratings.
--   6. Refreshed anon views: every new column plus save counts and live review
--      aggregates, still enumerating columns so nothing private leaks.
--
-- Same security posture as 0002–0014: views are the only anon door and run as
-- the owner (security_invoker = false); base tables keep RLS enabled.

begin;

-- ── 1. Listings ──────────────────────────────────────────────────────────────

alter table public.marketplace_listings
  add column if not exists status text not null default 'available',
  add column if not exists expires_at timestamptz,
  add column if not exists quantity integer not null default 1,
  add column if not exists serial_number text,
  add column if not exists manufacture_year integer,
  add column if not exists delivery text,
  add column if not exists warranty_months integer,
  add column if not exists available_from date,
  add column if not exists available_to date,
  add column if not exists negotiable boolean not null default false,
  add column if not exists is_remote boolean not null default false,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists is_verified boolean not null default false;

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_status_check;
-- The captured base schema already carries this constraint; drop it so the
-- migration stays replayable against both a fresh and an existing database.
alter table public."marketplace_listings" drop constraint if exists "marketplace_listings_status_check";
alter table public.marketplace_listings
  add constraint marketplace_listings_status_check
  check (status in ('available', 'reserved', 'sold', 'withdrawn'));

-- ── 2. Professionals ─────────────────────────────────────────────────────────

alter table public.professionals
  add column if not exists is_remote boolean not null default false,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists languages text[] not null default '{}',
  add column if not exists travel_radius_km integer,
  add column if not exists credential_issuer text,
  add column if not exists credential_expires_on date;

-- ── 3. Job posts ─────────────────────────────────────────────────────────────

alter table public.market_job_posts
  add column if not exists company text,
  add column if not exists status text not null default 'open',
  add column if not exists closes_at timestamptz,
  add column if not exists starts_on date,
  add column if not exists seniority text,
  add column if not exists benefits text[] not null default '{}',
  add column if not exists apply_url text,
  add column if not exists photo_path text,
  add column if not exists is_remote boolean not null default false,
  add column if not exists city text,
  add column if not exists country text;

alter table public.market_job_posts
  drop constraint if exists market_job_posts_status_check;
-- The captured base schema already carries this constraint; drop it so the
-- migration stays replayable against both a fresh and an existing database.
alter table public."market_job_posts" drop constraint if exists "market_job_posts_status_check";
alter table public.market_job_posts
  add constraint market_job_posts_status_check
  check (status in ('open', 'closed', 'draft'));

-- ── 4. Firms ─────────────────────────────────────────────────────────────────

alter table public.market_firms
  add column if not exists website text,
  add column if not exists contact_email text,
  add column if not exists logo_path text,
  add column if not exists accreditations text[] not null default '{}',
  add column if not exists service_areas text[] not null default '{}',
  add column if not exists is_remote boolean not null default false,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists updated_at timestamptz not null default now();

-- ── 5. Training & events ─────────────────────────────────────────────────────

alter table public.market_events
  add column if not exists venue_address text,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists instructor text,
  add column if not exists agenda text[] not null default '{}',
  add column if not exists registration_url text,
  add column if not exists registration_deadline timestamptz,
  add column if not exists cpd_points numeric,
  add column if not exists capacity integer,
  add column if not exists photo_path text,
  add column if not exists is_remote boolean not null default false,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists updated_at timestamptz not null default now();

-- ── 6. Backfill structured location / remote from the free-text field ────────

update public.marketplace_listings
set city = coalesce(city, nullif(trim(split_part(location, ',', 1)), '')),
    country = coalesce(country, nullif(trim(split_part(location, ',', 2)), ''))
where city is null or country is null;

update public.professionals
set city = coalesce(city, nullif(trim(split_part(location, ',', 1)), '')),
    country = coalesce(country, nullif(trim(split_part(location, ',', 2)), ''))
where city is null or country is null;

update public.market_job_posts
set city = coalesce(city, nullif(trim(split_part(location, ',', 1)), '')),
    country = coalesce(country, nullif(trim(split_part(location, ',', 2)), ''))
where city is null or country is null;

update public.market_firms
set city = coalesce(city, nullif(trim(split_part(location, ',', 1)), '')),
    country = coalesce(country, nullif(trim(split_part(location, ',', 2)), ''))
where city is null or country is null;

update public.market_events
set city = coalesce(city, nullif(trim(split_part(location, ',', 1)), '')),
    country = coalesce(country, nullif(trim(split_part(location, ',', 2)), ''))
where city is null or country is null;

update public.marketplace_listings
set is_remote = true
where lower(trim(location)) in ('online', 'remote', 'worldwide');

update public.professionals
set is_remote = true
where lower(trim(location)) in ('online', 'remote', 'worldwide');

update public.market_job_posts
set is_remote = true
where lower(trim(location)) in ('online', 'remote', 'worldwide');

update public.market_firms
set is_remote = true
where lower(trim(location)) in ('online', 'remote', 'worldwide');

update public.market_events
set is_remote = true
where lower(trim(location)) in ('online', 'remote', 'worldwide');

-- ── 7. Generic inquiries: one request path for every category ────────────────

create table if not exists public.market_inquiries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('listing', 'professional', 'job', 'firm', 'event')),
  item_id uuid not null,
  intent text not null default 'enquiry',
  requester_user_id uuid not null references auth.users (id) on delete cascade,
  requester_workspace_id uuid references public.workspaces (id) on delete set null,
  requester_name text,
  requester_email text,
  message text,
  desired_start_date date,
  seats integer,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists market_inquiries_item_idx
  on public.market_inquiries (kind, item_id, created_at desc);
create index if not exists market_inquiries_requester_idx
  on public.market_inquiries (requester_user_id, created_at desc);

alter table public.market_inquiries enable row level security;

-- Maps a public item back to the workspace that published it, so publishers can
-- read the inquiries addressed to their own listings/jobs/firms/events.
create or replace function public.market_item_workspace(p_kind text, p_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case p_kind
    when 'listing' then (select workspace_id from public.marketplace_listings where id = p_item_id)
    when 'professional' then (select workspace_id from public.professionals where id = p_item_id)
    when 'job' then (select workspace_id from public.market_job_posts where id = p_item_id)
    when 'firm' then (select workspace_id from public.market_firms where id = p_item_id)
    when 'event' then (select workspace_id from public.market_events where id = p_item_id)
  end;
$$;

revoke all on function public.market_item_workspace(text, uuid) from public;
grant execute on function public.market_item_workspace(text, uuid) to authenticated;

drop policy if exists "Requesters create their own market inquiries" on public.market_inquiries;
create policy "Requesters create their own market inquiries"
  on public.market_inquiries for insert
  to authenticated
  with check (requester_user_id = auth.uid());

drop policy if exists "Requesters and publishers read market inquiries" on public.market_inquiries;
create policy "Requesters and publishers read market inquiries"
  on public.market_inquiries for select
  to authenticated
  using (
    requester_user_id = auth.uid()
    or coalesce(public.is_workspace_member(public.market_item_workspace(kind, item_id)), false)
  );

drop policy if exists "Requesters cancel their own market inquiries" on public.market_inquiries;
create policy "Requesters cancel their own market inquiries"
  on public.market_inquiries for update
  to authenticated
  using (
    requester_user_id = auth.uid()
    or coalesce(public.is_workspace_member(public.market_item_workspace(kind, item_id)), false)
  )
  with check (
    requester_user_id = auth.uid()
    or coalesce(public.is_workspace_member(public.market_item_workspace(kind, item_id)), false)
  );

grant select, insert, update on public.market_inquiries to authenticated;

-- ── 8. Reviews behind the professional / firm ratings ────────────────────────

create table if not exists public.market_reviews (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('professional', 'firm')),
  item_id uuid not null,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, item_id, author_user_id)
);

create index if not exists market_reviews_item_idx
  on public.market_reviews (kind, item_id, created_at desc);

alter table public.market_reviews enable row level security;

drop policy if exists "Signed-in users write their own market review" on public.market_reviews;
create policy "Signed-in users write their own market review"
  on public.market_reviews for insert
  to authenticated
  with check (
    author_user_id = auth.uid()
    and not coalesce(
      public.is_workspace_member(public.market_item_workspace(kind, item_id)),
      false
    )
  );

drop policy if exists "Authors edit their own market review" on public.market_reviews;
create policy "Authors edit their own market review"
  on public.market_reviews for update
  to authenticated
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

drop policy if exists "Authors delete their own market review" on public.market_reviews;
create policy "Authors delete their own market review"
  on public.market_reviews for delete
  to authenticated
  using (author_user_id = auth.uid());

grant select, insert, update, delete on public.market_reviews to authenticated;

-- ── 9. Public views ──────────────────────────────────────────────────────────
-- Drop + recreate every view that gained columns (CREATE OR REPLACE only allows
-- appending), then restore the owner-rights option and anon grants.

drop view if exists public.public_market_listings cascade;
create view public.public_market_listings as
select
  ml.id,
  ml.name,
  ml.type,
  ml.condition,
  ml.price,
  ml.currency,
  ml.seller,
  ml.location,
  ml.description,
  ml.specs,
  ml.listing_type,
  ml.category,
  ml.latitude,
  ml.longitude,
  ml.created_at,
  ml.updated_at,
  coalesce(a.photos, '{}')::text[] as photos,
  ml.status,
  ml.expires_at,
  ml.quantity,
  ml.serial_number,
  ml.manufacture_year,
  ml.delivery,
  ml.warranty_months,
  ml.available_from,
  ml.available_to,
  ml.negotiable,
  ml.is_remote,
  ml.city,
  ml.country,
  ml.is_verified,
  coalesce(sv.saves, 0) as saves
from public.marketplace_listings ml
left join public.assets a on a.id = ml.asset_id
left join lateral (
  select count(*)::int as saves
  from public.market_favorites f
  where f.market_kind = 'listing' and f.market_id = ml.id
) sv on true
where ml.status = 'available'
  and (ml.expires_at is null or ml.expires_at > now());

drop view if exists public.public_market_professionals cascade;
create view public.public_market_professionals as
select
  p.id,
  p.name,
  p.title,
  p.discipline,
  p.experience,
  p.location,
  p.rate,
  p.rate_per,
  p.currency,
  p.availability,
  coalesce(rev.rating, p.rating) as rating,
  coalesce(rev.reviews, p.reviews) as reviews,
  p.skills,
  p.bio,
  p.certifications,
  p.latitude,
  p.longitude,
  p.created_at,
  p.updated_at,
  p.avatar_path,
  p.banner_path,
  p.is_verified,
  p.is_remote,
  p.city,
  p.country,
  p.languages,
  p.travel_radius_km,
  p.credential_issuer,
  p.credential_expires_on,
  coalesce(sv.saves, 0) as saves
from public.professionals p
left join lateral (
  -- nullif keeps the stored rating/review count when no review rows exist yet
  select round(avg(r.rating)::numeric, 1) as rating,
         nullif(count(*), 0)::int as reviews
  from public.market_reviews r
  where r.kind = 'professional' and r.item_id = p.id
) rev on true
left join lateral (
  select count(*)::int as saves
  from public.market_favorites f
  where f.market_kind = 'professional' and f.market_id = p.id
) sv on true;

drop view if exists public.public_market_jobs cascade;
create view public.public_market_jobs as
select
  j.id,
  j.title,
  j.discipline,
  j.employment_type,
  j.rate,
  j.rate_per,
  j.currency,
  j.location,
  j.description,
  j.requirements,
  j.latitude,
  j.longitude,
  j.created_at,
  j.updated_at,
  j.company,
  j.status,
  j.closes_at,
  j.starts_on,
  j.seniority,
  j.benefits,
  j.apply_url,
  j.photo_path,
  j.is_remote,
  j.city,
  j.country,
  coalesce(sv.saves, 0) as saves
from public.market_job_posts j
left join lateral (
  select count(*)::int as saves
  from public.market_favorites f
  where f.market_kind = 'job' and f.market_id = j.id
) sv on true
where j.status = 'open'
  and (j.closes_at is null or j.closes_at > now());

drop view if exists public.public_market_firms cascade;
create view public.public_market_firms as
select
  f.id,
  f.name,
  f.services,
  f.location,
  f.about,
  f.verified,
  f.staff_count,
  f.founded_year,
  f.latitude,
  f.longitude,
  f.created_at,
  f.updated_at,
  coalesce(rev.rating, 0) as rating,
  coalesce(rev.reviews, 0) as reviews,
  f.website,
  f.contact_email,
  f.logo_path,
  f.accreditations,
  f.service_areas,
  f.is_remote,
  f.city,
  f.country,
  coalesce(sv.saves, 0) as saves
from public.market_firms f
left join lateral (
  select round(avg(r.rating)::numeric, 1) as rating, count(*)::int as reviews
  from public.market_reviews r
  where r.kind = 'firm' and r.item_id = f.id
) rev on true
left join lateral (
  select count(*)::int as saves
  from public.market_favorites fa
  where fa.market_kind = 'firm' and fa.market_id = f.id
) sv on true;

drop view if exists public.public_market_events cascade;
create view public.public_market_events as
select
  e.id,
  e.title,
  e.kind,
  e.provider,
  e.starts_at,
  e.ends_at,
  e.location,
  e.price,
  e.currency,
  e.description,
  e.certification_body,
  e.seats_left,
  e.created_at,
  e.updated_at,
  e.venue_address,
  e.timezone,
  e.instructor,
  e.agenda,
  e.registration_url,
  e.registration_deadline,
  e.cpd_points,
  e.capacity,
  e.photo_path,
  e.is_remote,
  e.city,
  e.country,
  coalesce(sv.saves, 0) as saves
from public.market_events e
left join lateral (
  select count(*)::int as saves
  from public.market_favorites f
  where f.market_kind = 'event' and f.market_id = e.id
) sv on true
where coalesce(e.ends_at, e.starts_at) > now();

create or replace view public.public_market_reviews as
select
  r.id,
  r.kind,
  r.item_id,
  r.rating,
  r.body,
  r.created_at
from public.market_reviews r;

alter view public.public_market_listings set (security_invoker = false);
alter view public.public_market_professionals set (security_invoker = false);
alter view public.public_market_jobs set (security_invoker = false);
alter view public.public_market_firms set (security_invoker = false);
alter view public.public_market_events set (security_invoker = false);
alter view public.public_market_reviews set (security_invoker = false);

grant select on public.public_market_listings to anon, authenticated;
grant select on public.public_market_professionals to anon, authenticated;
grant select on public.public_market_jobs to anon, authenticated;
grant select on public.public_market_firms to anon, authenticated;
grant select on public.public_market_events to anon, authenticated;
grant select on public.public_market_reviews to anon, authenticated;

commit;
