-- Remove the demo marketplace content seeded by
-- 20260824120000_public_market_views and 20260824130000_market_expansion.
--
-- Every demo row belongs to the demo workspace, and the market tables cascade
-- from it. The explicit deletes keep this safe on databases where the demo
-- user or workspace was already removed by hand.

delete from public.marketplace_orders
where listing_id in (
  select id
  from public.marketplace_listings
  where workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     or id::text like '22222222-2222-4222-8222-%'
);

delete from public.marketplace_listings
where workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   or id::text like '22222222-2222-4222-8222-%';

delete from public.professionals
where workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   or id::text like '33333333-3333-4333-8333-%';

delete from public.market_job_posts
where workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   or id::text like '33333333-3333-4333-8333-%';

delete from public.market_firms
where workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

delete from public.market_events
where workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

delete from public.portfolio_items
where workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

delete from public.workspaces
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

delete from auth.users
where id = '11111111-1111-4111-8111-111111111111';
