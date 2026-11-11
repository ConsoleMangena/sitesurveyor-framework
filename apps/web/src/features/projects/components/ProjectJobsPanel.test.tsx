import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { ProjectJobsPanel } from "./ProjectJobsPanel.tsx";
import type { JobWithProject } from "../../../lib/repositories/jobs.ts";

const listJobs = vi.fn();
const createJob = vi.fn();
const updateJob = vi.fn();

vi.mock("@/lib/repositories/jobs", () => ({
  listJobs: (...args: unknown[]) => listJobs(...args),
  createJob: (...args: unknown[]) => createJob(...args),
  updateJob: (...args: unknown[]) => updateJob(...args),
}));

const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const PROJECT = "22222222-2222-2222-2222-222222222222";

function jobFixture(overrides: Partial<JobWithProject>): JobWithProject {
  return {
    id: "job-1",
    workspace_id: WORKSPACE,
    title: "A job",
    description: null,
    job_type: "Cadastral",
    location: null,
    status: "planned",
    project_id: PROJECT,
    project_name: "Farm boundary",
    archived_at: null,
    scheduled_start: null,
    scheduled_end: null,
    created_by: null,
    created_at: "2026-11-01T09:00:00.000Z",
    updated_at: "2026-11-01T09:00:00.000Z",
    _deleted: false,
    ...overrides,
  } as unknown as JobWithProject;
}

const fieldJob = jobFixture({ id: "job-field", title: "Boundary survey — Phase 2" });
const eoJob = jobFixture({
  id: "job-eo",
  title: "Masvingo Groundwater Siting",
  job_type: "Groundwater & Boreholes",
  description: JSON.stringify({
    category: "water",
    latitude: -19.5,
    longitude: 30.5,
    halfDeg: 0.12,
  }),
});
const otherProjectJob = jobFixture({
  id: "job-other",
  title: "Somebody else's survey",
  project_id: "99999999-9999-9999-9999-999999999999",
});
const unassignedJob = jobFixture({
  id: "job-free",
  title: "Road centreline pegging",
  project_id: null,
  project_name: null,
});

function renderPanel(onNavigate = vi.fn()) {
  const onNavigateMock = onNavigate;
  render(
    <ProjectJobsPanel
      workspaceId={WORKSPACE}
      projectId={PROJECT}
      onNavigate={onNavigateMock}
    />,
  );
  return onNavigateMock;
}

describe("ProjectJobsPanel", () => {
  beforeEach(() => {
    listJobs.mockReset();
    createJob.mockReset();
    updateJob.mockReset();
    sessionStorage.clear();
  });

  it("lists only this project's jobs and marks Earth Observation jobs", async () => {
    listJobs.mockResolvedValue([fieldJob, eoJob, otherProjectJob]);

    renderPanel();

    expect(await screen.findByText("Boundary survey — Phase 2")).toBeInTheDocument();
    expect(screen.getByText("Masvingo Groundwater Siting")).toBeInTheDocument();
    expect(screen.queryByText("Somebody else's survey")).not.toBeInTheDocument();
    // The EO job is recognisable by its survey specification in the description.
    expect(screen.getByText("EO")).toBeInTheDocument();
    expect(listJobs).toHaveBeenCalledWith(WORKSPACE);
  });

  it("opens an Earth Observation job in the workbench", async () => {
    listJobs.mockResolvedValue([eoJob]);
    const onNavigate = renderPanel();

    fireEvent.click(await screen.findByText("Masvingo Groundwater Siting"));
    fireEvent.click(screen.getByRole("button", { name: /open in earth observation/i }));

    expect(onNavigate).toHaveBeenCalledWith("satellite", { jobId: "job-eo", projectId: PROJECT });
    expect(sessionStorage.getItem("sitesurveyor:selected_job_id")).toBeNull();
    expect(sessionStorage.getItem("sitesurveyor:selected_job_name")).toBeNull();
  });

  it("hands the project context to new Earth Observation jobs", async () => {
    listJobs.mockResolvedValue([]);
    const onNavigate = renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /new earth observation/i }));

    expect(onNavigate).toHaveBeenCalledWith("satellite", { projectId: PROJECT });
    expect(sessionStorage.getItem("sitesurveyor:selected_job_project_id")).toBeNull();
  });

  it("attaches an unassigned job to the project", async () => {
    listJobs.mockResolvedValue([unassignedJob]);
    updateJob.mockResolvedValue(unassignedJob);

    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /attach job/i }));
    fireEvent.click(screen.getByText("Road centreline pegging"));

    await waitFor(() => {
      expect(updateJob).toHaveBeenCalledWith("job-free", { project_id: PROJECT });
    });
    await waitFor(() => {
      expect(screen.queryByText(/attach a job to this project/i)).not.toBeInTheDocument();
    });
  });

  it("creates a job inside the project", async () => {
    listJobs.mockResolvedValue([]);
    createJob.mockResolvedValue(fieldJob);

    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /new job/i }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Boundary survey — Phase 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create job/i }));

    await waitFor(() => {
      expect(createJob).toHaveBeenCalledWith(WORKSPACE, expect.objectContaining({
        title: "Boundary survey — Phase 2",
        project_id: PROJECT,
        status: "planned",
      }));
    });
  });
});
