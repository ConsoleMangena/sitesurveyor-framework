import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { renderBusinessView } from "@/features/business/viewRegistry";
import type { UiUser, WorkspaceView } from "@/features/workspace/types";
import { FontProvider } from "@/context/font-provider";

const user: UiUser = {
  id: "preview-user",
  workspaceId: "preview-workspace",
  name: "Alex Surveyor",
  email: "alex@example.com",
  company: "Survey operations",
  accountType: "business",
  signupAccountType: "business",
  isPlatformAdmin: false,
};

function Preview() {
  const [view, setView] = useState<WorkspaceView>("dashboard");
  return (
    <MemoryRouter>
      <WorkspaceShell
        user={user}
        navGroups={[
          { items: [
            { view: "dashboard", label: "Dashboard", icon: "dashboard" },
            { view: "portfolio", label: "Professional Portfolio", icon: "person" },
            { view: "assistant", label: "SiteSurveyor AI", icon: "bot" },
          ] },
        ]}
        activeView={view}
        accountLabel="Alex Surveyor"
        onChangeView={setView}
        onLogout={() => undefined}
      >
        {view === "portfolio"
          ? renderBusinessView("portfolio", { user, onEnterFullscreenProject: () => undefined, onExitFullscreenProject: () => undefined })
          : renderBusinessView("dashboard", { user, onEnterFullscreenProject: () => undefined, onExitFullscreenProject: () => undefined })}
      </WorkspaceShell>
    </MemoryRouter>
  );
}

createRoot(document.getElementById("root")!).render(<FontProvider><Preview /></FontProvider>);
