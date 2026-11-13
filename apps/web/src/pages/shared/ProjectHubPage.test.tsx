import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate, useSearchParams } from "react-router-dom";
import ProjectHubPage from "./ProjectHubPage";
import type { ProjectWithOrg } from "../../lib/repositories/projects";

const mocks = vi.hoisted(() => ({
  rows: [] as ProjectWithOrg[],
  refresh: vi.fn().mockResolvedValue(undefined),
  activities: vi.fn().mockResolvedValue([]),
  jobs: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../lib/hooks/useProjects", () => ({
  useProjects: () => ({ projects: mocks.rows, loading: false, error: null, refresh: mocks.refresh }),
}));
vi.mock("../../lib/repositories/projects", () => ({
  createProject: vi.fn(), updateProject: vi.fn(), archiveProject: vi.fn(),
  unarchiveProject: vi.fn(), deleteProject: vi.fn(),
  listProjectMembersForProjects: vi.fn().mockResolvedValue(new Map()),
  listProjectActivities: mocks.activities,
  createProjectActivity: vi.fn(), deleteProjectActivity: vi.fn(),
}));
vi.mock("../../lib/repositories/jobs", () => ({ listJobs: mocks.jobs, createJob: vi.fn(), updateJob: vi.fn() }));
vi.mock("../../lib/repositories/assets", () => ({ listAssets: vi.fn().mockResolvedValue([]), updateAsset: vi.fn() }));
vi.mock("../../lib/repositories/organizations", () => ({ listOrganizations: vi.fn().mockResolvedValue([]), createOrganization: vi.fn() }));
vi.mock("../../lib/repositories/invitations", () => ({ inviteWorkspaceMember: vi.fn() }));
vi.mock("../../lib/repositories/workspaces", () => ({ getMyWorkspaceMembership: vi.fn().mockResolvedValue({ role: "owner" }) }));
vi.mock("../../lib/hooks/useOfflineSyncStatus", () => ({ useOfflineSyncStatus: () => ({ status: "idle" }) }));
vi.mock("../../features/projects/components/ProjectDashboard", () => ({ ProjectDashboard: () => <div>Project overview content</div> }));
vi.mock("../../features/projects/components/ProjectSettings", () => ({ ProjectSettings: () => <div>Project settings content</div> }));

const PROJECT = "project-1";
const WORKSPACE = "workspace-1";
const row = {
  id: PROJECT, workspace_id: WORKSPACE, name: "Farm boundary", code: "FARM",
  status: "active", points: 0, progress: 0,
  created_at: "2026-11-01T09:00:00Z", updated_at: "2026-11-01T09:00:00Z",
} as ProjectWithOrg;

function Harness({ workspaceId = WORKSPACE }: { workspaceId?: string }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const onNavigate = (view: string, context?: Record<string, string>) => setParams({ view, ...context });
  return <>
    <output data-testid="route">{params.toString()}</output>
    <button onClick={() => navigate(-1)}>Browser Back</button>
    <button onClick={() => navigate(1)}>Browser Forward</button>
    {params.get("view") === "satellite" ? <>
      <div>EO workbench</div>
      <button onClick={() => onNavigate("projects", { projectId: params.get("projectId")!, tab: "earthObservation" })}>Return from EO</button>
    </> : <ProjectHubPage userName="Surveyor" workspaceId={workspaceId} onNavigate={onNavigate} />}
  </>;
}
function renderHub(entry: string) {
  return render(<MemoryRouter initialEntries={[entry]}><Harness /></MemoryRouter>);
}
function route() { return new URLSearchParams(screen.getByTestId("route").textContent ?? ""); }

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.rows = [row];
  mocks.jobs.mockResolvedValue([]);
});

describe("ProjectHubPage URL navigation", () => {
  it("opens projects, changes tabs, and exits through URL state rather than legacy storage", async () => {
    localStorage.setItem("sitesurveyorActiveProjectId", "stale-project");
    localStorage.setItem("sitesurveyorActiveProjectTab", "settings");
    renderHub("/?view=projects");
    fireEvent.click((await screen.findAllByRole("button", { name: "Open project Farm boundary" }))[0]);
    expect(await screen.findByText("Project overview content")).toBeInTheDocument();
    expect(Object.fromEntries(route())).toEqual({ view: "projects", projectId: PROJECT, tab: "overview" });
    fireEvent.click(screen.getByRole("button", { name: "Earth Observation" }));
    expect(route().get("tab")).toBe("earthObservation");
    expect(await screen.findByText("No Earth Observation surveys yet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Browser Back"));
    expect(await screen.findByText("Project overview content")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Browser Forward"));
    expect(await screen.findByText("No Earth Observation surveys yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to Projects" }));
    expect(Object.fromEntries(route())).toEqual({ view: "projects" });
    expect(localStorage.getItem("sitesurveyorActiveProjectId")).toBe("stale-project");
    expect(localStorage.getItem("sitesurveyorActiveProjectTab")).toBe("settings");
  });

  it("restores the project's Earth Observation tab after a handoff and workbench return", async () => {
    mocks.jobs.mockResolvedValue([{
      id: "job-1", project_id: PROJECT, title: "Water survey", status: "planned",
      created_at: "2026-11-01T09:00:00Z",
      description: JSON.stringify({ category: "water", latitude: -19.5, longitude: 30.5, halfDeg: 0.12 }),
    }]);
    renderHub(`/?view=projects&projectId=${PROJECT}&tab=earthObservation`);
    fireEvent.click(await screen.findByRole("button", { name: "Open survey" }));
    expect(screen.getByText("EO workbench")).toBeInTheDocument();
    expect(Object.fromEntries(route())).toEqual({ view: "satellite", projectId: PROJECT, jobId: "job-1" });
    fireEvent.click(screen.getByText("Browser Back"));
    expect(await screen.findByText("Water survey")).toBeInTheDocument();
    expect(route().get("tab")).toBe("earthObservation");
    fireEvent.click(screen.getByText("Browser Forward"));
    fireEvent.click(screen.getByText("Return from EO"));
    expect(await screen.findByText("Water survey")).toBeInTheDocument();
    expect(Object.fromEntries(route())).toEqual({ view: "projects", projectId: PROJECT, tab: "earthObservation" });
    fireEvent.click(screen.getByRole("button", { name: "New survey" }));
    expect(Object.fromEntries(route())).toEqual({ view: "satellite", projectId: PROJECT });
  });

  it.each(["missing-project", "FARM"])("shows an unavailable route instead of silently falling back for %s", async (id) => {
    renderHub(`/?view=projects&projectId=${id}&tab=earthObservation`);
    expect(await screen.findByText("Project unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No projects yet")).not.toBeInTheDocument();
    expect(mocks.activities).not.toHaveBeenCalled();
    expect(mocks.jobs).not.toHaveBeenCalled();
    expect(route().get("projectId")).toBe(id);
    fireEvent.click(screen.getByRole("button", { name: "Back to Projects" }));
    expect((await screen.findAllByRole("button", { name: "Open project Farm boundary" })).length).toBeGreaterThan(0);
  });

  it("does not resolve a route using another workspace's project rows", async () => {
    const view = render(<MemoryRouter initialEntries={[`/?view=projects&projectId=${PROJECT}&tab=earthObservation`]}>
      <Harness />
    </MemoryRouter>);
    expect(await screen.findByText("No Earth Observation surveys yet")).toBeInTheDocument();
    mocks.activities.mockClear();
    mocks.jobs.mockClear();
    view.rerender(<MemoryRouter initialEntries={[`/?view=projects&projectId=${PROJECT}&tab=earthObservation`]}>
      <Harness workspaceId="workspace-2" />
    </MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Project unavailable")).toBeInTheDocument());
    expect(screen.queryByText("No Earth Observation surveys yet")).not.toBeInTheDocument();
    expect(mocks.activities).not.toHaveBeenCalled();
    expect(mocks.jobs).not.toHaveBeenCalled();
  });
});
