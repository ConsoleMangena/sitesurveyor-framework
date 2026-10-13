/**
 * GoogleSignInButton
 *
 * A self-contained "Continue with Google" button that starts the Supabase
 * Google OAuth (PKCE) flow. On click it redirects the browser to Google; when
 * the user returns, the Supabase client's `detectSessionInUrl` consumes the
 * callback and fires a `SIGNED_IN` event that `App.tsx` handles, so the
 * `onSuccess` callback here only runs in the unlikely case the redirect does
 * not navigate away.
 *
 * Accepts onSuccess / onError / label props so it can be swapped into the same
 * OAuth button slot as any other provider button.
 */

import { useState } from "react";
import { signInWithGoogle } from "../lib/auth/session";

interface Props {
  onSuccess?: () => void;
  onError?: (err: Error) => void;
  /** Extra CSS class names for the button */
  className?: string;
  label?: string;
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  className = "",
  label = "Continue with Google",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleClick = async () => {
    setErrorMsg("");
    setBusy(true);
    try {
      // Redirects the browser away on success.
      await signInWithGoogle();
      onSuccess?.();
    } catch (err) {
      console.error("[GoogleSignInButton] OAuth failed:", err);
      const error = err instanceof Error ? err : new Error(String(err));
      setErrorMsg(error.message);
      onError?.(error);
      setBusy(false);
    }
  };

  return (
    <div className="google-btn-wrapper">
      <button
        type="button"
        className={`auth-btn auth-btn-google ${className}`}
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
      >
        {/* Official Google "G" logo */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
          />
        </svg>

        <span>{busy ? "Redirecting to Google…" : label}</span>
      </button>

      {errorMsg && (
        <p className="form-error" style={{ marginTop: "6px", textAlign: "center" }}>
          {errorMsg}
        </p>
      )}
    </div>
  );
}
