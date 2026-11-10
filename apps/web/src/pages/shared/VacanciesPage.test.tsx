import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VacanciesPage from "./VacanciesPage.tsx";
import type { VacancyItem } from "../../lib/repositories/vacancies.ts";
import { listVacancies } from "../../lib/repositories/vacancies.ts";
import { createMarketInquiry } from "../../lib/repositories/marketInquiries.ts";

vi.mock("../../lib/repositories/vacancies.ts", () => ({
  listVacancies: vi.fn(),
  createVacancy: vi.fn(),
  updateVacancy: vi.fn(),
  deleteVacancy: vi.fn(),
  VACANCY_DISCIPLINES: [
    "Cadastral",
    "Engineering Survey",
    "Mining",
    "Photogrammetry",
    "GIS",
    "Hydrography",
    "Scanning",
    "Geodesy",
  ],
  EMPLOYMENT_TYPES: ["contract", "permanent", "casual", "full-time", "part-time"],
  SENIORITY_LEVELS: ["Entry level", "Junior", "Mid-level", "Senior", "Lead"],
}));

vi.mock("../../lib/repositories/marketInquiries.ts", () => ({
  createMarketInquiry: vi.fn(),
}));

const mockVacancies: VacancyItem[] = [
  {
    id: "vac-001",
    title: "Licensed Cadastral Surveyor",
    company: "Harare Geomatics Ltd",
    discipline: "Cadastral",
    employment_type: "contract",
    rate: 320,
    rate_per: "day",
    currency: "USD",
    location: "Harare, Zimbabwe",
    description: "Subdivision surveys for a peri-urban land development programme.",
    requirements: ["Registered with SIRDC", "Total station and GNSS fieldwork"],
    benefits: ["Transport provided", "Field equipment supplied"],
    latitude: -17.8252,
    longitude: 31.0335,
    created_at: new Date().toISOString(),
    updated_at: null,
    status: "open",
    closes_at: "2026-12-31T00:00:00.000Z",
    starts_on: "2026-11-15",
    seniority: "Senior",
    apply_url: "https://example.com/apply/cadastral",
    photo_path: null,
    is_remote: false,
    city: "Harare",
    country: "Zimbabwe",
    saves: 5,
  },
  {
    id: "vac-002",
    title: "GIS Analyst — Utility Network",
    company: "Bulawayo Geospatial Systems",
    discipline: "GIS",
    employment_type: "permanent",
    rate: 2800,
    rate_per: "month",
    currency: "USD",
    location: "Bulawayo, Zimbabwe",
    description: "Data modeling and quality assurance for utility networks.",
    requirements: ["PostGIS experience", "QGIS fluency"],
    benefits: ["Medical aid", "Training allowance"],
    latitude: -20.153,
    longitude: 28.58,
    created_at: new Date().toISOString(),
    updated_at: null,
    status: "open",
    closes_at: "2026-12-15T00:00:00.000Z",
    starts_on: "2026-12-01",
    seniority: "Mid-level",
    apply_url: null,
    photo_path: null,
    is_remote: true,
    city: "Bulawayo",
    country: "Zimbabwe",
    saves: 2,
  },
];

describe("VacanciesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listVacancies).mockResolvedValue(mockVacancies);
  });

  it("renders vacancies and metrics rather than workspace project tasks", async () => {
    render(
      <VacanciesPage
        workspaceId="ws-123"
        user={{
          id: "u-1",
          workspaceId: "ws-123",
          name: "Test User",
          email: "user@example.com",
          company: "Survey Tech",
          accountType: "personal",
          signupAccountType: "personal",
        }}
      />,
    );

    // Verify page header
    expect(await screen.findByRole("heading", { name: /Job Vacancies/i })).toBeInTheDocument();

    // Verify vacancy cards
    expect(screen.getByText("Licensed Cadastral Surveyor")).toBeInTheDocument();
    expect(screen.getByText("Harare Geomatics Ltd")).toBeInTheDocument();
    expect(screen.getByText("GIS Analyst — Utility Network")).toBeInTheDocument();
    expect(screen.getByText("Bulawayo Geospatial Systems")).toBeInTheDocument();

    // Verify metric strip
    expect(screen.getByText("Open Vacancies")).toBeInTheDocument();
    expect(screen.getByText("Contract Roles")).toBeInTheDocument();
    expect(screen.getByText("Permanent Roles")).toBeInTheDocument();
  });

  it("filters vacancies by discipline", async () => {
    const user = userEvent.setup();
    render(
      <VacanciesPage
        workspaceId="ws-123"
        user={{
          id: "u-1",
          workspaceId: "ws-123",
          name: "Test User",
          email: "user@example.com",
          company: "Survey Tech",
          accountType: "personal",
          signupAccountType: "personal",
        }}
      />,
    );

    await screen.findByText("Licensed Cadastral Surveyor");

    // Click on GIS filter button
    const gisFilterBtn = screen.getByRole("button", { name: "GIS" });
    await user.click(gisFilterBtn);

    // GIS role remains, Cadastral role filtered out
    expect(screen.getByText("GIS Analyst — Utility Network")).toBeInTheDocument();
    expect(screen.queryByText("Licensed Cadastral Surveyor")).not.toBeInTheDocument();
  });

  it("filters vacancies by search query", async () => {
    const user = userEvent.setup();
    render(
      <VacanciesPage
        workspaceId="ws-123"
        user={{
          id: "u-1",
          workspaceId: "ws-123",
          name: "Test User",
          email: "user@example.com",
          company: "Survey Tech",
          accountType: "personal",
          signupAccountType: "personal",
        }}
      />,
    );

    await screen.findByText("Licensed Cadastral Surveyor");

    const searchInput = screen.getByPlaceholderText("Search vacancies…");
    await user.type(searchInput, "Bulawayo");

    expect(screen.getByText("GIS Analyst — Utility Network")).toBeInTheDocument();
    expect(screen.queryByText("Licensed Cadastral Surveyor")).not.toBeInTheDocument();
  });

  it("opens vacancy detail dialog and submits an application", async () => {
    const user = userEvent.setup();
    vi.mocked(createMarketInquiry).mockResolvedValue({
      id: "inq-123",
      kind: "job",
      item_id: "vac-001",
      intent: "apply",
      requester_user_id: "u-1",
      requester_workspace_id: "ws-123",
      requester_name: "Test User",
      requester_email: "user@example.com",
      message: "I have 5 years experience in cadastral boundaries.",
      desired_start_date: "2026-11-20",
      seats: null,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    render(
      <VacanciesPage
        workspaceId="ws-123"
        user={{
          id: "u-1",
          workspaceId: "ws-123",
          name: "Test User",
          email: "user@example.com",
          company: "Survey Tech",
          accountType: "personal",
          signupAccountType: "personal",
        }}
      />,
    );

    const cardTitle = await screen.findByText("Licensed Cadastral Surveyor");
    await user.click(cardTitle);

    // Detail modal opens
    expect(screen.getByText("Role Description")).toBeInTheDocument();
    expect(
      screen.getAllByText("Subdivision surveys for a peri-urban land development programme.")[0],
    ).toBeInTheDocument();
    expect(screen.getAllByText("Registered with SIRDC")[0]).toBeInTheDocument();

    // Click "Apply for This Role"
    const applyBtn = screen.getByRole("button", { name: /Apply for This Role/i });
    fireEvent.click(applyBtn);

    // Fill application form
    const msgInput = screen.getByLabelText(/Cover Note/i);
    fireEvent.change(msgInput, {
      target: { value: "I have 5 years experience in cadastral boundaries." },
    });

    const sendBtn = screen.getByRole("button", { name: /Send Application/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(createMarketInquiry).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "job",
          itemId: "vac-001",
          intent: "apply",
          requesterName: "Test User",
          requesterEmail: "user@example.com",
        }),
      );
    });

    expect(
      await screen.findByText(/Application submitted successfully/i),
    ).toBeInTheDocument();
  });
});
