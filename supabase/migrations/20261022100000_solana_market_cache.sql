-- Shared 30-second snapshot cache for the public `solana-data` edge function.
-- Only the service role reads/writes this table; RLS with no policies denies
-- anon and authenticated clients.
create table if not exists public.solana_market_cache (
  id smallint primary key default 1 check (id = 1),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.solana_market_cache enable row level security;

revoke all on public.solana_market_cache from anon, authenticated;
