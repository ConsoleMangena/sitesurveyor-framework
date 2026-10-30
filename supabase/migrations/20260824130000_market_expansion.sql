-- 0004_market_expansion.sql — expands the public market (/market):
--   1. category column on marketplace_listings ('instrument' | 'accessory')
--   2. public job posts, survey firms, and training/events directories
--   3. anonymous-read views for each + created_at on the professionals view
-- Run AFTER 0003_seed_demo_market.sql (or via supabase db push). Idempotent.
--
-- Same security posture as 0002: views enumerate columns and are the only
-- anon door; new base tables get RLS enabled with no policies (deny-all)
-- until in-app management features ship.

-- ── 1. Listing category ──

alter table public.marketplace_listings
  add column if not exists category text not null default 'instrument';

-- ── 2a. Public job posts ──

create table if not exists public.market_job_posts (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  title text not null,
  discipline text not null,
  employment_type text not null default 'contract',
  rate numeric,
  rate_per text,
  currency text not null default 'USD',
  location text not null,
  description text,
  requirements text[],
  latitude double precision,
  longitude double precision,
  is_global boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.market_job_posts enable row level security;

-- ── 2b. Survey firms directory ──

create table if not exists public.market_firms (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  name text not null,
  services text[] not null default '{}',
  location text not null,
  about text,
  verified boolean not null default false,
  staff_count integer,
  founded_year integer,
  latitude double precision,
  longitude double precision,
  is_global boolean not null default false,
  created_at timestamptz default now() not null
);
alter table public.market_firms enable row level security;

-- ── 2c. Training & certification events ──

create table if not exists public.market_events (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  title text not null,
  kind text not null default 'course',
  provider text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null,
  price numeric not null default 0,
  currency text not null default 'USD',
  description text,
  certification_body text,
  seats_left integer,
  created_at timestamptz default now() not null
);
alter table public.market_events enable row level security;

-- ── 3. Public views (columns enumerated; nothing sensitive leaks) ──

-- category sits mid-projection, so replace requires a drop (no dependents).
drop view if exists public.public_market_listings cascade;
create view public.public_market_listings as
select
  id,
  name,
  type,
  condition,
  price,
  currency,
  seller,
  location,
  description,
  specs,
  listing_type,
  category,
  latitude,
  longitude,
  created_at
from public.marketplace_listings;

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
  created_at
from public.professionals;

create or replace view public.public_market_jobs as
select
  id,
  title,
  discipline,
  employment_type,
  rate,
  rate_per,
  currency,
  location,
  description,
  requirements,
  latitude,
  longitude,
  created_at
from public.market_job_posts;

create or replace view public.public_market_firms as
select
  id,
  name,
  services,
  location,
  about,
  verified,
  staff_count,
  founded_year,
  latitude,
  longitude,
  created_at
from public.market_firms;

create or replace view public.public_market_events as
select
  id,
  title,
  kind,
  provider,
  starts_at,
  ends_at,
  location,
  price,
  currency,
  description,
  certification_body,
  seats_left,
  created_at
from public.market_events;

grant select on public.public_market_listings to anon, authenticated;
grant select on public.public_market_professionals to anon, authenticated;
grant select on public.public_market_jobs to anon, authenticated;
grant select on public.public_market_firms to anon, authenticated;
grant select on public.public_market_events to anon, authenticated;

-- ── Seeds (fixed UUIDs + ON CONFLICT, same pattern as 0003) ──

-- Accessory listings: recategorise two existing demo rows, add three more.
update public.marketplace_listings set category = 'accessory'
where id in (
  '22222222-2222-4222-8222-000000000006', -- Topcon RL-H5A laser package
  '22222222-2222-4222-8222-000000000004'  -- Sokkia B40 level
);

insert into public.marketplace_listings
  (id, workspace_id, name, type, condition, price, currency, seller, location,
   description, specs, is_global, listing_type, category, latitude, longitude)
values
  ('22222222-2222-4222-8222-000000000101', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Leica GPR1 Circular Prism + Target Plate', 'Accessory', 'New', 420, 'USD',
   'Harare Geomatics Ltd', 'Harare, Zimbabwe',
   'Precision circular prism with target plate, leica-compatible offset.',
   ARRAY['±2mm offset accuracy','GPH1 holder included'], true, 'sale', 'accessory',
   -17.8252, 31.0335),
  ('22222222-2222-4222-8222-000000000102', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Seco 8ft Snap-Lock Rover Rod (Hire)', 'Accessory', 'Rental Fleet', 12, 'USD',
   'London Ground Control', 'London, United Kingdom',
   'Telescopic rover rod with graduation marks in metric and imperial.',
   ARRAY['Snap-lock locking','10ths/100ths scale'], true, 'hire', 'accessory',
   51.5072, -0.1276),
  ('22222222-2222-4222-8222-000000000103', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'SiteBook Field Tablet Sunshade & Bracket', 'Accessory', 'New', 165, 'USD',
   'Nairobi Survey Supply', 'Nairobi, Kenya',
   'High-visibility sunshade and pole bracket for 8-inch field tablets.',
   ARRAY['Fits TSC7 / Trimble tablets','Quick-release bracket'], true, 'sale', 'accessory',
   -1.2864, 36.8172)
on conflict (id) do nothing;

-- Job posts worldwide.
insert into public.market_job_posts
  (id, workspace_id, title, discipline, employment_type, rate, rate_per, currency,
   location, description, requirements, latitude, longitude)
values
  ('33333333-3333-4333-8333-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Licensed Cadastral Surveyor', 'Cadastral', 'contract', 320, 'day', 'USD',
   'Harare, Zimbabwe',
   'Subdivision surveys for a peri-urban land development programme. Six-month engagement with extension likely.',
   ARRAY['Registered with SIRDC','Total station + GNSS fieldwork','SG6 report writing'], -17.8252, 31.0335),
  ('33333333-3333-4333-8333-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Drone Mapping Pilot (UAV)', 'Photogrammetry', 'casual', 180, 'day', 'USD',
   'Nairobi, Kenya',
   'Fly RTK/PPK missions for construction progress and topographic deliverables across East Africa.',
   ARRAY['Valid KCAA RPC licence','DJI M350 or Wingtra experience','Agisoft Metashape'], -1.2864, 36.8172),
  ('33333333-3333-4333-8333-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Setting-Out Engineer', 'Engineering Survey', 'contract', 260, 'day', 'GBP',
   'Manchester, United Kingdom',
   'Setting out for a rail enabling-works package. Night shifts, rotation of two crews.',
   ARRAY['CSCS card','Rail sentinel desirable','Robotic total station fluency'], 53.4808, -2.2426),
  ('33333333-3333-4333-8333-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Hydrographic Surveyor', 'Hydrographic', 'permanent', 5200, 'month', 'USD',
   'Lagos, Nigeria',
   'Bathymetric surveys supporting port expansion. Vessel-based multibeam and side-scan operations.',
   ARRAY['Cat 1 S5A or equivalent','Multibeam processing (QPS/CARIS)','STCW basic safety'], 6.5244, 3.3792),
  ('33333333-3333-4333-8333-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Graduate Surveyor (Field Crew)', 'General Practice', 'contract', 90, 'day', 'AUD',
   'Perth, Australia',
   'Two-person crew support for engineering surveys. Mentoring provided towards licensure.',
   ARRAY['Degree in surveying','Manual driving licence','Eager to learn GNSS workflows'], -31.9523, 115.8613),
  ('33333333-3333-4333-8333-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'GIS Analyst — Utility As-Built QA', 'GIS', 'permanent', 3800, 'month', 'CAD',
   'Toronto, Canada',
   'QA/QC as-built submissions against municipal data standards; light field verification.',
   ARRAY['PostGIS + QGIS','ESRI Utility Network exposure','SQL fundamentals'], 43.6532, -79.3832)
on conflict (id) do nothing;

-- Firms directory.
insert into public.market_firms
  (id, workspace_id, name, services, location, about, verified, staff_count,
   founded_year, latitude, longitude)
values
  ('44444444-4444-4444-8444-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Harare Geomatics Ltd',
   ARRAY['Cadastral survey','Topographic mapping','Engineering setting out'],
   'Harare, Zimbabwe',
   'Full-service land surveying consultancy serving mining, agriculture, and urban development since 2009.',
   true, 24, 2009, -17.8252, 31.0335),
  ('44444444-4444-4444-8444-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Cape Town AeroSurvey',
   ARRAY['UAV photogrammetry','LiDAR','Orthophoto production'],
   'Cape Town, South Africa',
   'Drone-first geospatial studio delivering centimetre-grade aerial products across Southern Africa.',
   true, 11, 2016, -33.9249, 18.4241),
  ('44444444-4444-4444-8444-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Nairobi Survey Supply',
   ARRAY['Instrument sales','Equipment hire','Calibration service'],
   'Nairobi, Kenya',
   'Authorised dealer and service centre for major survey instrument brands in East Africa.',
   false, 18, 2011, -1.2864, 36.8172),
  ('44444444-4444-4444-8444-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Thames Ground Control Co',
   ARRAY['Utility surveying','Measured building survey','Monitoring'],
   'London, United Kingdom',
   'Specialist utility mapping and structural monitoring for infrastructure contractors.',
   true, 32, 2004, 51.5072, -0.1276),
  ('44444444-4444-4444-8444-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Gulf Metrology Trading LLC',
   ARRAY['Instrument sales','Laser calibration','Training'],
   'Dubai, United Arab Emirates',
   'Metrology equipment supplier with an accredited calibration laboratory serving the Gulf region.',
   false, 9, 2014, 25.2048, 55.2708)
on conflict (id) do nothing;

-- Training & events (dates relative to push time so they stay upcoming).
insert into public.market_events
  (id, workspace_id, title, kind, provider, starts_at, ends_at, location, price,
   currency, description, certification_body, seats_left)
values
  ('55555555-5555-4555-8555-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'RTK GNSS Field Workflows — 2 Day Course', 'course', 'SiteSurveyor Academy',
   now() + interval '14 days', now() + interval '14 days' + interval '16 hours',
   'Harare, Zimbabwe', 240, 'USD',
   'Hands-on base-rover setup, observation best practice, and post-processing for cadastral-grade work.',
   'SiteSurveyor Academy certificate', 12),
  ('55555555-5555-4555-8555-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Drone Photogrammetry for Surveyors', 'course', 'Cape Town AeroSurvey',
   now() + interval '30 days', now() + interval '31 days',
   'Cape Town, South Africa', 380, 'USD',
   'Mission planning, ground control, and photogrammetry processing from flight to orthophoto.',
   'SA Geomatics Council CPD: 2 credits', 8),
  ('55555555-5555-4555-8555-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Applied Hydrography Webinar', 'event', 'SiteSurveyor Academy',
   now() + interval '7 days', now() + interval '7 days' + interval '3 hours',
   'Online', 0, 'USD',
   'Free session: multibeam basics, sound velocity, and QA workflows for inland waterways.',
   null, 200),
  ('55555555-5555-4555-8555-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Total Station Care & Calibration Clinic', 'event', 'Nairobi Survey Supply',
   now() + interval '21 days', now() + interval '21 days' + interval '6 hours',
   'Nairobi, Kenya', 40, 'USD',
   'Bring your instrument: collimation checks, prism constants, and servicing intervals explained.',
   'Attendance certificate', 20),
  ('55555555-5555-4555-8555-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'RICS APC Surveying Pathways Masterclass', 'course', 'Thames Ground Control Co',
   now() + interval '45 days', now() + interval '45 days' + interval '8 hours',
   'London, United Kingdom', 150, 'GBP',
   'Structured preparation for RICS assessment: case study, competency sign-off strategy, mock panel.',
   'RICS CPD: 7 hours', 25)
on conflict (id) do nothing;
