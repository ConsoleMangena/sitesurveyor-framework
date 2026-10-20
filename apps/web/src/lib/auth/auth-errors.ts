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
    return raw;
  }

  const code = authErrorCode(error);
  const status = authErrorStatus(error);
  if (code || status) {
    return `Authentication error${code ? ` (${code})` : ""}${status ? ` [status ${status}]` : ""}. Please try again.`;
  }

  return fallback;
}

