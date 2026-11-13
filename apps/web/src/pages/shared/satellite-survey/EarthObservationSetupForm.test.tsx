import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import EarthObservationSetupForm from "./EarthObservationSetupForm.tsx";
import { initialForm } from "./model.ts";

const quoteSurvey = vi.fn();
const createJob = vi.fn();

vi.mock("../../../lib/repositories/satelliteSurveys.ts", () => ({
  quoteSurvey: (...args: unknown[]) => quoteSurvey(...args),
}));

vi.mock("../../../lib/repositories/jobs.ts", () => ({
  createJob: (...args: unknown[]) => createJob(...args),
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

function renderForm(props: Partial<React.ComponentProps<typeof EarthObservationSetupForm>> = {}) {
  return render(
    <EarthObservationSetupForm
      workspaceId="11111111-1111-1111-1111-111111111111"
      values={initialForm()}
      onChange={vi.fn()}
      onCreateSurvey={vi.fn()}
      projectContextId="project-1"
      projectName="Project One"
      busy={false}
      queueing={false}
      quote={null}
      quoteLoading={false}
      balance={500}
      {...props}
    />,
  );
}

describe("Earth Observation survey creation", () => {
  beforeEach(() => {
    quoteSurvey.mockReset();
    quoteSurvey.mockResolvedValue(priced);
    createJob.mockReset();
    createJob.mockResolvedValue({
      id: "survey-1",
      title: "Masvingo Groundwater Siting",
      description: "",
      location: null,
      job_type: null,
      status: "planned",
      project_id: "project-1",
      project_name: "Project One",
    });
  });

  it("opens a project-only survey form without the legacy job picker", () => {
    renderForm();
    expect(screen.getByRole("heading", { name: "New Earth Observation survey" })).toBeInTheDocument();
    expect(screen.getByText("Project One")).toBeInTheDocument();
    expect(screen.getByLabelText(/survey name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/latitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/longitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/observation extent/i)).toBeInTheDocument();
    expect(screen.queryByText(/create new job/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/project jobs/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /select job/i })).not.toBeInTheDocument();
  });

  it("shows what the specification costs before the survey is created", async () => {
    renderForm();
    await waitFor(() => expect(screen.getByRole("button", { name: /create & open survey · 17 credits/i })).toBeInTheDocument());
    expect(screen.getByText(/for 668 km² \(66,840 ha\) of ground/)).toBeInTheDocument();
  });

  it("records the specification on the survey it creates", async () => {
    const onCreateSurvey = vi.fn();
    renderForm({ onCreateSurvey });
    fireEvent.change(screen.getByLabelText(/survey name/i), {
      target: { value: "Masvingo Groundwater Siting" },
    });
    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: "-19.5" } });
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: "29.85" } });
    fireEvent.change(screen.getByLabelText(/observation extent/i), { target: { value: "0.23" } });
    fireEvent.click(screen.getByRole("button", { name: /create & open survey/i }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    const [, input] = createJob.mock.calls[0];
    expect(JSON.parse((input as { description: string }).description)).toEqual({
      category: "water",
      latitude: -19.5,
      longitude: 29.85,
      halfDeg: 0.23,
    });
    expect(onCreateSurvey).toHaveBeenCalledWith(expect.objectContaining({ id: "survey-1", project_id: "project-1" }));
  });

  it("requires a project context instead of showing a project or survey picker", () => {
    renderForm({ projectContextId: null, projectName: undefined });
    expect(screen.queryByLabelText("Project")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/survey name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create.*survey/i })).not.toBeInTheDocument();
    expect(screen.getByText("Open Earth Observation from a project")).toBeInTheDocument();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("keeps project-launched creation attached and returns to Earth Observation", async () => {
    const onNavigate = vi.fn();
    renderForm({ onNavigate });
    fireEvent.click(screen.getByRole("button", { name: "Back to project" }));
    expect(onNavigate).toHaveBeenCalledWith("projects", { projectId: "project-1", tab: "earthObservation" });
    fireEvent.change(screen.getByLabelText(/survey name/i), { target: { value: "Project survey" } });
    fireEvent.click(screen.getByRole("button", { name: /create & open survey/i }));
    await waitFor(() => expect(createJob).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ project_id: "project-1" })));
  });

  it("will not create a survey the engine could not read", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/survey name/i), { target: { value: "Somewhere unreachable" } });
    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: /create & open survey/i }));
    expect(await screen.findByText(/outside the coverage the engine can read/i)).toBeInTheDocument();
    expect(createJob).not.toHaveBeenCalled();
  });
});
