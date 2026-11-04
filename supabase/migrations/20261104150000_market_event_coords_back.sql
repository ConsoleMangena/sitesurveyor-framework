-- ── Put the event coordinates back into the public view ─────────────────────
--
-- 20260824131000_market_events_coords.sql added latitude/longitude to
-- market_events and selected them through public_market_events, so the market
-- map could pin an event. 20261101120000_marketplace_completeness.sql then
-- recreated that view from a longer column list and the two coordinates were
-- not in it. Nothing errored: the view simply stopped carrying them, and the
-- event dots the code plots have had no position since.
--
-- Regenerating the TypeScript types from the live database is what caught it —
-- the market code reads row.latitude off a view that no longer returns it. The
-- base columns are still there and still populated; only the view is blind.
--
-- create or replace, not drop ... cascade: the grants and the security_invoker
-- option the completeness migration set must survive, and only columns are
-- being added. Postgres will not insert columns into the middle of an existing
-- view, so the coordinates land at the end of the list; the API returns rows as
-- objects, so the order costs nothing.

create or replace view public.public_market_events as
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
  coalesce(sv.saves, 0) as saves,
  e.latitude,
  e.longitude
from public.market_events e
left join lateral (
  select count(*)::int as saves
  from public.market_favorites f
  where f.market_kind = 'event' and f.market_id = e.id
) sv on true
where coalesce(e.ends_at, e.starts_at) > now();
