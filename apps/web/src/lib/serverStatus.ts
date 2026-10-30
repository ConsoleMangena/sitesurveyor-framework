import { useEffect, useState } from "react";
import { supabase } from "./supabase/client.ts";

export type ServerStatus = "checking" | "online" | "offline";

const STATUS_POLL_MS = 30000;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

async function checkSupabaseReachable(signal?: AbortSignal): Promise<boolean> {
  // Primary check: getUser() makes a real network request via the Supabase client,
  // so it respects CORS and auth headers. Unlike getSession(), it actually verifies
  // the server is reachable.
  try {
    await supabase.auth.getUser();
    return true;
  } catch {
    // If the client probe fails, fall back to a raw health endpoint fetch.
  }

  if (!SUPABASE_URL) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: "GET",
      signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatus>("checking");

  useEffect(() => {
    let mounted = true;
    let pendingController: AbortController | null = null;

    const runCheck = async () => {
      if (!mounted) return;
      pendingController?.abort();
      pendingController = new AbortController();
      const timeoutId = window.setTimeout(
        () => pendingController?.abort(),
        8000,
      );

      try {
        const reachable = await checkSupabaseReachable(
          pendingController.signal,
        );
        if (mounted) {
          setStatus(reachable ? "online" : "offline");
        }
      } catch {
        if (mounted) setStatus("offline");
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const onVisibility = () => {
      if (!document.hidden) runCheck();
    };

    runCheck();
    const intervalId = window.setInterval(runCheck, STATUS_POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", runCheck);
    window.addEventListener("offline", runCheck);

    return () => {
      mounted = false;
      pendingController?.abort();
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", runCheck);
      window.removeEventListener("offline", runCheck);
    };
  }, []);

  return status;
}
