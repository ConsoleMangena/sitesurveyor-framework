-- The public market views are the anonymous read surface for /market: each one
-- enumerates only public columns and is granted to anon. Supabase marks views
-- security_invoker=true, which subjects them to base-table RLS; those tables
-- have no anon policies (some have none at all), so the public directory reads
-- empty. Restore definer semantics as designed in 20260824120000.

alter view public.public_market_listings set (security_invoker = false);
alter view public.public_market_professionals set (security_invoker = false);
alter view public.public_market_jobs set (security_invoker = false);
alter view public.public_market_firms set (security_invoker = false);
alter view public.public_market_events set (security_invoker = false);
alter view public.public_market_portfolio_items set (security_invoker = false);
