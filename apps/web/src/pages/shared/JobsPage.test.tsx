import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import JobsPage from "./JobsPage";
import type { JobWithProject } from "../../lib/repositories/jobs";

const mocks = vi.hoisted(() => ({ listJobs: vi.fn() }));
vi.mock("../../lib/repositories/jobs", () => ({
  listJobs: mocks.listJobs, createJob: vi.fn(), updateJob: vi.fn(), archiveJob: vi.fn(), deleteJob: vi.fn(),
}));
vi.mock("../../lib/repositories/adminPlatform", () => ({ listAllJobs: vi.fn(), listAllProjects: vi.fn() }));
vi.mock("../../components/files/EntityFilesCard", () => ({ EntityFilesCard: () => null }));

function Harness() {
  const [params, setParams] = useSearchParams();
  return <>
    <output data-testid="route">{params.toString()}</output>
    <JobsPage
      workspaceId="workspace-1"
      onNavigate={(view: string, context?: Record<string, string>) => setParams({ view, ...context })}
    />
  </>;
}

function jobWith(projectId: string | null): JobWithProject {
  return {
    id: "job-1", workspace_id: "workspace-1", title: "Water survey", status: "planned",
    project_id: projectId, job_type: "Groundwater", created_at: "2026-11-01T09:00:00Z",
    description: null, scheduled_start: null, scheduled_end: null,
  } as JobWithProject;
}

beforeEach(() => {
  mocks.listJobs.mockReset();
  sessionStorage.clear();
});

describe("JobsPage EO handoff", () => {
  it("passes explicit job/project URL context for a project job", async () => {
    mocks.listJobs.mockResolvedValue([jobWith("project-1")]);
    sessionStorage.setItem("sitesurveyor:selected_job_id", "stale-job");
    sessionStorage.setItem("sitesurveyor:selected_job_project_id", "stale-project");
    render(<MemoryRouter initialEntries={["/?view=dashboard&projectId=old&runId=old&tab=jobs"]}>
      <Harness />
    </MemoryRouter>);
    fireEvent.click(await screen.findByText("Water survey"));
    fireEvent.click(screen.getByRole("button", { name: "Launch Earth Observation" }));
    const params = new URLSearchParams(screen.getByTestId("route").textContent ?? "");
    expect(Object.fromEntries(params)).toEqual({ view: "satellite", jobId: "job-1", projectId: "project-1" });
    expect(sessionStorage.getItem("sitesurveyor:selected_job_id")).toBe("stale-job");
    expect(sessionStorage.getItem("sitesurveyor:selected_job_project_id")).toBe("stale-project");
    expect(sessionStorage.getItem("sitesurveyor:selected_job_name")).toBeNull();
  });

  it("withholds the EO launcher from unassigned jobs and points at attaching instead", async () => {
    mocks.listJobs.mockResolvedValue([jobWith(null)]);
    render(<MemoryRouter initialEntries={["/?view=dashboard&projectId=old&runId=old&tab=jobs"]}>
      <Harness />
    </MemoryRouter>);
    fireEvent.click(await screen.findByText("Water survey"));
    expect(screen.queryByRole("button", { name: "Launch Earth Observation" })).not.toBeInTheDocument();
    expect(screen.getByText(/Attach this job to a project/)).toBeInTheDocument();
  });
});
