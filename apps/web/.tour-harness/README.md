# Tour harness

Renders the production web bundle offline and captures the interface
screenshots used in the paper's guided walkthrough (`paper/assets/tour-*.png`).
The app's Supabase client is aliased to `fakeClient.ts`, which answers every
query, RPC, auth and storage call from the seeded dummy workspace in
`fixtures.ts` ("Moyo Geomatics"). No live database, wallet, payment gateway or
tile host is contacted; names, hashes, signatures and amounts are synthetic.

`public/fixtures/media/` holds the three marketplace photographs shown in the
fixtures (total station CC0, GNSS rover CC BY 4.0, UAV CC BY-SA 4.0, all via
Wikimedia Commons; credited in the paper captions).

## Usage

```bash
cd apps/web/.tour-harness
npx vite build          # bundles the app with the fake client
npx vite preview        # serves dist/ on http://localhost:4175
node capture.mjs        # headless Chrome; writes paper/assets/tour-*.png
```

`probe.mjs` opens a single page with console/network logging for debugging a
step that fails to render. `capture-nav-check.mjs` re-runs `capture.mjs`'s
server against the public header at 1280/1000/900px plus the More dropdown and
the mobile disclosure, writing `nav-check-*.png` here so header layout changes
can be eyeballed without touching the paper's `tour-*.png`.
`chrome-profile/` and `nav-check-profile/` are throwaway headless-Chrome state
and are git-ignored.
