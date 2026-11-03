function authErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const obj = error as { message?: unknown; msg?: unknown; error?: unknown };

    for (const key of ["message", "msg"]) {
      const value = obj[key as keyof typeof obj];
      if (typeof value === "string" && value.trim()) return value.trim();
    }

    const nested = obj.error ?? (error as { details?: unknown }).details;
    if (nested !== undefined && nested !== error) {
      const nestedMsg = authErrorMessage(nested);
      if (nestedMsg) return nestedMsg;
    }

    const rawMessage = obj.message;
    if (typeof rawMessage === "string") {
      const trimmed = rawMessage.trim();
      if (
        trimmed.startsWith("{") ||
        trimmed.startsWith("[") ||
        trimmed.startsWith("\"")
      ) {
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          const parsedMsg = authErrorMessage(parsed);
          if (parsedMsg) return parsedMsg;
        } catch {
          // ignore parse failure
        }
      }
    }
  }
  return "";
}

function authErrorStatus(error: unknown): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  return undefined;
}

function authErrorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}

/**
 * User-facing sentences for the stable error codes the `web3-auth` Edge
 * Function returns. Keyed by code so a server message change never leaves
 * the UI showing a raw token.
 */
const WEB3_AUTH_CODE_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED:
    "Your session has expired. Sign in again to manage your sign-in methods.",
  RATE_LIMITED:
    "Too many attempts. Wait a moment before trying again.",
  CHALLENGE_INVALID:
    "That sign-in challenge was already used or expired. Please try again.",
  OWNERSHIP_PROOF_REQUIRED:
    "Sign the message with that wallet again to prove you still control it before removing it.",
  LAST_SIGN_IN_METHOD:
    "That is the only way you can sign in right now. Add another sign-in method first.",
  WALLET_ALREADY_LINKED:
    "That wallet already belongs to a different SiteSurveyor account.",
  WALLET_NOT_LINKED: "That wallet is not linked to your account.",
  EMAIL_NOT_ON_ACCOUNT:
    "Add and confirm that email address on your account first.",
  EMAIL_NOT_CONFIRMED:
    "Confirm that email address first — open the verification link we sent you.",
  INVALID_MESSAGE:
    "That signed message could not be read. Please try signing again.",
  INVALID_ADDRESS: "That wallet address is not valid.",
  INVALID_EMAIL: "That email address is not valid.",
  ORIGIN_MISMATCH:
    "This request came from a different origin than the signed message. Reload the page and try again.",
  UNSUPPORTED_CHAIN: "That blockchain is not supported.",
  SERVER_NOT_CONFIGURED:
    "Wallet authentication is not configured on this deployment. Please contact support.",
  SERVER_ERROR:
    "Could not complete that wallet request. Please try again.",
  INTERNAL_ERROR: "Something went wrong validating that request.",
  NETWORK_ERROR:
    "Could not reach the wallet service. Check your connection and try again.",
};

/** True when `error` is a Web3AuthError-shaped object with a known code. */
function web3AuthCode(error: unknown): string | undefined {
  const code = authErrorCode(error);
  if (!code) return undefined;
  return WEB3_AUTH_CODE_MESSAGES[code] ? code : undefined;
}

/**
 * GoTrue's redirect-based sign-in failures arrive as the `error_description`
 * GitHub put in the callback URL (or as GoTrue's own internal message), and
 * none of them tell a user what to do next. Keyed on the stable substrings of
 * those messages so the screen never shows raw provider text.
 */
const OAUTH_CALLBACK_ERROR_MESSAGES: Array<{ contains: string; message: string }> = [
  {
    contains: "error getting user profile from external provider",
    message:
      "GitHub signed you in, but it wouldn't hand your profile back to SiteSurveyor, so the sign-in couldn't finish. Try again — if it keeps happening, the GitHub sign-in app isn't allowed to read email addresses.",
  },
  {
    contains: "unable to exchange external code",
    message:
      "GitHub rejected that sign-in attempt before it could finish. Go back and start sign-in again.",
  },
  {
    contains: "provider is not enabled",
    message:
      "That sign-in method isn't enabled on this deployment. Sign in with email instead.",
  },
  {
    contains: "session has been expired",
    message:
      "That sign-in link expired. Go back and start sign-in again.",
  },
  {
    contains: "state expired",
    message:
      "That sign-in link expired. Go back and start sign-in again.",
  },
  {
    contains: "redirect is not allowed",
    message:
      "This site's address isn't in the allowed redirect list, so the provider couldn't send you back. Sign in another way and report this.",
  },
];

function oauthCallbackErrorMessage(raw: string): string | undefined {
  const lower = raw.toLowerCase();
  return OAUTH_CALLBACK_ERROR_MESSAGES.find(({ contains }) =>
    lower.includes(contains),
  )?.message;
}

/** Return the raw or a generic message for any auth error. */
export function formatAuthUserFacingError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  // Edge-function failures carry a stable code that maps to a real sentence.
  const mapped = web3AuthCode(error);
  if (mapped) return WEB3_AUTH_CODE_MESSAGES[mapped];

  if (
    error instanceof Error &&
    (error.name === "WalletNotSelectedError" ||
      error.message?.includes("Wallet not selected") ||
      error.message?.includes("WalletNotSelectedError"))
  ) {
    return "Please select a Solana wallet from the options above to continue.";
  }

  if (
    error instanceof Error &&
    (error.name === "WalletNotReadyError" ||
      error.message?.includes("Wallet not ready") ||
      error.message?.includes("WalletNotReadyError"))
  ) {
    return "The selected wallet is not installed or ready in your browser.";
  }

  const raw = authErrorMessage(error).trim();
  if (raw) {
    const oauth = oauthCallbackErrorMessage(raw);
    if (oauth) return oauth;

    const lower = raw.toLowerCase();
    if (
      lower.includes("wallet not selected") ||
      lower.includes("walletnotselectederror")
    ) {
      return "Please select a Solana wallet from the options above to continue.";
    }
    if (
      lower.includes("user rejected") ||
      lower.includes("user denied") ||
      lower.includes("signature verification failed")
    ) {
      return "Wallet authorization was cancelled. Please authorize the signature to continue.";
    }
    if (lower.includes("no sign in result returned")) {
      return "Your wallet didn't return a sign-in result. Try again, or open SiteSurveyor inside your wallet's in-app browser.";
    }
    return raw;
  }

  const code = authErrorCode(error);
  const status = authErrorStatus(error);
  if (code || status) {
    return `Authentication error${code ? ` (${code})` : ""}${status ? ` [status ${status}]` : ""}. Please try again.`;
  }

  return fallback;
}

