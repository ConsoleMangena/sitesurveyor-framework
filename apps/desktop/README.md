# SiteSurveyor desktop shell

A Tauri (Rust) shell that packages the shared web app (`apps/web`) as a native
desktop window. The shell owns no business logic — authentication, data, AI
chat and payments all stay in the frontend and the Supabase edge functions.
What it adds is a native window, a taskbar entry and installers.

## Requirements

| Tool | Why | Notes |
| --- | --- | --- |
| Node 22.18+ | Vite build, Tauri CLI | Same version the web app needs |
| Rust stable (MSVC) | Compiles the shell | `rustup default stable-x86_64-pc-windows-msvc` |
| Visual Studio Build Tools | Links the shell on Windows | "Desktop development with C++" workload; the Windows SDK comes with it |
| WebView2 Runtime | Renders the window | Preinstalled on Windows 11; the installer offers a bootstrapper otherwise |

macOS needs the Xcode command line tools; Linux needs `webkit2gtk`, `libayatana-appindicator`
and `librsvg` (`tauri info` lists what is missing).

Check the toolchain with:

```bash
npm --prefix apps/desktop install
npm --prefix apps/desktop run tauri:info
```

## Run it

```bash
npm --prefix apps/web install
cp apps/web/.env.example apps/web/.env      # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm --prefix apps/desktop run dev
```

`tauri dev` starts the Vite server on port 5174, opens the native window against it and
rebuilds the Rust side on change. From the repository root, `npm run dev:desktop` does the
same thing.

## Build installers

```bash
npm --prefix apps/desktop run build
```

The web app is type-checked and bundled into `apps/web/dist` first, then the Rust shell is
compiled and packaged. Output lands in `apps/desktop/src-tauri/target/release/bundle/`:

| Platform | Artifacts |
| --- | --- |
| Windows | `.msi` (MSI) and `-setup.exe` (NSIS) |
| macOS | `.app`, `.dmg` |
| Linux | `.deb`, `.rpm`, `.AppImage` |

`bundle.targets` in `src-tauri/tauri.conf.json` narrows this to a single format when a release
only needs one.

Build the shell with `tauri build`, not with a bare `cargo build --release`. The Tauri CLI adds the
`custom-protocol` feature, which is what makes the app serve the bundled frontend instead of
pointing at the dev server.

## Layout

```text
apps/desktop/
├── package.json          Tauri CLI wrapper scripts
└── src-tauri/
    ├── Cargo.toml        Shell crate; tauri-plugin-opener for external links
    ├── tauri.conf.json   Bundle metadata, dev server, CSP
    ├── capabilities/     Permissions granted to the app window
    ├── icons/            Generated from apps/web/public/logo.png
    └── src/
        ├── main.rs       Desktop entry point
        └── lib.rs        Window setup, navigation policy
```

## How the shell behaves

**External links.** The frontend links out to documentation, Solana Explorer and the public site.
In a browser those open a new tab; in a native window an unhandled navigation would replace the
app with the target page. `src-tauri/src/lib.rs` cancels off-origin navigations and opens them in
the system browser instead, and refuses to create a second native window for `target="_blank"`.

**Service worker.** The desktop build does not register the PWA service worker. The app ships as
an installer, so the installer already controls the version on disk; a service worker would only
serve a stale bundle after an update.

**Content Security Policy.** `src-tauri/tauri.conf.json` sets a CSP for the packaged window.
`connect-src` and `img-src` allow any HTTPS origin because the app talks to a configurable
Supabase project, a configurable Solana RPC and third-party map tiles — the origins are not
knowable at build time.

**Permissions.** `src-tauri/capabilities/default.json` grants the window the core Tauri
permission set. Every additional plugin permission has to be added there on purpose.

## Auth redirects

GitHub sign-in, email confirmation and password reset are finished by the **system browser**, which
cannot hand its result back to a window it knows nothing about. GoTrue will also only redirect that
browser to a URL the Supabase project allowlists — and the app's own origin, `http://tauri.localhost`,
is one no browser can reach, so it can never be allowlisted.

The flow therefore goes through a bridge page on the hosted web build:

```text
app → system browser → GitHub → Supabase → https://sitesurveyor.tech/auth/desktop-callback.html?code=…
    → sitesurveyor://app/auth/callback?code=… → operating system → app → /auth/callback?code=…
    → session established
```

The bridge pages live in `apps/web/public/auth/` and are deployed with the web bundle. They exist
because the web origin is already allowlisted (`https://sitesurveyor.tech/*`), so **no Supabase
dashboard change and no custom-scheme allowlist entry are needed**. Each page forwards to a fixed
deep link, and `src-tauri/src/lib.rs` turns that back into the in-app path, so the frontend sees the
same URL it would see in a browser and the Supabase client exchanges the PKCE code as usual.

Two consequences:

- **Deploy the web app after changing a bridge page.** If the page is missing, the browser lands on
  a 404 and the flow stops there.
- The protocol is registered with the operating system when the app starts, so the deep link works
  once the app has been opened at least once.

`VITE_PUBLIC_APP_URL` sets the bridge origin (default `https://sitesurveyor.tech`).

## Known limits

- **Browser-extension wallets.** Wallet sign-in uses the browser extensions (Phantom, Solflare), and
  a WebView2 window has none. Email and GitHub sign-in work. `app.browserExtensionsEnabled` in
  `src-tauri/tauri.conf.json` turns on the WebView2 extension environment on Windows so the user can
  install Phantom inside the app — it is experimental, so it stays off by default.
- **External payment returns.** PesePay checkout happens in the system browser and returns to a URL
  the edge function builds from the request origin — in the desktop shell that is
  `http://tauri.localhost`, which a browser cannot resolve, so the user ends on a browser error
  page. The payment itself completes server-side and the app shows the settled state after a
  refresh. Giving the edge function a client-supplied return URL would fix the landing page, but
  that URL must be validated server-side so it cannot be turned into an open redirect.
- **No deep links beyond auth.** The `sitesurveyor://app` protocol exists so auth redirects can
  reach the app, but it is not a general deep-link surface: a link from the public site or an
  email opens the website, not the app.
- **One platform at a time.** Icons and the installer set are generated for the host platform;
  run `npm --prefix apps/desktop run icon` again after changing the logo.

## Related

- [Web app guide](../web/README.md) — the shared frontend
- [Design](../../DESIGN.md) — architecture and data flows
- [Security](../../SECURITY.md) — data boundaries and deployment checklist
