import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import EarthObservationSetupForm from "./EarthObservationSetupForm.tsx";
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

  it("asks for the area and the surface area, not only a title", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /create new job/i }));

    const card = creationCard();
    expect(screen.getByLabelText(/latitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/longitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/surface area/i)).toBeInTheDocument();
    expect(card).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText(/surface area/i), {
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
