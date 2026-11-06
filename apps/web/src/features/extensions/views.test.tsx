import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listWorkspaceExtensions = vi.hoisted(() => vi.fn());

vi.mock("../../lib/repositories/extensions.ts", () => ({
  listWorkspaceExtensions,
  saveWorkspaceExtension: vi.fn(),
  isMissingExtensionTable: () => false,
}));

vi.mock("../../pages/shared/satellite-survey/index.tsx", () => ({
  default: () => <div>survey console</div>,
}));

import { __resetExtensionsForTests, loadExtensions } from "./store.ts";
import { renderExtensionView } from "./views.tsx";

function row(enabled: boolean) {
  return {
    extension_id: "satellite-intelligence",
    installed: true,
    enabled,
    config: { endpoint: "https://engine.test" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  __resetExtensionsForTests();
});

describe("renderExtensionView", () => {
  it("renders nothing for a view no extension owns", () => {
    expect(renderExtensionView("dashboard", {})).toBeNull();
  });

  it("opens the extension's page while it is enabled", async () => {
    listWorkspaceExtensions.mockResolvedValue([row(true)]);
    await loadExtensions("ws-1");

    render(<>{renderExtensionView("satellite", {})}</>);

    await waitFor(() => expect(screen.getByText("survey console")).toBeInTheDocument());
  });

  it("refuses the page, and offers the switch, once the extension is off", async () => {
    listWorkspaceExtensions.mockResolvedValue([row(false)]);
    const onNavigate = vi.fn();
    await loadExtensions("ws-1");

    render(<>{renderExtensionView("satellite", { onNavigate })}</>);

    expect(screen.queryByText("survey console")).not.toBeInTheDocument();
    expect(await screen.findByText(/is switched off/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Extensions" }));

    expect(onNavigate).toHaveBeenCalledWith("extensions");
  });
});
