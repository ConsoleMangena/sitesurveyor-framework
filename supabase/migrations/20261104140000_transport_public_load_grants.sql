-- ── Public read path: the load meter's own two arithmetic helpers ───────────
--
-- The first push shipped public_transport_runs calling transport_load_ratio and
-- transport_governing_dimension while revoking both from `anon`. Views expand
-- their base tables under the view owner, but an EXECUTE check on a function in
-- the target list still runs against the calling role, so an anonymous visitor
-- got `permission denied for function transport_load_ratio` and the public
-- transport surface could not list a single run. Signed-in readers were fine:
-- the revoke named `public, anon` and left `authenticated` its grant, which is
-- why the difference only shows up without a session.
--
-- Both functions are pure arithmetic over the row they are handed, and the row
-- type is a composite an anonymous caller cannot read from the base table (RLS
-- has no anon policy there), so the grant opens nothing up. The alternative,
-- inlining the ratio in the view, would put a second copy of the governing-load
-- formula next to the one transport_apply_quorum trusts — the load meter and
-- the quorum check drifting apart is exactly what this feature cannot afford.

grant execute on function public.transport_load_ratio(public.transport_departures)
  to anon;
grant execute on function public.transport_governing_dimension(public.transport_departures)
  to anon;

-- Nothing else moves: the mutating entrypoints and the internal helpers that
-- were revoked outright stay exactly as the first push left them.
