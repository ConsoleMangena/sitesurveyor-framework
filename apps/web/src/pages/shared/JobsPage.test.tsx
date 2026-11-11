import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import JobsPage from "./JobsPage";
import SatelliteSurveyCard from "../../components/dashboard/SatelliteSurveyCard";
import type { JobWithProject } from "../../lib/repositories/jobs";

const mocks = vi.hoisted(() => ({ listJobs: vi.fn() }));
vi.mock("../../lib/repositories/jobs", () => ({
  listJobs: mocks.listJobs, createJob: vi.fn(), updateJob: vi.fn(), archiveJob: vi.fn(), deleteJob: vi.fn(),
}));
vi.mock("../../lib/repositories/adminPlatform", () => ({ listAllJobs: vi.fn(), listAllProjects: vi.fn() }));
vi.mock("../../components/files/EntityFilesCard", () => ({ EntityFilesCard: () => null }));

function Harness({ card }: { card: boolean }) {
  const [params, setParams] = useSearchParams();
  const props = {
    workspaceId: "workspace-1",
    onNavigate: (view: string, context?: Record<string, string>) => setParams({ view, ...context }),
  };
  return <>
    <output data-testid="route">{params.toString()}</output>
    {card ? <SatelliteSurveyCard {...props} /> : <JobsPage {...props} />}
  </>;
}

beforeEach(() => {
  mocks.listJobs.mockReset();
  sessionStorage.clear();
});

describe.each([{ name: "JobsPage", card: false }, { name: "SatelliteSurveyCard", card: true }])("$name EO handoff", ({ card }) => {
  it.each(["project-1", null])("passes explicit job/project URL context for project %s", async (projectId) => {
    mocks.listJobs.mockResolvedValue([{
      id: "job-1", workspace_id: "workspace-1", title: "Water survey", status: "planned",
      project_id: projectId, job_type: "Groundwater", created_at: "2026-11-01T09:00:00Z",
      description: null, scheduled_start: null, scheduled_end: null,
    } as JobWithProject]);
    sessionStorage.setItem("sitesurveyor:selected_job_id", "stale-job");
    sessionStorage.setItem("sitesurveyor:selected_job_project_id", "stale-project");
    render(<MemoryRouter initialEntries={["/?view=dashboard&projectId=old&runId=old&tab=jobs"]}>
      <Harness card={card} />
    </MemoryRouter>);
    fireEvent.click(await screen.findByText("Water survey"));
    if (!card) fireEvent.click(screen.getByRole("button", { name: "Launch Earth Observation" }));
    const params = new URLSearchParams(screen.getByTestId("route").textContent ?? "");
    expect(Object.fromEntries(params)).toEqual({ view: "satellite", jobId: "job-1", ...(projectId ? { projectId } : {}) });
    expect(sessionStorage.getItem("sitesurveyor:selected_job_id")).toBe("stale-job");
    expect(sessionStorage.getItem("sitesurveyor:selected_job_project_id")).toBe("stale-project");
    expect(sessionStorage.getItem("sitesurveyor:selected_job_name")).toBeNull();
  });
});
