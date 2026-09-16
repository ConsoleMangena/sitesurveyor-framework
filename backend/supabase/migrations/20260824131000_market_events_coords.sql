-- 20260824131000_market_events_coords.sql — adds venue coordinates to
-- market_events so training/events can be pinned on the /market globe.
-- Delta for 20260824130000 (which shipped before coords were specced).

alter table public.market_events add column if not exists latitude double precision;
alter table public.market_events add column if not exists longitude double precision;

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
  created_at,
  latitude,
  longitude
from public.market_events;

update public.market_events set latitude = -17.8252, longitude = 31.0335
where id = '55555555-5555-4555-8555-000000000001';
update public.market_events set latitude = -33.9249, longitude = 18.4241
where id = '55555555-5555-4555-8555-000000000002';
update public.market_events set latitude = null, longitude = null
where id = '55555555-5555-4555-8555-000000000003'; -- Online webinar: no pin
update public.market_events set latitude = -1.2864, longitude = 36.8172
where id = '55555555-5555-4555-8555-000000000004';
update public.market_events set latitude = 51.5072, longitude = -0.1276
where id = '55555555-5555-4555-8555-000000000005';
