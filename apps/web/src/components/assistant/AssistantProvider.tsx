import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { MarketConciergeDialog } from "../market/MarketConciergeDialog.tsx";
import { isAppOnlyPath } from "../../lib/seo/routes.ts";
import { AssistantContext } from "./assistant-context.ts";

/**
 * One persistent launcher for the public pages. The signed-in surfaces
 * (workspace, onboarding, account, auth) have their own assistant view and
 * must not show the public concierge, so the launcher is mounted only where
 * the route table marks the page public.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const value = useMemo(() => ({ openAssistant: () => setOpen(true) }), []);

  return (
    <AssistantContext.Provider value={value}>
      {children}
      {isAppOnlyPath(pathname) ? null : (
        <MarketConciergeDialog open={open} onOpenChange={setOpen} />
      )}
    </AssistantContext.Provider>
  );
}
