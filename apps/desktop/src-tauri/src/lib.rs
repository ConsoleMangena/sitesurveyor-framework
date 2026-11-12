//! SiteSurveyor desktop shell (Tauri v2).
//!
//! The shell wraps the shared web frontend in `apps/web`. It owns no business
//! logic: authentication, data, AI chat and payments all stay in the frontend
//! and the Supabase edge functions. What the shell adds is a native window, a
//! taskbar entry and installers — plus two responsibilities that only exist
//! because this is a window and not a browser tab.
//!
//! **Keeping the user inside the app.** The frontend links out to
//! documentation, Solana Explorer and the public site. In a browser those open
//! a new tab. In a native window an unhandled navigation replaces the app with
//! the target page, so every off-origin URL is diverted to the system browser
//! instead.
//!
//! **Bringing the user back in.** GitHub sign-in, email confirmation and
//! password reset all end in a redirect that the *browser* completes. The
//! browser cannot hand that result to a window it knows nothing about — and it
//! cannot even reach the app's origin, so GoTrue will not redirect to it. The
//! flow therefore comes back through a bridge page on the hosted web build,
//! which forwards to the `sitesurveyor://app` protocol this shell registers.
//! The operating system launches the app with that URL, and the shell turns it
//! back into an in-app navigation, so the frontend sees exactly the URL it
//! would have seen in a browser.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, Wry};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

/// Window label. The capability file grants permissions to this label only.
const MAIN_WINDOW: &str = "main";

/// The custom URL scheme the shell registers with the operating system.
///
/// The browser never navigates to this scheme directly: GoTrue cannot redirect
/// to it because a browser cannot reach the app's own origin. A bridge page on
/// the hosted web build (`apps/web/public/auth/`) forwards to it instead — see
/// `authRedirectTo` in `apps/web/src/lib/platform.ts`.
const DEEP_LINK_SCHEME: &str = "sitesurveyor";

/// The prefix every deep link carries.
///
/// The `app` segment is deliberate: the first segment of a custom-scheme URL is
/// its host, and a bare `sitesurveyor://auth/callback` would hand `auth` to the
/// operating system as a host name rather than as an app path.
const DEEP_LINK_PREFIX: &str = "sitesurveyor://app";

/// Whether `url` is served by the shell itself and may load inside the window.
///
/// A packaged build serves the SPA from the asset protocol (`http://tauri.localhost`
/// on Windows and Linux, `tauri://localhost` on macOS). A `tauri dev` run
/// serves it from the Vite server instead.
fn is_app_url(app: &AppHandle, url: &Url) -> bool {
    if tauri::is_dev() {
        if let Some(dev_url) = app.config().build.dev_url.as_ref() {
            if url.host_str() == dev_url.host_str()
                && url.port_or_known_default() == dev_url.port_or_known_default()
            {
                return true;
            }
        }
    }

    match url.scheme() {
        "tauri" => true,
        "http" | "https" => matches!(url.host_str(), Some("tauri.localhost")),
        _ => false,
    }
}

/// Hands `url` to the operating system's default browser.
///
/// Only `http` and `https` are forwarded: a `mailto:`, `tel:` or custom scheme
/// is left to the webview, which registers the protocol handler with the OS.
fn open_externally(app: &AppHandle, url: &Url) {
    if url.scheme() != "http" && url.scheme() != "https" {
        return;
    }

    if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("desktop shell: failed to open {url} externally: {error}");
    }
}

/// Navigation policy for the main window.
///
/// Off-origin navigations are cancelled and reopened in the system browser, so
/// a link click can never replace the app with a remote page.
fn on_navigation(app: &AppHandle, url: &Url) -> bool {
    if is_app_url(app, url) {
        return true;
    }

    open_externally(app, url);
    false
}

/// `target="_blank"` policy for the main window.
///
/// The frontend uses `target="_blank"` for external links. A second native
/// window would be unmanaged — no title, no icon, no shared session — so those
/// requests open in the system browser instead.
fn on_new_window(app: &AppHandle, url: Url) -> NewWindowResponse<Wry> {
    open_externally(app, &url);
    NewWindowResponse::Deny
}

/// The in-app path a `sitesurveyor://app/…` URL refers to.
///
/// `sitesurveyor://app/auth/callback?code=…` is the callback for
/// `/auth/callback`; the prefix is dropped and the rest is the path the
/// frontend routes on. The query and fragment are kept verbatim — the PKCE
/// code and the recovery token travel in them.
fn deep_link_to_app_path(url: &str) -> Option<String> {
    let rest = url.strip_prefix(DEEP_LINK_PREFIX)?;

    let (path, tail) = match rest.find(['?', '#']) {
        Some(index) => (&rest[..index], &rest[index..]),
        None => (rest, ""),
    };

    if path.is_empty() {
        return None;
    }

    Some(format!("{path}{tail}"))
}

/// Tracks whether the webview is ready to be navigated.
///
/// A deep link that arrives while the app is starting must wait: the webview
/// is still loading its first page, and a script evaluated against an empty
/// document is silently dropped — which would lose the auth callback without
/// any visible error.
#[derive(Default)]
struct DeepLinkState {
    /// The path waiting for the page to be ready.
    pending: Mutex<Option<String>>,
    /// Whether the webview has finished loading a page.
    loaded: AtomicBool,
}

/// Navigates the main window to an in-app path.
fn navigate_to(app: &AppHandle, path: &str) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };

    let _ = window.unminimize();
    let _ = window.set_focus();

    // `serde_json` renders a safe JavaScript string literal, and a relative
    // path resolves against whatever origin the window is on.
    let target = serde_json::to_string(path).unwrap_or_else(|_| "\"/\"".to_string());
    if let Err(error) = window.eval(format!("window.location.assign({target});")) {
        eprintln!("desktop shell: failed to open {path}: {error}");
    }
}

/// Routes an incoming `sitesurveyor://app/…` URL into the app.
///
/// The URL arrives from the operating system after the system browser has
/// finished an auth flow. Navigating the window to the matching in-app path
/// is what lets the Supabase client exchange the code exactly as it does in a
/// browser — the PKCE verifier is waiting in this origin's local storage.
fn route_deep_link(app: &AppHandle, url: &str) {
    let Some(path) = deep_link_to_app_path(url) else {
        return;
    };

    let state = app.state::<DeepLinkState>();
    if state.loaded.load(Ordering::Relaxed) {
        navigate_to(app, &path);
        return;
    }

    // The window is not ready yet; it navigates as soon as the first page
    // has loaded.
    *state.pending.lock().unwrap() = Some(path);
}

/// Routes every `sitesurveyor://app/…` URL that arrives, whether the app was
/// started by one or was already running when one came in.
fn watch_deep_links(app: &AppHandle) {
    let handle = app.clone();

    // A URL that arrives while the app is running.
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            route_deep_link(&handle, url.as_str());
        }
    });

    // The URL the app was started with, if any.
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        for url in urls {
            route_deep_link(app, url.as_str());
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The single-instance plugin has to come first: it is what keeps a
        // second launch — the one the operating system starts for a deep
        // link — from opening a second copy of the app. Its `deep-link`
        // feature forwards that launch's arguments to the deep-link plugin,
        // which is what makes a link open the window that is already running.
        .plugin(tauri_plugin_single_instance::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(DeepLinkState::default());

            let handle = app.handle().clone();
            let navigation_handle = handle.clone();
            let new_window_handle = handle.clone();

            // The window is built here rather than in `tauri.conf.json` because
            // the navigation and new-window handlers are only settable on the
            // builder. Size and minimum size match the config the frontend
            // layout expects.
            WebviewWindowBuilder::new(&handle, MAIN_WINDOW, WebviewUrl::App("index.html".into()))
                .title("SiteSurveyor")
                .inner_size(1280.0, 800.0)
                .min_inner_size(1024.0, 700.0)
                .resizable(true)
                .center()
                .on_navigation(move |url| on_navigation(&navigation_handle, url))
                .on_new_window(move |url, _features| on_new_window(&new_window_handle, url))
                .on_page_load(|window, payload| {
                    if !matches!(payload.event(), PageLoadEvent::Finished) {
                        return;
                    }

                    let app = window.app_handle();
                    let state = app.state::<DeepLinkState>();
                    state.loaded.store(true, Ordering::Relaxed);

                    let pending = state.pending.lock().unwrap().take();
                    if let Some(path) = pending {
                        navigate_to(app, &path);
                    }
                })
                .build()?;

            // Make sure the protocol is registered even when the app was
            // installed from an archive that could not write the registry
            // entries itself.
            #[cfg(any(windows, target_os = "linux"))]
            if let Err(error) = handle.deep_link().register_all() {
                eprintln!("desktop shell: could not register {DEEP_LINK_SCHEME}:// : {error}");
            }

            watch_deep_links(&handle);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
