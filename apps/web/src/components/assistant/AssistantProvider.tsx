import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { MarketConciergeDialog } from "../market/MarketConciergeDialog.tsx";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import { AssistantContext } from "./assistant-context.ts";

/** One persistent launcher for every public, auth and workspace route. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const user = useAuthStore((state) => state.user);
  const value = useMemo(() => ({ openAssistant: () => setOpen(true) }), []);

  return (
    <AssistantContext.Provider value={value}>
      {children}
      <MarketConciergeDialog
        open={open}
        onOpenChange={setOpen}
        showWorkspaceLink={Boolean(user && pathname.startsWith("/workspace"))}
      />
    </AssistantContext.Provider>
  );
}
