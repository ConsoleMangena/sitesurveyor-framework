import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import PersonalWorkspaceShell from "../personal/PersonalWorkspaceShell";
import BusinessWorkspaceShell from "../business/BusinessWorkspaceShell";
import PlatformOperatorWorkspaceShell from "../platform/PlatformOperatorWorkspaceShell";
import type { UiUser, WorkspaceView } from "./types";

vi.mock("../../components/workspace/WorkspaceShell", () => ({
  default: ({ activeView, onChangeView, children }: {
    activeView: string; onChangeView: (view: WorkspaceView) => void; children: ReactNode;
  }) => <>
    <output data-testid="active-view">{activeView}</output>
    <button onClick={() => onChangeView("dashboard")}>Dashboard navigation</button>
    <button onClick={() => onChangeView("portfolio")}>Portfolio navigation</button>
    {children}
  </>,
}));

function renderView(_view: string, { onNavigate }: {
  onNavigate?: (view: string, context?: Record<string, string>) => void;
}) {
  return <>
    <button onClick={() => onNavigate?.("satellite", { projectId: "project-1", jobId: "job-1", runId: "run-1" })}>Open EO</button>
    <button onClick={() => onNavigate?.("satellite", { jobId: "unassigned" })}>Open unassigned EO</button>
    <button onClick={() => onNavigate?.("projects", { projectId: "project-1", tab: "earthObservation" })}>Return to project</button>
    <button onClick={() => onNavigate?.("admin_users", { projectId: "private" })}>Restricted navigation</button>
  </>;
}
vi.mock("../personal/viewRegistry", () => ({ renderPersonalView: (...args: Parameters<typeof renderView>) => renderView(...args) }));
vi.mock("../business/viewRegistry", () => ({ renderBusinessView: (...args: Parameters<typeof renderView>) => renderView(...args) }));

function HistoryControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return <>
    <output data-testid="search">{location.search}</output>
    <button onClick={() => navigate(-1)}>Browser Back</button>
    <button onClick={() => navigate(1)}>Browser Forward</button>
    <button onClick={() => navigate("?view=projects&projectId=external&tab=earthObservation")}>External query change</button>
  </>;
}

const user: UiUser = {
  id: "user", workspaceId: "workspace", name: "Surveyor", email: "surveyor@example.com",
  company: "Survey", accountType: "personal", signupAccountType: "personal", isPlatformAdmin: false,
};
const shells = [
  { name: "personal", Shell: PersonalWorkspaceShell },
  { name: "business", Shell: BusinessWorkspaceShell },
  { name: "platform", Shell: PlatformOperatorWorkspaceShell },
];
function query() { return new URLSearchParams(screen.getByTestId("search").textContent ?? ""); }

beforeEach(() => localStorage.clear());
describe.each(shells)("$name shell URL navigation", ({ name, Shell }) => {
  it("restores query view/context through Back and Forward and clears stale context", async () => {
    render(<MemoryRouter initialEntries={["/?view=projects&projectId=project-1&tab=earthObservation"]}>
      <Shell user={user} onLogout={vi.fn()} />
      <HistoryControls />
    </MemoryRouter>);
    expect(screen.getByTestId("active-view")).toHaveTextContent("projects");
    fireEvent.click(screen.getByText("Open EO"));
    expect(Object.fromEntries(query())).toEqual({ view: "satellite", projectId: "project-1", jobId: "job-1", runId: "run-1" });
    fireEvent.click(screen.getByText("Browser Back"));
    expect(screen.getByTestId("active-view")).toHaveTextContent("projects");
    expect(query().get("tab")).toBe("earthObservation");
    fireEvent.click(screen.getByText("Browser Forward"));
    expect(screen.getByTestId("active-view")).toHaveTextContent("satellite");
    expect(query().get("runId")).toBe("run-1");
    fireEvent.click(screen.getByText("Open unassigned EO"));
    expect(Object.fromEntries(query())).toEqual({ view: "satellite", jobId: "unassigned" });
    fireEvent.click(screen.getByText("Return to project"));
    expect(Object.fromEntries(query())).toEqual({ view: "projects", projectId: "project-1", tab: "earthObservation" });
    fireEvent.click(screen.getByText("Dashboard navigation"));
    expect(Object.fromEntries(query())).toEqual({ view: "dashboard" });
    fireEvent.click(screen.getByText("External query change"));
    expect(screen.getByTestId("active-view")).toHaveTextContent("projects");
    expect(query().get("projectId")).toBe("external");
    await waitFor(() => expect(localStorage.getItem(`sitesurveyor:lastView:${name}:workspace`)).toBe("projects"));
  });

  it("opens the professional portfolio through workspace navigation", () => {
    render(<MemoryRouter initialEntries={["/?view=dashboard"]}>
      <Shell user={user} onLogout={vi.fn()} />
      <HistoryControls />
    </MemoryRouter>);

    fireEvent.click(screen.getByText("Portfolio navigation"));
    expect(screen.getByTestId("active-view")).toHaveTextContent("portfolio");
    expect(Object.fromEntries(query())).toEqual({ view: "portfolio" });
  });

  it("uses scoped last-view fallback but gives query view precedence", () => {
    localStorage.setItem(`sitesurveyor:lastView:${name}:workspace`, "projects");
    const first = render(<MemoryRouter><Shell user={user} onLogout={vi.fn()} /><HistoryControls /></MemoryRouter>);
    expect(query().get("view")).toBe("projects");
    first.unmount();
    render(<MemoryRouter initialEntries={["/?view=satellite&jobId=unassigned"]}>
      <Shell user={user} onLogout={vi.fn()} initialView="dashboard" /><HistoryControls />
    </MemoryRouter>);
    expect(screen.getByTestId("active-view")).toHaveTextContent("satellite");
    expect(query().get("jobId")).toBe("unassigned");
  });

  it("filters inaccessible query views and navigation without carrying their context", () => {
    render(<MemoryRouter initialEntries={["/?view=admin_users&projectId=private&jobId=old"]}>
      <Shell user={user} onLogout={vi.fn()} /><HistoryControls />
    </MemoryRouter>);
    expect(screen.getByTestId("active-view")).toHaveTextContent("dashboard");
    expect(Object.fromEntries(query())).toEqual({ view: "dashboard" });
    fireEvent.click(screen.getByText("Restricted navigation"));
    expect(Object.fromEntries(query())).toEqual({ view: "dashboard" });
  });
});
