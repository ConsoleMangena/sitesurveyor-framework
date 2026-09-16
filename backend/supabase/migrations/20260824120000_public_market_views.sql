-- 0002_public_market.sql — coordinate columns + anonymous-read views for the
-- public market (/market). Run in the Supabase SQL editor AFTER 0001_schema.sql.
--
-- The views deliberately enumerate columns: sensitive fields such as
-- marketplace_listings.seller_wallet_address and every *_workspace_id must
-- stay unreachable anonymously. Base-table RLS is unchanged; these views are
-- the only anon door (definer semantics bypass RLS for their own column set).

-- ── Coordinate columns ──

alter table public.marketplace_listings
  add column if not exists listing_type text;
alter table public.marketplace_listings
  add column if not exists latitude double precision;
alter table public.marketplace_listings
  add column if not exists longitude double precision;

alter table public.professionals
  add column if not exists latitude double precision;
alter table public.professionals
  add column if not exists longitude double precision;

-- listing_type exists in the live database but predates 0001_schema.sql;
-- ensured above so the view works on fresh and drifted databases alike.

-- ── Public views ──

create or replace view public.public_market_listings as
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
  longitude
from public.professionals;

-- ── Grants ──

grant select on public.public_market_listings to anon, authenticated;
grant select on public.public_market_professionals to anon, authenticated;
-- 0003_seed_demo_market.sql — demo rows so /market has something to show.
-- Run AFTER 0002_public_market.sql. Idempotent: fixed UUIDs + ON CONFLICT.
--
-- Creates one demo auth user ("demo@sitesurveyor.market", password
-- "demo-market-2026"), a demo workspace, and a worldwide set of listings and
-- professionals with coordinates pre-resolved (no geocoding needed).

-- ── Demo auth user ──

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values (
  '11111111-1111-4111-8111-111111111111',
  'demo@sitesurveyor.market',
  extensions.crypt('demo-market-2026', extensions.gen_salt('bf')),
  now(),
  '{"full_name": "Demo Market Workspace"}'::jsonb
)
on conflict (id) do nothing;

-- ── Demo workspace ──

insert into public.workspaces (id, name, slug, type, owner_user_id)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'SiteSurveyor Demo Market',
  'site-surveyor-demo',
  'business',
  '11111111-1111-4111-8111-111111111111'
)
on conflict (id) do nothing;

-- ── Listings (sale / hire) ──

insert into public.marketplace_listings
  (id, workspace_id, name, type, condition, price, currency, seller, location,
   description, specs, is_global, listing_type, latitude, longitude)
values
  ('22222222-2222-4222-8222-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Leica TS16 1" Total Station', 'Instrument', 'Used - Excellent', 12500, 'USD',
   'Harare Geomatics Ltd', 'Harare, Zimbabwe',
   'Two years old, calibrated quarterly. Includes GRZ4 tripod, prisms, and hard case.',
   ARRAY['1" angular accuracy','1000m reflectorless','Captivate onboard'], true,
   'sale', -17.8252, 31.0335),
  ('22222222-2222-4222-8222-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Trimble R12i GNSS Receiver Kit', 'GNSS', 'New', 18900, 'USD',
   'Nairobi Survey Supply', 'Nairobi, Kenya',
   'Latest R12i with TSC7 controller, Trimble Access licence, and base-rover radios.',
   ARRAY['672 channels','Trimble ProPoint','IP65'], true,
   'sale', -1.2864, 36.8172),
  ('22222222-2222-4222-8222-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'DJI Matrice 350 RTK + P1 Payload', 'UAV', 'Used - Good', 14750, 'USD',
   'Cape Town AeroSurvey', 'Cape Town, South Africa',
   '45-minute flight time, full photogrammetry rig, 3 spare batteries and case.',
   ARRAY['RTK/PPK centimetre accuracy','Zenmuse P1 45MP','TB65 batteries x3'], true,
   'sale', -33.9249, 18.4241),
  ('22222222-2222-4222-8222-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Sokkia B40 Automatic Level', 'Instrument', 'Used - Good', 850, 'USD',
   'Accra Instruments', 'Accra, Ghana',
   'Reliable site level, 32x magnification, recently serviced.',
   ARRAY['32x magnification','Compensator range ±15'''], false,
   'sale', 5.6037, -0.1870),
  ('22222222-2222-4222-8222-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Leica GS18 T Rover (Hire)', 'GNSS', 'Rental Fleet', 95, 'USD',
   'London Ground Control', 'London, United Kingdom',
   'Tilt-compensated smart antenna available for weekly hire, UK-wide courier.',
   ARRAY['True tilt up to 30°','Daily/weekly rates'], true,
   'hire', 51.5072, -0.1276),
  ('22222222-2222-4222-8222-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Topcon RL-H5A Laser Level Package', 'Instrument', 'New', 1250, 'USD',
   'Dubai Metrology Trading', 'Dubai, United Arab Emirates',
   'Self-levelling rotary laser with LS-80X receiver, tripod, and grade rod.',
   ARRAY['±1.5mm @ 30m','800m working diameter'], false,
   'sale', 25.2048, 55.2708),
  ('22222222-2222-4222-8222-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'WingtraOne Gen II VTOL Drone (Hire)', 'UAV', 'Rental Fleet', 420, 'USD',
   'Singapore UAV Services', 'Singapore',
   'Weekly hire of VTOL mapping drone with PPK, includes pilot briefing session.',
   ARRAY['Take-off area 2x2m','61MP RX1R II option'], true,
   'hire', 1.3521, 103.8198),
  ('22222222-2222-4222-8222-000000000008', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'GeoMax Zoom90 Total Station', 'Instrument', 'Used - Very Good', 7200, 'USD',
   'Lusaka Land Systems', 'Lusaka, Zambia',
   '5" model with Android onboard, ideal for construction layout crews.',
   ARRAY['5" accuracy','Android X-field'], false,
   'sale', -15.3875, 28.3228),
  ('22222222-2222-4222-8222-000000000009', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'GPR Ground Penetrating Radar 400MHz', 'Geophysical', 'Used - Good', 15600, 'USD',
   'Toronto Subsurface Inc', 'Toronto, Canada',
   'Utility locating GPR cart system with external tablet display.',
   ARRAY['0.1–6m depth range','Cart-mounted'], true,
   'sale', 43.6532, -79.3832),
  ('22222222-2222-4222-8222-000000000010', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Echo Sounder Single Beam Kit (Hire)', 'Hydrographic', 'Rental Fleet', 300, 'USD',
   'Amsterdam Hydro Hire', 'Amsterdam, Netherlands',
   'Single beam echo sounder with GNSS antenna and software for bathymetric surveys.',
   ARRAY['0.01m resolution','Bluetooth tide gauge'], true,
   'hire', 52.3676, 4.9041),
  ('22222222-2222-4222-8222-000000000011', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Kigali Drone + Pilot Day Rate', 'UAV', 'Service', 250, 'USD',
   'Kigali Aerial Mapping Co-op', 'Kigali, Rwanda',
   'Certified pilot with Mavic 3E for orthophoto and DEM capture, per day.',
   ARRAY['Includes processing quote','Licensed operator'], false,
   'hire', -1.9441, 30.0619),
  ('22222222-2222-4222-8222-000000000012', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Faro Focus S150 Laser Scanner', 'Scanning', 'Used - Excellent', 21500, 'USD',
   'Sydney Reality Capture', 'Sydney, Australia',
   'Terrestrial scanner with tripod, targets, and SCENE software dongle.',
   ARRAY['150m range','<1mm noise at 10m'], true,
   'sale', -33.8688, 151.2093),
  ('22222222-2222-4222-8222-000000000013', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'São Paulo Mobile Mapping Backpack', 'Scanning', 'Service', 480, 'USD',
   'SP GeoMóvel Serviços', 'São Paulo, Brazil',
   'Wearable LiDAR capture service for corridors and interiors, per day incl. processing.',
   ARRAY['SLAM-based','Colourised point cloud'], true,
   'hire', -23.5505, -46.6333),
  ('22222222-2222-4222-8222-000000000014', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'South GNSS RTK Base-Rover Set', 'GNSS', 'New', 3200, 'USD',
   'Lagos Field Equipment', 'Lagos, Nigeria',
   'Complete RTK kit with radios, poles, and field controller — strong value tier.',
   ARRAY['1598 channels','UHF + network RTK'], false,
   'sale', 6.5244, 3.3792)
on conflict (id) do nothing;

-- ── Professionals ──

insert into public.professionals
  (id, workspace_id, name, title, discipline, experience, location, rate, rate_per,
   currency, availability, rating, reviews, skills, bio, certifications, is_global,
   latitude, longitude)
values
  ('33333333-3333-4333-8333-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Tendai Moyo', 'Licensed Cadastral Surveyor', 'Cadastral', '12 years',
   'Harare, Zimbabwe', 65, 'hour', 'USD', 'Available now', 4.9, 34,
   ARRAY['Cadastral re-surveys','Farm planning','Estate beacons'],
   'Registered land surveyor handling title surveys and boundary disputes across Zimbabwe.',
   ARRAY['BSc Geomatics (NUST)','Registered Surveyor Zim'], true,
   -17.8252, 31.0335),
  ('33333333-3333-4333-8333-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Grace Wanjiru', 'Engineering Surveyor', 'Construction', '8 years',
   'Nairobi, Kenya', 55, 'hour', 'USD', 'From next week', 4.8, 27,
   ARRAY['Setting out','As-built checks','Rail corridors'],
   'Specialist in highways and rail setting out, SGR extension sections among recent works.',
   ARRAY['BEng Geospatial (JKUAT)','ISK Member'], true,
   -1.2864, 36.8172),
  ('33333333-3333-4333-8333-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Pieter van der Merwe', 'Mine Surveyor', 'Mining', '15 years',
   'Johannesburg, South Africa', 480, 'day', 'USD', 'Monthly slots', 4.9, 41,
   ARRAY['Shaft surveys','Volume computations','Tailings'],
   'Mine surveyor for open-pit and underground operations; solids modelling and reporting.',
   ARRAY['PLATO Certificate','SAGC Registered'], false,
   -26.2041, 28.0473),
  ('33333333-3333-4333-8333-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Amara Okonkwo', 'Hydrographic Surveyor', 'Hydrography', '9 years',
   'Lagos, Nigeria', 70, 'hour', 'USD', 'Available now', 4.7, 19,
   ARRAY['Bathymetry','Dredge volumes','Chart QA'],
   'Nearshore and inland waterway surveys along the Gulf of Guinea; multibeam data processing.',
   ARRAY['Cat A Hydrography (IHO)','MSc Hydrography'], false,
   6.5244, 3.3792),
  ('33333333-3333-4333-8333-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'James Whitfield', 'Photogrammetry Lead', 'UAV / Photogrammetry', '11 years',
   'London, United Kingdom', 75, 'hour', 'GBP', 'Booking 3 weeks out', 4.8, 52,
   ARRAY['UAS missions','Ortho pipelines','Accuracy audits'],
   'End-to-end aerial survey programmes from flight planning through to CAD-ready deliverables.',
   ARRAY['CAA GVC','RICS Assoc.'], true,
   51.5072, -0.1276),
  ('33333333-3333-4333-8333-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Sofia Almeida', 'GIS Analyst', 'GIS & Mapping', '6 years',
   'Lisbon, Portugal', 45, 'hour', 'EUR', 'Available now', 4.6, 23,
   ARRAY['QGIS','PostGIS','Web maps'],
   'Spatial databases, thematic mapping, and lightweight web viewers for infrastructure teams.',
   ARRAY['MSc GIS (ULisboa)'], true,
   38.7223, -9.1393),
  ('33333333-3333-4333-8333-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Rashid Al Mansoori', 'Quantity Surveyor', 'Quantity Surveying', '14 years',
   'Dubai, United Arab Emirates', 85, 'hour', 'USD', 'From Monday', 4.9, 63,
   ARRAY['BOQ production','Variations','Final accounts'],
   'Commercial management for high-rise and infrastructure packages across the GCC.',
   ARRAY['MRICS','BSc QS'], false,
   25.2048, 55.2708),
  ('33333333-3333-4333-8333-000000000008', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Mei Ling Chen', 'Reality Capture Specialist', 'Scanning', '7 years',
   'Singapore', 90, 'hour', 'SGD', 'Available now', 4.8, 31,
   ARRAY['Terrestrial LiDAR','Scan-to-BIM','Registration'],
   'Heritage documentation and plant retrofits delivered as clean Revit models.',
   ARRAY['Autodesk Certified','BSc Architecture'], true,
   1.3521, 103.8198),
  ('33333333-3333-4333-8333-000000000009', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Diego Fernández', 'Deformation Monitoring Engineer', 'Geodesy', '10 years',
   'Santiago, Chile', 78, 'hour', 'USD', 'Project-based', 4.7, 26,
   ARRAY['GB-SAR','Tunnelling arrays','Alarm thresholds'],
   'Automated monitoring design for dams, tunnels, and deep excavations in the Andes.',
   ARRAY['MSc Geodesy (UCHILE)'], true,
   -33.4489, -70.6693),
  ('33333333-3333-4333-8333-000000000010', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Sarah Thompson', 'Control Network Consultant', 'Geodesy', '16 years',
   'Toronto, Canada', 110, 'hour', 'CAD', 'Booking 2 weeks out', 5.0, 47,
   ARRAY['GNSS networks','Datum transforms','Adjustment QC'],
   'Designs and validates primary control for corridors and municipal fabric upgrades.',
   ARRAY['P.Eng Ontario','CLSA Commissioned'], true,
   43.6532, -79.3832),
  ('33333333-3333-4333-8333-000000000011', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Amina Njeri', 'Drone Pilot & Mapper', 'UAV / Photogrammetry', '4 years',
   'Kigali, Rwanda', 40, 'hour', 'USD', 'Available now', 4.5, 12,
   ARRAY['Orthophotos','DEM/DSM','Crop analytics'],
   'Rapid-response aerial mapping for agriculture and urban planning pilots in East Africa.',
   ARRAY['RCAA Licensed'], false,
   -1.9441, 30.0619),
  ('33333333-3333-4333-8333-000000000012', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Lucas Oliveira', 'Utility Locating Technician', 'Geophysical', '5 years',
   'São Paulo, Brazil', 42, 'hour', 'BRL', 'Weekends only', 4.4, 9,
   ARRAY['EM locators','GPR sweeps','Utility mapping'],
   'Before-you-dig utility clearance surveys using electromagnetic and GPR methods.',
   ARRAY['NR-35 Certified'], false,
   -23.5505, -46.6333)
on conflict (id) do nothing;
