import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceCredits } from "./WorkspaceCredits.tsx";
import { getAiCreditBalance } from "@/lib/repositories/pesepay";

vi.mock("@/lib/repositories/pesepay", () => ({
  getAiCreditBalance: vi.fn(),
}));

describe("WorkspaceCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the balance and opens billing on click", async () => {
    vi.mocked(getAiCreditBalance).mockResolvedValue(1234);
    const onChangeView = vi.fn();
    const user = userEvent.setup();

    render(<WorkspaceCredits workspaceId="ws-1" onChangeView={onChangeView} />);

    const button = await screen.findByRole("button", {
      name: "SiteSurveyor credits: 1,234",
    });
    expect(button).toHaveTextContent("1,234");
    expect(button).toHaveAttribute("title", "SiteSurveyor credits");

    await user.click(button);
    expect(onChangeView).toHaveBeenCalledWith("billing");
  });

  it("labels the pool SiteSurveyor credits, never AI credits", async () => {
    vi.mocked(getAiCreditBalance).mockResolvedValue(0);

    render(<WorkspaceCredits workspaceId="ws-1" onChangeView={vi.fn()} />);

    const button = await screen.findByRole("button", {
      name: "SiteSurveyor credits: 0",
    });
    expect(button).toHaveTextContent("0");
    expect(button.getAttribute("aria-label")).not.toMatch(/AI credits/i);
    expect(button.getAttribute("title")).not.toMatch(/AI credits/i);
  });
});