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

/** True when Supabase reports the user must confirm their email before signing in. */
export function isEmailNotConfirmedError(error: unknown): boolean {
  if (authErrorCode(error) === "email_not_confirmed") return true;
  const msg = authErrorMessage(error).toLowerCase();
  return (
    msg.includes("email not confirmed") ||
    msg.includes("confirm your email") ||
    msg.includes("email address not confirmed")
  );
}

/** User-facing copy when Supabase Auth hits email / OTP rate limits (429). */
export function formatAuthRateLimitMessage(error: unknown): string | null {
  const raw = authErrorMessage(error);
  const msg = raw.toLowerCase();
  const status = authErrorStatus(error);

  if (
    status !== 429 &&
    !msg.includes("rate limit") &&
    !msg.includes("too many requests")
  ) {
    return null;
  }

  return (
    "Email sending is temporarily limited (Supabase caps how many confirmation or reset emails " +
    "can go out per hour on the built-in mailer). Wait about an hour and try again, or configure " +
    "custom SMTP under Supabase Dashboard → Authentication → Emails → SMTP Settings for higher limits."
  );
}

function friendlyAuthErrorMessage(error: unknown): string | null {
  const raw = authErrorMessage(error).toLowerCase();
  const code = authErrorCode(error)?.toLowerCase() ?? "";

  if (
    code === "user_already_exists" ||
    raw.includes("user_already_exists") ||
    raw.includes("already registered") ||
    raw.includes("email already in use") ||
    raw.includes("user with this email")
  ) {
    return (
      "An account with this email already exists. If you recently deleted it, " +
      "it may still be in the deletion grace period. Try signing in, or wait a few minutes and try again."
    );
  }

  if (
    code === "email_not_confirmed" ||
    raw.includes("email not confirmed") ||
    raw.includes("confirm your email")
  ) {
    return "Please confirm your email address before signing in.";
  }

  if (
    code === "invalid_credentials" ||
    raw.includes("invalid credentials") ||
    raw.includes("invalid login credentials")
  ) {
    return "Incorrect email or password. Please try again.";
  }

  if (
    code === "weak_password" ||
    raw.includes("weak password") ||
    raw.includes("password should")
  ) {
    return "Please choose a stronger password. Use at least 8 characters including letters and numbers.";
  }

  // Let raw 5xx messages through so debugging isn't hidden; we'll fall back
  // below only when the message is truly empty.
  return null;
}

/** Prefer rate-limit explanation; otherwise return the original error message. */
export function formatAuthUserFacingError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const rate = formatAuthRateLimitMessage(error);
  if (rate) return rate;

  const friendly = friendlyAuthErrorMessage(error);
  if (friendly) return friendly;

  const raw = authErrorMessage(error).trim();
  if (raw) return raw;

  const code = authErrorCode(error);
  const status = authErrorStatus(error);
  if (code || status) {
    return `Authentication error${code ? ` (${code})` : ""}${status ? ` [status ${status}]` : ""}. Please try again.`;
  }

  return fallback;
}
