create table if not exists public.market_saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  query text not null default '',
  scope text not null default 'all',
  sort text not null default 'newest',
  listing_category text not null default 'all',
  created_at timestamptz not null default now(),
  unique (user_id, query, scope, sort, listing_category)
);

create table if not exists public.market_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  market_kind text not null,
  market_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, market_kind, market_id)
);

alter table public.market_saved_searches enable row level security;
alter table public.market_favorites enable row level security;

create policy "Users manage their saved market searches"
  on public.market_saved_searches for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage their market favorites"
  on public.market_favorites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.market_saved_searches to authenticated;
grant select, insert, update, delete on public.market_favorites to authenticated;
