import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import EarthObservationSetupForm from "./EarthObservationSetupForm.tsx";
import type { JobWithProject } from "../../../lib/repositories/jobs.ts";
import { initialForm } from "./model.ts";

const quoteSurvey = vi.fn();
const createJob = vi.fn();
const deleteJob = vi.fn();

vi.mock("../../../lib/repositories/satelliteSurveys.ts", () => ({
  quoteSurvey: (...args: unknown[]) => quoteSurvey(...args),
  deleteSurveyRunsForJob: vi.fn(),
}));

vi.mock("../../../lib/repositories/jobs.ts", () => ({
  createJob: (...args: unknown[]) => createJob(...args),
  deleteJob: (...args: unknown[]) => deleteJob(...args),
}));

const priced = {
  credits: 17,
  surfaceAreaKm2: 668.4,
  surfaceAreaHa: 66840,
  halfDeg: 0.12,
  latitude: -19.5,
  categories: ["water" as const],
  lines: [],
};

function renderForm() {
  return render(
    <EarthObservationSetupForm
      workspaceId="11111111-1111-1111-1111-111111111111"
      values={initialForm()}
      onChange={vi.fn()}
      jobs={[]}
      jobsLoading={false}
      openedJob={null}
      onSelectJob={vi.fn()}
      onProceedToWorkbench={vi.fn()}
      onLaunchSurvey={vi.fn()}
      busy={false}
      queueing={false}
      quote={null}
      quoteLoading={false}
      balance={500}
    />,
  );
}

/** The card the operator fills in to create a job. */
function creationCard(): HTMLElement {
  const title = screen.getByText("Create New Job for Earth Observation");
  const card = title.closest("[data-slot='card']");
  if (!card) throw new Error("the job creation card is not on screen");
  return card as HTMLElement;
}

describe("Earth Observation job creation", () => {
  beforeEach(() => {
    quoteSurvey.mockReset();
    quoteSurvey.mockResolvedValue(priced);
    createJob.mockReset();
    createJob.mockResolvedValue({
      id: "job-1",
      title: "Masvingo Groundwater Siting",
      description: "",
      location: null,
      job_type: null,
      status: "planned",
      project_id: null,
      project_name: null,
    });
  });

  it("asks for the coordinate and the observation extent, not only a title", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /create new job/i }));

    const card = creationCard();
    expect(screen.getByLabelText(/latitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/longitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/observation extent/i)).toBeInTheDocument();
    expect(card).toBeInTheDocument();
  });

  it("shows exactly one extent control while a job is being created", async () => {
    // The setup form used to render the new-job extent plus the selected job's
    // "Site Coordinates & Extent" card at the same time - two editors for the
    // same AOI, each with its own state.
    const selectedJob = {
      id: "22222222-2222-2222-2222-222222222222",
      title: "Kwekwe Soil Grid",
      location: "Kwekwe",
      job_type: null,
      status: "planned",
      project_id: null,
      project_name: null,
    } as unknown as JobWithProject;
    render(
      <EarthObservationSetupForm
        workspaceId="11111111-1111-1111-1111-111111111111"
        values={{ ...initialForm(), jobId: selectedJob.id }}
        onChange={vi.fn()}
        jobs={[selectedJob]}
        jobsLoading={false}
        openedJob={selectedJob}
        onSelectJob={vi.fn()}
        onProceedToWorkbench={vi.fn()}
        onLaunchSurvey={vi.fn()}
        busy={false}
        queueing={false}
        quote={null}
        quoteLoading={false}
        balance={500}
      />,
    );

    // The selected job's config is on screen first, with its own extent control.
    expect(screen.getAllByLabelText(/observation extent/i)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /create new job/i }));
    expect(screen.getAllByLabelText(/observation extent/i)).toHaveLength(1);

    fireEvent.click(
      within(creationCard()).getByRole("button", { name: /cancel/i }),
    );
    expect(screen.getAllByLabelText(/observation extent/i)).toHaveLength(1);
  });

  it("shows what the specification costs before the job is created", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /create new job/i }));

    await waitFor(() => {
      expect(creationCard()).toHaveTextContent("17");
    });
    expect(creationCard()).toHaveTextContent("668 km²");
  });

  it("records the specification on the job it creates", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /create new job/i }));

    fireEvent.change(screen.getByLabelText(/job title/i), {
      target: { value: "Masvingo Groundwater Siting" },
    });
    fireEvent.change(screen.getByLabelText(/latitude/i), {
      target: { value: "-19.5" },
    });
    fireEvent.change(screen.getByLabelText(/longitude/i), {
      target: { value: "29.85" },
    });
    fireEvent.change(screen.getByLabelText(/observation extent/i), {
      target: { value: "0.23" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save & open/i }));

    await waitFor(() => {
      expect(createJob).toHaveBeenCalledTimes(1);
    });

    const [, input] = createJob.mock.calls[0];
    const description = JSON.parse((input as { description: string }).description);
    expect(description).toEqual({
      category: "water",
      latitude: -19.5,
      longitude: 29.85,
      halfDeg: 0.23,
    });
  });

  it("will not create a job the engine could not read", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /create new job/i }));

    fireEvent.change(screen.getByLabelText(/job title/i), {
      target: { value: "Somewhere unreachable" },
    });
    fireEvent.change(screen.getByLabelText(/latitude/i), {
      target: { value: "60" },
    });
    fireEvent.change(screen.getByLabelText(/longitude/i), {
      target: { value: "120" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save & open/i }));

    expect(
      await screen.findByText(/outside the coverage the engine can read/i),
    ).toBeInTheDocument();
    expect(createJob).not.toHaveBeenCalled();
  });
});
