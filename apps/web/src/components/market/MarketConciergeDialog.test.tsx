import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

import { MarketConciergeDialog } from "./MarketConciergeDialog.tsx";

vi.mock("./MarketConcierge.tsx", () => ({
  MarketConcierge: () => <div>Market chat content</div>,
}));

function AssistantHarness() {
  const [open, setOpen] = useState(false);
  return <MemoryRouter><MarketConciergeDialog open={open} onOpenChange={setOpen} /></MemoryRouter>;
}

describe("MarketConciergeDialog", () => {
  it("opens the compact chat from the animated bot launcher", async () => {
    const user = userEvent.setup();
    render(<AssistantHarness />);

    const launcher = screen.getByRole("button", { name: "Open SiteSurveyor assistant" });
    expect(launcher).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(launcher);

    expect(screen.getByRole("dialog", { name: "SiteSurveyor AI assistant" })).toBeInTheDocument();
    expect(screen.getByText("Market chat content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close SiteSurveyor assistant" })).toHaveAttribute("aria-expanded", "true");
  });

  it("closes with its close control and supports keyboard dismissal", async () => {
    const user = userEvent.setup();
    render(<AssistantHarness />);

    await user.click(screen.getByRole("button", { name: "Open SiteSurveyor assistant" }));
    await user.click(screen.getByRole("button", { name: "Dismiss assistant" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open SiteSurveyor assistant" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open SiteSurveyor assistant" })).toHaveFocus();
  });
});
