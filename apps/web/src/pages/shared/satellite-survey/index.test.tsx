import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate, useSearchParams } from "react-router-dom";
import SatelliteSurveyPage from "./index.tsx";
import type { SurveyRun } from "../../../lib/repositories/satelliteSurveys.ts";
import type { JobWithProject } from "../../../lib/repositories/jobs.ts";

const mocks = vi.hoisted(() => ({
  listJobs: vi.fn(), startSurvey: vi.fn(), getSurveyRunDetail: vi.fn(), updateJob: vi.fn(),
  deleteJob: vi.fn(), refresh: vi.fn(), adopt: vi.fn(), navigate: vi.fn(),
  runs: [] as SurveyRun[], jobs: [] as JobWithProject[],
}));
vi.mock("../../../lib/repositories/jobs.ts", () => ({
  listJobs: mocks.listJobs, updateJob: mocks.updateJob, deleteJob: mocks.deleteJob, createJob: vi.fn(),
}));
vi.mock("../../../lib/repositories/satelliteSurveys.ts", () => ({
  startSurvey: mocks.startSurvey, getSurveyRunDetail: mocks.getSurveyRunDetail,
  cancelSurveyRun: vi.fn(), deliverableUrl: vi.fn(), surveyTilesSource: vi.fn(() => null),
  InsufficientCreditsError: class extends Error {},
}));
vi.mock("../../../lib/hooks/useSatelliteSurveys.ts", () => ({
  useSurveyRuns: () => ({ runs: mocks.runs, loaded: true, error: null, refresh: mocks.refresh, adopt: mocks.adopt }),
  useSurveyDetail: () => ({ detail: null, error: null }),
}));
vi.mock("../../../lib/hooks/useProjects.ts", () => ({
  useProjects: () => ({ projects: [{ id: "project-a", name: "Project A" }, { id: "project-b", name: "Project B" }], loading: false, error: null, refresh: mocks.refresh }),
}));
vi.mock("../../../lib/hooks/useSurveyQuote.ts", () => ({
  useSurveyQuote: () => ({ quote: null, loading: false }),
}));
vi.mock("../../../lib/repositories/pesepay.ts", () => ({ getAiCreditBalance: vi.fn().mockResolvedValue(100) }));
vi.mock("@/components/surveys/SurveyMap.tsx", () => ({ default: () => <div data-testid="map" /> }));
vi.mock("@/components/surveys/MapExportModal.tsx", () => ({ default: () => null }));
vi.mock("@/components/surveys/IndicatorsPanel.tsx", () => ({ default: () => null }));
vi.mock("@/components/surveys/MineralsPanel.tsx", () => ({ default: () => null }));
vi.mock("@/components/surveys/ContentsPanel.tsx", () => ({
  default: ({ runs, selectedId, onSelect, jobs, onSelectJob }: {
    runs: SurveyRun[]; selectedId: string | null; onSelect: (id: string) => void;
    jobs: JobWithProject[]; onSelectJob: (job: JobWithProject) => void;
  }) => <div>
    <output data-testid="selected-run">{selectedId ?? "none"}</output>
    {runs.map((run) => <button key={run.id} onClick={() => onSelect(run.id)}>{run.id}</button>)}
    {jobs.map((job) => <button key={job.id} onClick={() => onSelectJob(job)}>Switch to {job.title}</button>)}
  </div>,
}));

function job(id: string, projectId: string | null): JobWithProject {
  return { id, title: id, workspace_id: "workspace", project_id: projectId, project_name: projectId,
    archived_at: null, location: "Harare", description: JSON.stringify({ category: "water", latitude: -17.8, longitude: 31, halfDeg: 0.06 }),
    status: "planned" } as JobWithProject;
}
function run(id: string, jobId: string, projectId: string | null, active = false): SurveyRun {
  return { id, workspaceId: "workspace", jobId, projectId, active, status: active ? "queued" : "succeeded",
    stage: null, progress: 0, latitude: -17.8, longitude: 31, halfDeg: 0.06, categories: ["water"],
    clientName: jobId, address: null, estimatedMinutes: 4, quotedCredits: null, surfaceAreaKm2: null,
    errorMessage: null, createdAt: "2026-11-10T00:00:00Z", completedAt: null, result: null };
}
function RouteProbe() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return <><output data-testid="route">{params.toString()}</output><button onClick={() => navigate(-1)}>History back</button></>;
}
function open(search = "?view=satellite") {
  return render(<MemoryRouter initialEntries={[`/workspace${search}`]}><RouteProbe /><SatelliteSurveyPage workspaceId="workspace" onNavigate={mocks.navigate} /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobs = [job("job-a", "project-a"), job("job-a2", "project-a"), job("job-b", "project-b"), job("unassigned", null)];
  mocks.runs = [run("run-b", "job-b", "project-b", true), run("run-a", "job-a", "project-a"), run("run-a-old", "job-a", "project-a")];
  mocks.listJobs.mockImplementation(async () => mocks.jobs);
  mocks.getSurveyRunDetail.mockImplementation(async (id) => {
    const found = mocks.runs.find((item) => item.id === id);
    return found ? { run: found, targets: [], deliverables: [] } : null;
  });
  mocks.updateJob.mockResolvedValue({});
});

describe("EO project/job routing", () => {
  it("keeps the project picker visible when another workspace job is running", async () => {
    open();
    expect(await screen.findByLabelText("Project")).toBeInTheDocument();
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create new job/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
    expect(screen.getByText(/Choose a project to continue/)).toBeInTheDocument();
  });

  it("restores a job from its URL and only exposes its runs and project jobs", async () => {
    open("?view=satellite&projectId=project-a&jobId=job-a");
    expect(await screen.findByTestId("map")).toBeInTheDocument();
    expect(screen.getByTestId("selected-run")).toHaveTextContent("run-a");
    expect(screen.queryByRole("button", { name: "run-b" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch to job-b" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run survey" })).toBeEnabled();
  });

  it("returns to the owning project's Jobs tab", async () => {
    open("?view=satellite&projectId=project-a&jobId=job-a");
    await screen.findByTestId("map");
    fireEvent.click(screen.getByRole("button", { name: "Back to project" }));
    expect(mocks.navigate).toHaveBeenCalledWith("projects", { projectId: "project-a", tab: "jobs" });
  });

  it("clears another job's selection when switching jobs and restores browser history", async () => {
    open("?view=satellite&projectId=project-a&jobId=job-a&runId=run-a");
    await screen.findByTestId("map");
    fireEvent.click(screen.getByRole("button", { name: "Switch to job-a2" }));
    await waitFor(() => expect(screen.getByTestId("selected-run")).toHaveTextContent("none"));
    expect(screen.getByTestId("route")).not.toHaveTextContent("runId");
    fireEvent.click(screen.getByRole("button", { name: "History back" }));
    await waitFor(() => expect(screen.getByTestId("selected-run")).toHaveTextContent("run-a"));
  });

  it("resolves a run-only deep link to its job and project", async () => {
    open("?view=satellite&runId=run-a");
    await screen.findByTestId("map");
    expect(screen.getByTestId("route")).toHaveTextContent("jobId=job-a");
    expect(screen.getByTestId("route")).toHaveTextContent("projectId=project-a");
  });

  it("refuses a run belonging to another job instead of falling back to latest", async () => {
    open("?view=satellite&projectId=project-a&jobId=job-a&runId=run-b");
    expect(await screen.findByText(/This run does not belong/)).toBeInTheDocument();
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  });

  it("refuses jobs from another project", async () => {
    open("?view=satellite&projectId=project-b&jobId=job-a");
    expect(await screen.findByText(/This job is unavailable/)).toBeInTheDocument();
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  });

  it("shows missing run errors rather than a different result", async () => {
    open("?view=satellite&runId=missing");
    expect(await screen.findByText(/This survey run could not be opened/)).toBeInTheDocument();
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  });

  it("closes an active job to its project launcher", async () => {
    open("?view=satellite&projectId=project-b&jobId=job-b");
    await screen.findByTestId("map");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Project and job" })).getByRole("button", { name: "Switch job" }));
    expect(await screen.findByText("Project Jobs")).toBeInTheDocument();
    expect(screen.getByTestId("route")).toHaveTextContent("projectId=project-b");
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  });

  it("restores job context after a transient job lookup failure", async () => {
    mocks.listJobs.mockRejectedValueOnce(new Error("Temporarily offline"));
    open("?view=satellite&projectId=project-a&jobId=job-a");
    await screen.findByText("Temporarily offline");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("map")).toBeInTheDocument();
  });

  it("resolves project context from a job-only link", async () => {
    open("?view=satellite&jobId=job-a");
    await screen.findByTestId("map");
    expect(screen.getByTestId("route")).toHaveTextContent("projectId=project-a");
  });

  it("ignores stale session selection and does not offer another job creator in Analysis", async () => {
    sessionStorage.setItem("sitesurveyor:selected_job_id", "job-b");
    open("?view=satellite&projectId=project-a&jobId=job-a");
    await screen.findByTestId("map");
    expect(screen.queryByLabelText("Workspace Job")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New Job" })).not.toBeInTheDocument();
    expect(screen.getByTestId("selected-run")).toHaveTextContent("run-a");
    sessionStorage.clear();
  });

  it("rejects a run from another workspace even when its job ID matches", async () => {
    mocks.runs[1] = { ...mocks.runs[1], workspaceId: "other-workspace" };
    open("?view=satellite&projectId=project-a&jobId=job-a&runId=run-a");
    expect(await screen.findByText(/This run does not belong/)).toBeInTheDocument();
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  });

  it("submits distinct job and project identifiers", async () => {
    mocks.startSurvey.mockResolvedValue({ run: mocks.runs[1], creditsCharged: 4, remainingBalance: 96 });
    open("?view=satellite&projectId=project-a&jobId=job-a");
    await screen.findByTestId("map");
    fireEvent.click(screen.getByRole("button", { name: "Run survey" }));
    await waitFor(() => expect(mocks.startSurvey).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-a", projectId: "project-a" })));
  });
});
