import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { AssistantProvider } from "./AssistantProvider.tsx";
import { useAssistant } from "./assistant-context.ts";

vi.mock("../market/MarketConciergeDialog.tsx", () => ({
  MarketConciergeDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
    <>
      <button aria-label="Open SiteSurveyor assistant" onClick={() => onOpenChange(true)}>Ask AI</button>
      {open ? <div role="dialog">Persistent assistant</div> : null}
    </>
  ),
}));

function RouteControls() {
  const navigate = useNavigate();
  const { openAssistant } = useAssistant();
  return <button onClick={() => { navigate("/workspace"); openAssistant(); }}>Go to workspace</button>;
}

describe("AssistantProvider", () => {
  it("mounts the concierge on public pages and removes it inside the workspace", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AssistantProvider>
          <Routes>
            <Route path="/" element={<RouteControls />} />
            <Route path="/workspace" element={<h1>Workspace</h1>} />
          </Routes>
        </AssistantProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("button", { name: "Open SiteSurveyor assistant" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Go to workspace" }));
    expect(screen.getByRole("heading", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open SiteSurveyor assistant" })).not.toBeInTheDocument();
  });

  it("keeps the concierge off the other signed-in surfaces", () => {
    render(
      <MemoryRouter initialEntries={["/account/security"]}>
        <AssistantProvider>
          <Routes>
            <Route path="/account/security" element={<h1>Account</h1>} />
          </Routes>
        </AssistantProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open SiteSurveyor assistant" })).not.toBeInTheDocument();
  });
});
