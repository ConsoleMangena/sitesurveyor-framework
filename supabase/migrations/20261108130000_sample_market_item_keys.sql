-- Demo inventory must not read as real supply.
--
-- Two seeded workspaces ("SiteSurveyor Sample Market" e0000000-… and the older
-- "SiteSurveyor Demo Market" aaaaaaaa-…) publish listings, professionals, jobs,
-- firms and events so /market is never empty on a fresh database. Those rows
-- render exactly like a working firm's rows: same cards, same prices, same
-- "request" button. This function gives the public market a way to label them
-- without changing any public view (adding a computed column to a live view
-- means restating every column and risks silently dropping one).
--
-- Returns "kind:id" keys, matching the key format the client already uses for
-- map pins and registry rows. Only ids that the public market views already
-- expose are returned, so nothing private is leaked and the function is safe
-- for `anon`.

create or replace function public.sample_market_item_keys()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with demo_workspaces as (
    select w.id
    from public.workspaces w
    where w.id in (
        'e0000000-0000-4000-8000-000000000001'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      )
      or w.slug in ('site-surveyor-sample-market', 'site-surveyor-demo')
  )
  select coalesce(array_agg(keys.key order by keys.key), '{}'::text[])
  from (
    select 'listing:' || l.id as key
    from public.marketplace_listings l
    join demo_workspaces d on d.id = l.workspace_id
    union all
    select 'professional:' || p.id
    from public.professionals p
    join demo_workspaces d on d.id = p.workspace_id
    union all
    select 'job:' || j.id
    from public.market_job_posts j
    join demo_workspaces d on d.id = j.workspace_id
    union all
    select 'firm:' || f.id
    from public.market_firms f
    join demo_workspaces d on d.id = f.workspace_id
    union all
    select 'event:' || e.id
    from public.market_events e
    join demo_workspaces d on d.id = e.workspace_id
  ) keys;
$$;

comment on function public.sample_market_item_keys() is
  'Keys ("kind:id") of market rows published by the seeded demo/sample workspaces, so the public market can label sample content.';

revoke all on function public.sample_market_item_keys() from public;
grant execute on function public.sample_market_item_keys() to anon, authenticated;
