-- Rate limit the pre-auth email existence check.
--
-- is_email_already_registered answers one yes/no question for an address the
-- caller supplies, and it has to stay callable by anon: the sign-in pages ask
-- it before the user has an account, so that a person with an existing
-- account is sent to sign in the original way instead of creating a second
-- one.
--
-- That makes it an enumeration oracle. The answer is only a boolean and
-- carries no data about the matched account, but without a limit anyone
-- holding the publishable key can test a list of addresses as fast as the
-- network allows, and confirm which of them are registered.
--
-- What changes here is how often one caller may ask. The counter lives in the
-- database rather than in an edge function because the browser calls this RPC
-- directly, and because a database counter is shared by every edge instance
-- instead of being per-isolate.
--
-- The check is deliberately fail-open: when a caller is over its limit the
-- function returns null rather than raising. The client treats null as "not
-- known", continues with sign-in, and the duplicate-account trigger still
-- refuses the second account. Raising instead would roll the counter back
-- with the failed transaction, which would leave the limit unenforceable.

create table if not exists public.email_check_rate_limits (
  client_key text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0
);

comment on table public.email_check_rate_limits is
  'Rolling one-hour counters for public.is_email_already_registered. One row per client key, plus a __global__ row that caps the total.';

revoke all on table public.email_check_rate_limits from anon, authenticated, public;
alter table public.email_check_rate_limits enable row level security;

-- The caller as PostgREST sees it. Outside a PostgREST session there is no
-- request header, and the call is counted against the shared global bucket
-- only, so a missing header cannot throttle real users.
create or replace function public.email_check_client_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(
      split_part(
        coalesce(
          nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for',
          nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip'
        ),
        ',',
        1
      ),
      ''
    ),
    'unknown'
  );
$$;

revoke all on function public.email_check_client_key() from public;
grant execute on function public.email_check_client_key() to anon, authenticated;

create or replace function public.is_email_already_registered(candidate_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_key text;
  v_hits integer;
  v_global_hits integer;
  -- One person retries a handful of times; a scraper runs thousands.
  v_per_client_limit integer := 20;
  -- The ceiling for the whole project, whatever the caller address looks like.
  v_global_limit integer := 5000;
  v_window interval := interval '1 hour';
begin
  v_key := public.email_check_client_key();

  insert into public.email_check_rate_limits as limiter (client_key, window_started_at, hits)
  values (v_key, now(), 1)
  on conflict (client_key) do update
    set hits = case
                 when limiter.window_started_at < now() - v_window then 1
                 else limiter.hits + 1
               end,
        window_started_at = case
                 when limiter.window_started_at < now() - v_window then now()
                 else limiter.window_started_at
               end
  returning hits into v_hits;

  insert into public.email_check_rate_limits as limiter (client_key, window_started_at, hits)
  values ('__global__', now(), 1)
  on conflict (client_key) do update
    set hits = case
                 when limiter.window_started_at < now() - v_window then 1
                 else limiter.hits + 1
               end,
        window_started_at = case
                 when limiter.window_started_at < now() - v_window then now()
                 else limiter.window_started_at
               end
  returning hits into v_global_hits;

  -- One sweep per hour, when the global window rolls over.
  if v_global_hits = 1 then
    delete from public.email_check_rate_limits
     where client_key <> '__global__'
       and window_started_at < now() - v_window;
  end if;

  if v_global_hits > v_global_limit
     or (v_key <> 'unknown' and v_hits > v_per_client_limit) then
    return null;
  end if;

  return exists (
    select 1
    from public.profiles p
    where lower(btrim(p.email)) = lower(btrim(candidate_email))
  );
end;
$$;

comment on function public.is_email_already_registered(text) is
  'Whether an address already has an account. Callable before sign-in, so it is rate limited; returns null when the caller is over its limit, which the client treats as "not known".';

revoke all on function public.is_email_already_registered(text) from public;
grant execute on function public.is_email_already_registered(text) to anon, authenticated;
