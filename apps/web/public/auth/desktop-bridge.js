/**
 * Hands a finished auth redirect to the desktop app.
 *
 * The desktop shell finishes GitHub sign-in, email confirmation and password
 * reset in the *system browser*, which knows nothing about the app's window.
 * GoTrue will only redirect that browser to an origin the Supabase project
 * allowlists, and the shell's own origin (`tauri.localhost`) can never be one
 * of them — no browser can reach it.
 *
 * So the browser comes back here, to the app's own allowlisted web origin, and
 * this page forwards the redirect to the `sitesurveyor://app` protocol. The
 * operating system routes that into the desktop app, which puts the user back
 * on the in-app path with the original query and fragment intact.
 *
 * The `code` is only usable together with the PKCE verifier that the desktop
 * window is holding, so this page never reads or stores it — it only copies the
 * URL across.
 */
(function () {
  'use strict'

  // Set by the page: the deep link for this flow. Fixed per page, so a crafted
  // link cannot turn the bridge into an open redirect.
  var target = document.body.getAttribute('data-deep-link')
  if (!target) return

  // `?code=…` for PKCE flows, `#access_token=…` for implicit ones. Keep both,
  // in the order a URL expects them.
  var next = target + window.location.search + window.location.hash

  function openApp() {
    window.location.href = next
  }

  var button = document.querySelector('[data-open-app]')
  if (button) button.addEventListener('click', openApp)

  // Browsers that require a user gesture for a custom protocol ignore this;
  // the button is the way in for those.
  window.setTimeout(openApp, 250)
})()
