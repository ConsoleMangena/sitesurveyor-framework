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

/** Return the raw or a generic message for any auth error. */
export function formatAuthUserFacingError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const raw = authErrorMessage(error).trim();
  if (raw) return raw;

  const code = authErrorCode(error);
  const status = authErrorStatus(error);
  if (code || status) {
    return `Authentication error${code ? ` (${code})` : ""}${status ? ` [status ${status}]` : ""}. Please try again.`;
  }

  return fallback;
}
