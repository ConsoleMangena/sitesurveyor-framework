-- Drop cadastral-flavoured demo rows from the public market.
-- The platform targets engineering surveying practice, so cadastral
-- dummy content is retired (rows inserted by migrations 20260824120000
-- and 20260824130000).

-- Professional: "Tendai Moyo — Licensed Cadastral Surveyor".
delete from public.professionals
where id = '33333333-3333-4333-8333-000000000001';

-- Job post: "Licensed Cadastral Surveyor".
delete from public.market_job_posts
where id = '33333333-3333-4333-8333-000000000001';

-- Firm "Harare Geomatics Ltd" keeps its other services; drop the
-- cadastral line only.
update public.market_firms
set services = array_remove(services, 'Cadastral survey')
where id = '44444444-4444-4444-8444-000000000001';

-- RTK GNSS course description no longer references cadastral work.
update public.market_events
set description = replace(
  description,
  'post-processing for cadastral-grade work.',
  'post-processing for engineering-grade work.'
)
where id = '55555555-5555-4555-8555-000000000001';
