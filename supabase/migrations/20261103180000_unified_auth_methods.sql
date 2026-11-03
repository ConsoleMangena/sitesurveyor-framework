-- ============================================================================
-- Unified authentication methods
--
-- One SiteSurveyor account (one `auth.users` row) can be reached through up to
-- three kinds of sign-in method:
--
--   * email   -> `auth.users.email` + password (Supabase Auth native)
--   * github  -> `auth.identities` row with provider = 'github'
--               (created by supabase.auth.linkIdentity / OAuth callback)
--   * web3    -> `auth.identities` row with provider = 'web3' and
--               provider_id = 'web3:<chain>:<address>'
--               (created here, after the wallet signature is verified
--               server-side by the `web3-auth` Edge Function)
--
-- Why a custom table instead of only `auth.identities`?
--   * Supabase Auth has no public API for attaching a wallet identity to an
--     existing user, so the `web3-auth` Edge Function verifies an EIP-4361
--     message (SIWE) / SIWS message and then calls `link_web3_identity`.
--   * `linked_wallets` gives the application a queryable, RLS-protected
--     registry of wallet ownership with a hard `UNIQUE (chain, address)`
--     constraint, so one address can never be claimed by two accounts.
--
-- Security properties enforced here:
--   * every RPC is SECURITY DEFINER and executable ONLY by `service_role`,
--     so `anon` / `authenticated` can never link or unlink on someone's behalf;
--   * a wallet can be attached to at most one account (account-takeover guard);
--   * a method can never be removed if it is the account's last way in
--     (lockout guard);
--   * nonces are single-use and time-boxed (replay guard).
-- ============================================================================

-- ── 1. Wallet registry ──────────────────────────────────────────────────────

create table if not exists public.linked_wallets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  chain        text not null check (chain in ('ethereum', 'solana')),
  -- Ethereum addresses are case-insensitive; Solana base58 addresses are not.
  address      text not null check (char_length(address) between 32 and 64),
  provider_id  text not null,
  linked_at    timestamptz not null default now(),
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint linked_wallets_chain_address_unique unique (chain, address),
  constraint linked_wallets_user_chain_address_unique unique (user_id, chain, address)
);

create index if not exists linked_wallets_user_id_idx
  on public.linked_wallets (user_id);

-- The application only ever reads its own rows; writes happen exclusively
-- through the SECURITY DEFINER functions below (service_role).
alter table public.linked_wallets enable row level security;
revoke all on table public.linked_wallets from anon, authenticated;
grant select on table public.linked_wallets to authenticated;

drop policy if exists "linked_wallets_select_own" on public.linked_wallets;
create policy "linked_wallets_select_own"
  on public.linked_wallets
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "linked_wallets_no_client_write" on public.linked_wallets;
create policy "linked_wallets_no_client_write"
  on public.linked_wallets
  for all
  to authenticated
  using (false)
  with check (false);

-- ── 2. Single-use, time-boxed nonces ────────────────────────────────────────
--
-- The Edge Function writes these directly with the service-role key. No client
-- role can see or touch them: the table is not granted to `anon` /
-- `authenticated` and RLS has no policies for them.

create table if not exists public.auth_nonces (
  nonce       text primary key,
  purpose     text not null check (purpose in ('siwe_login', 'siwe_link', 'siws_login', 'siws_link')),
  user_id     uuid references auth.users (id) on delete cascade,
  chain       text,
  address     text,
  -- SHA-256 of the caller IP; auditing without storing raw addresses.
  client_hash text,
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  constraint auth_nonces_expiry_after_issue check (expires_at > issued_at)
);

create index if not exists auth_nonces_expiry_idx
  on public.auth_nonces (expires_at);

alter table public.auth_nonces enable row level security;
revoke all on table public.auth_nonces from anon, authenticated;
grant select, insert, update, delete on table public.auth_nonces to service_role;

-- Housekeeping: drop nonces that can never be used again.
create or replace function public.prune_auth_nonces()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.auth_nonces
   where expires_at < now() - interval '1 day';
$$;

revoke all on function public.prune_auth_nonces() from public, anon, authenticated;
grant execute on function public.prune_auth_nonces() to service_role;

-- Keep `auth.users.app_metadata.providers` in step with the identities we
-- manage directly from SQL (Supabase Auth normally recomputes it whenever an
-- identity changes through its own API).
create or replace function public.sync_auth_providers(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update auth.users
     set app_metadata = coalesce(app_metadata, '{}'::jsonb) || jsonb_build_object(
           'providers',
           coalesce(
             (select jsonb_agg(distinct provider)
                from auth.identities
               where user_id = p_user_id),
             '[]'::jsonb
           )
         ),
         updated_at = now()
   where id = p_user_id;
$$;

revoke all on function public.sync_auth_providers(uuid) from public, anon, authenticated;
grant execute on function public.sync_auth_providers(uuid) to service_role;

-- ── 3. Link a verified wallet to an account ─────────────────────────────────

create or replace function public.link_web3_identity(
  p_user_id       uuid,
  p_chain         text,
  p_address       text,
  p_identity_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_id text;
  v_normalized  text;
  v_owner       uuid;
  v_wallet_owner uuid;
begin
  if p_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_chain not in ('ethereum', 'solana') then
    raise exception 'UNSUPPORTED_CHAIN' using errcode = 'P0001';
  end if;

  -- Normalise: EVM addresses are hex and case-insensitive, Solana are base58.
  if p_chain = 'ethereum' then
    if p_address !~* '^0x[0-9a-f]{40}$' then
      raise exception 'INVALID_ADDRESS' using errcode = 'P0001';
    end if;
    v_normalized := lower(p_address);
  else
    if p_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
      raise exception 'INVALID_ADDRESS' using errcode = 'P0001';
    end if;
    v_normalized := p_address;
  end if;

  v_provider_id := 'web3:' || p_chain || ':' || v_normalized;

  -- Account-takeover guard: an address may belong to exactly one account.
  select user_id into v_owner
    from auth.identities
   where provider = 'web3' and provider_id = v_provider_id;

  if v_owner is not null and v_owner <> p_user_id then
    raise exception 'WALLET_ALREADY_LINKED' using errcode = 'P0001';
  end if;

  select user_id into v_wallet_owner
    from public.linked_wallets
   where chain = p_chain and address = v_normalized;

  if v_wallet_owner is not null and v_wallet_owner <> p_user_id then
    raise exception 'WALLET_ALREADY_LINKED' using errcode = 'P0001';
  end if;

  -- Attach the identity Supabase Auth resolves on the next
  -- `signInWithWeb3({ chain })` so a linked wallet signs into THIS account
  -- instead of creating a duplicate one.
  if v_owner is null then
    insert into auth.identities (id, user_id, provider, provider_id, identity_data,
                                 last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(),
      p_user_id,
      'web3',
      v_provider_id,
      jsonb_build_object(
        'sub',     v_provider_id,
        'chain',   p_chain,
        'address', v_normalized,
        'network', coalesce(p_identity_data ->> 'network', ''),
        'domain',  coalesce(p_identity_data ->> 'domain', ''),
        'statement', coalesce(p_identity_data ->> 'statement', '')
      ),
      now(), now(), now()
    )
    on conflict (provider_id, provider) do nothing;
  end if;

  insert into public.linked_wallets (user_id, chain, address, provider_id, updated_at)
  values (p_user_id, p_chain, v_normalized, v_provider_id, now())
  on conflict (chain, address) do update
    set user_id      = excluded.user_id,
        provider_id  = excluded.provider_id,
        updated_at   = now();

  perform public.sync_auth_providers(p_user_id);
end;
$$;

revoke all on function public.link_web3_identity(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.link_web3_identity(uuid, text, text, jsonb)
  to service_role;

-- ── 4. Sign-in method accounting (lockout guard) ────────────────────────────
--
-- A *usable* sign-in method is one that actually authenticates someone today:
--   * an OAuth / web3 identity (GitHub, or a linked wallet), excluding the
--     one being removed when `p_exclude_provider_id` is given;
--   * email + password, but only when the address is on the account, has been
--     confirmed by Supabase Auth, and a password is set — an `email` identity
--     on its own (no password) cannot authenticate anything.
--
-- `p_exclude_email` drops the email+password component, which is what the
-- "remove email sign-in" flow needs to ask: "what is left without email?"

create or replace function public.remaining_signin_methods(
  p_user_id            uuid,
  p_exclude_provider_id text default null,
  p_exclude_email      boolean default false
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (
      select count(*)::integer
        from auth.identities
       where user_id = p_user_id
         and provider <> 'email'
         and (p_exclude_provider_id is null
              or not (provider = 'web3' and provider_id = p_exclude_provider_id))
    )
    + case
        when p_exclude_email then 0
        else (
          select case
                   when u.email is not null
                     and u.email_confirmed_at is not null
                     and u.encrypted_password is not null
                     and length(u.encrypted_password) > 0
                   then 1 else 0
                 end::integer
            from auth.users u
           where u.id = p_user_id
        )
      end;
$$;

revoke all on function public.remaining_signin_methods(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.remaining_signin_methods(uuid, text, boolean)
  to service_role;

-- ── 5. Unlink a wallet ──────────────────────────────────────────────────────

create or replace function public.unlink_web3_identity(
  p_user_id uuid,
  p_chain   text,
  p_address text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_id text;
  v_normalized  text;
  v_remaining   integer;
begin
  if p_chain = 'ethereum' then
    v_normalized := lower(p_address);
  else
    v_normalized := p_address;
  end if;
  v_provider_id := 'web3:' || p_chain || ':' || v_normalized;

  if not exists (
    select 1 from public.linked_wallets
     where user_id = p_user_id and chain = p_chain and address = v_normalized
  ) then
    raise exception 'WALLET_NOT_LINKED' using errcode = 'P0001';
  end if;

  select public.remaining_signin_methods(p_user_id, v_provider_id)
    into v_remaining;

  if v_remaining < 1 then
    raise exception 'LAST_SIGN_IN_METHOD' using errcode = 'P0001';
  end if;

  delete from auth.identities
   where user_id = p_user_id
     and provider = 'web3'
     and provider_id = v_provider_id;

  delete from public.linked_wallets
   where user_id = p_user_id
     and chain = p_chain
     and address = v_normalized;

  perform public.sync_auth_providers(p_user_id);
end;
$$;

revoke all on function public.unlink_web3_identity(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.unlink_web3_identity(uuid, text, text)
  to service_role;

-- ── 6. Unlink email as a sign-in method ─────────────────────────────────────
--
-- Supabase Auth cannot delete `auth.users.email`: the address stays on the
-- account as its contact / receipt address. What this does is remove email as
-- a way *into* the account — the email identity goes away and the password is
-- cleared, so email + password can no longer authenticate. Signing back in with
-- email is done by re-linking it (setting a password again), which is exactly
-- the "link email" flow.

create or replace function public.unlink_email_signin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining integer;
begin
  -- What would be left if email + password stopped working?
  select public.remaining_signin_methods(p_user_id, null, true)
    into v_remaining;

  if v_remaining < 1 then
    raise exception 'LAST_SIGN_IN_METHOD' using errcode = 'P0001';
  end if;

  delete from auth.identities
   where user_id = p_user_id and provider = 'email';

  update auth.users
     set encrypted_password = '',
         updated_at = now()
   where id = p_user_id;

  perform public.sync_auth_providers(p_user_id);
end;
$$;

revoke all on function public.unlink_email_signin(uuid)
  from public, anon, authenticated;
grant execute on function public.unlink_email_signin(uuid) to service_role;

-- ── 7. Link email to an account that has none ───────────────────────────────
--
-- Wallet-created accounts have `auth.users.email = null`. This records the
-- address once the user has proved control of it (the Edge Function only calls
-- it after Supabase Auth confirms the change), and creates the `email`
-- identity so the account shows a complete, consistent method list.

create or replace function public.link_email_identity(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(p_email));
  v_owner uuid;
begin
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;

  -- The Edge Function only reaches this after Supabase Auth confirmed the
  -- address sits on THIS account, so the email must already be on file.
  select id into v_owner from auth.users where id = p_user_id;
  if v_owner is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select id into v_owner from auth.users where lower(email) = v_email;
  if v_owner is null or v_owner <> p_user_id then
    raise exception 'EMAIL_NOT_ON_ACCOUNT' using errcode = 'P0001';
  end if;

  -- Normalise to exactly one email identity: Supabase Auth may already have
  -- created one when the password was set, and GoTrue only ever allows a
  -- single email identity per user.
  delete from auth.identities
   where user_id = p_user_id and provider = 'email';

  insert into auth.identities (id, user_id, provider, provider_id, identity_data,
                               last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_user_id, 'email', p_user_id::text,
    jsonb_build_object('sub', p_user_id::text, 'email', v_email, 'email_verified', true),
    now(), now(), now()
  );

  perform public.sync_auth_providers(p_user_id);
end;
$$;

revoke all on function public.unlink_email_signin(uuid) from public, anon, authenticated;
revoke all on function public.link_email_identity(uuid, text)
  from public, anon, authenticated;
grant execute on function public.link_email_identity(uuid, text) to service_role;
