-- The sign-in pages ask "is this email already an account?" before starting a
-- provider (Google/GitHub) sign-in, so a person with an existing account is
-- told to sign in the original way and link the provider, instead of Auth
-- creating a second account that the trigger then has to refuse.
--
-- RLS on profiles lets a user read only their own row, so the check runs as a
-- SECURITY DEFINER function: it takes the address to test and returns one
-- boolean, and deliberately returns no other data about the matched account.

create or replace function public.is_email_already_registered(candidate_email text)
returns boolean
language sql
security definer
set search_path to 'public'
stable
as $function$
  select exists (
    select 1
    from public.profiles p
    where lower(btrim(p.email)) = lower(btrim(candidate_email))
  );
$function$;

-- Revoke the default PUBLIC grant so only authenticated, anon-facing calls the
-- API allows go through; the anon key can call it, which is the point (the
-- sign-in pages run pre-auth), but it exposes only a yes/no.
revoke execute on function public.is_email_already_registered(text) from public;
grant execute on function public.is_email_already_registered(text) to anon, authenticated;
