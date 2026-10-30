create table if not exists public.custom_solana_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text not null,
  salt text not null,
  iv text not null,
  ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.custom_solana_wallets enable row level security;

drop policy if exists "Users can read their custom wallet" on public.custom_solana_wallets;
create policy "Users can read their custom wallet"
  on public.custom_solana_wallets for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their custom wallet" on public.custom_solana_wallets;
create policy "Users can create their custom wallet"
  on public.custom_solana_wallets for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their custom wallet" on public.custom_solana_wallets;
create policy "Users can update their custom wallet"
  on public.custom_solana_wallets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their custom wallet" on public.custom_solana_wallets;
create policy "Users can delete their custom wallet"
  on public.custom_solana_wallets for delete
  using (auth.uid() = user_id);

create or replace function public.set_custom_solana_wallet_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists custom_solana_wallets_updated_at on public.custom_solana_wallets;
create trigger custom_solana_wallets_updated_at
before update on public.custom_solana_wallets
for each row execute function public.set_custom_solana_wallet_updated_at();
