import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPricingPage from "./AdminPricingPage.tsx";
import {
  getAdminPricingConfiguration,
  updateBillingOperationRate,
  updateBillingPackage,
  updateSurveyCreditRate,
} from "../../lib/repositories/adminPricing.ts";

vi.mock("../../lib/repositories/adminPricing.ts", () => ({
  getAdminPricingConfiguration: vi.fn(),
  updateBillingPackage: vi.fn(),
  updateBillingOperationRate: vi.fn(),
  updateSurveyCreditRate: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const packageRow = {
  id: "credits-100",
  kind: "ai_credits",
  label: "100 AI credits",
  description: "For occasional work",
  credits: 100,
  storage_mb: null,
  duration_days: null,
  amount: 5,
  currency_code: "USD",
  estimated_infrastructure_cost: 1,
  estimated_payment_fee: 0.18,
  active: true,
  sort_order: 10,
  created_at: "2026-11-14T00:00:00Z",
  updated_at: "2026-11-14T00:00:00Z",
};
const operationRow = {
  operation: "ai.chat",
  credits: 2,
  estimated_cost: 0.02,
  active: true,
  updated_at: "2026-11-14T00:00:00Z",
};
const surveyRow = {
  category: "water",
  label: "Groundwater survey",
  base_credits: 4,
  per_hectare_credits: 0.00018,
  minimum_credits: 10,
  estimated_cost: 0.17,
  active: true,
  updated_at: "2026-11-14T00:00:00Z",
};
const config = { packages: [packageRow], operations: [operationRow], surveys: [surveyRow] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAdminPricingConfiguration).mockResolvedValue(config);
  vi.mocked(updateBillingPackage).mockResolvedValue();
  vi.mocked(updateBillingOperationRate).mockResolvedValue();
  vi.mocked(updateSurveyCreditRate).mockResolvedValue();
});

describe("AdminPricingPage", () => {
  it("does not expose the pricing editor or fetch rates for non-admins", () => {
    const { container } = render(<AdminPricingPage isPlatformAdmin={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(getAdminPricingConfiguration).not.toHaveBeenCalled();
  });

  it("reports a load error without rendering an empty price editor", async () => {
    vi.mocked(getAdminPricingConfiguration).mockRejectedValue(new Error("Pricing read denied"));
    render(<AdminPricingPage isPlatformAdmin />);
    expect(await screen.findByText("Pricing read denied")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit price" })).not.toBeInTheDocument();
  });

  it("edits a full package including its entitlement and status, then reloads", async () => {
    const user = userEvent.setup();
    vi.mocked(updateBillingPackage).mockImplementation(async () => {
      vi.mocked(getAdminPricingConfiguration).mockResolvedValue({
        ...config,
        packages: [{ ...packageRow, amount: 6.25, credits: 125, active: false, label: "125 AI credits" }],
      });
    });
    render(<AdminPricingPage isPlatformAdmin />);
    await user.click(await screen.findByRole("button", { name: "Edit price" }));
    await user.clear(screen.getByLabelText("Package name"));
    await user.type(screen.getByLabelText("Package name"), "125 AI credits");
    await user.clear(screen.getByLabelText("Credit entitlement"));
    await user.type(screen.getByLabelText("Credit entitlement"), "125");
    await user.clear(screen.getByLabelText("Price (USD)"));
    await user.type(screen.getByLabelText("Price (USD)"), "6.25");
    await user.click(screen.getByRole("switch", { name: "Available for future charges" }));
    await user.click(screen.getByRole("button", { name: "Save pricing" }));

    expect(updateBillingPackage).toHaveBeenCalledWith("credits-100", expect.objectContaining({
      amount: 6.25,
      credits: 125,
      storage_mb: null,
      duration_days: null,
      active: false,
      label: "125 AI credits",
      estimated_infrastructure_cost: 1,
      estimated_payment_fee: 0.18,
      sort_order: 10,
    }));
    expect(await screen.findByText("$6.25")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save pricing" })).not.toBeInTheDocument();
    expect(getAdminPricingConfiguration).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid package prices in the browser", async () => {
    const user = userEvent.setup();
    render(<AdminPricingPage isPlatformAdmin />);
    await user.click(await screen.findByRole("button", { name: "Edit price" }));
    await user.clear(screen.getByLabelText("Price (USD)"));
    await user.type(screen.getByLabelText("Price (USD)"), "0");
    await user.click(screen.getByRole("button", { name: "Save pricing" }));
    expect(await screen.findByText("Price must be greater than zero.")).toBeInTheDocument();
    expect(updateBillingPackage).not.toHaveBeenCalled();
  });

  it("keeps a failed package save open and preserves entered values", async () => {
    const user = userEvent.setup();
    vi.mocked(updateBillingPackage).mockRejectedValue(new Error("Write denied"));
    render(<AdminPricingPage isPlatformAdmin />);
    await user.click(await screen.findByRole("button", { name: "Edit price" }));
    const price = screen.getByLabelText("Price (USD)");
    await user.clear(price);
    await user.type(price, "9.50");
    await user.click(screen.getByRole("button", { name: "Save pricing" }));
    expect(await screen.findByText("Write denied")).toBeInTheDocument();
    expect(screen.getByLabelText("Price (USD)")).toHaveValue("9.50");
    expect(getAdminPricingConfiguration).toHaveBeenCalledTimes(1);
  });

  it("saves an AI operation rate", async () => {
    const user = userEvent.setup();
    render(<AdminPricingPage isPlatformAdmin />);
    await user.click(await screen.findByRole("tab", { name: "AI operations (1)" }));
    await user.click(screen.getByRole("button", { name: "Edit price" }));
    await user.clear(screen.getByLabelText("Credits per operation"));
    await user.type(screen.getByLabelText("Credits per operation"), "3");
    await user.click(screen.getByRole("button", { name: "Save pricing" }));
    expect(updateBillingOperationRate).toHaveBeenCalledWith("ai.chat", {
      credits: 3, estimated_cost: 0.02, active: true,
    });
  });

  it("saves an inactive survey formula with eight-decimal hectare pricing", async () => {
    const user = userEvent.setup();
    render(<AdminPricingPage isPlatformAdmin />);
    await user.click(await screen.findByRole("tab", { name: "Survey formulas (1)" }));
    await user.click(screen.getByRole("button", { name: "Edit price" }));
    await user.clear(screen.getByLabelText("Credits per hectare"));
    await user.type(screen.getByLabelText("Credits per hectare"), "0.00018001");
    await user.click(screen.getByRole("switch", { name: "Available for future charges" }));
    await user.click(screen.getByRole("button", { name: "Save pricing" }));
    expect(updateSurveyCreditRate).toHaveBeenCalledWith("water", {
      label: "Groundwater survey",
      base_credits: 4,
      per_hectare_credits: 0.00018001,
      minimum_credits: 10,
      estimated_cost: 0.17,
      active: false,
    });
  });
});
