import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CadMenuBar } from "./CadMenuBar.tsx";

describe("CadMenuBar actions", () => {
  function setup() {
    const handler = vi.fn();
    render(<CadMenuBar onAction={handler} />);
    return { handler };
  }

  async function openMenu(label: string) {
    await userEvent.click(screen.getByRole("button", { name: label }));
  }

  it("fires file project points action", async () => {
    const { handler } = setup();
    await openMenu("File");
    await userEvent.click(screen.getByRole("menuitem", { name: "Project Coordinates" }));
    expect(handler).toHaveBeenCalledWith("file:project-points");
  });

  it("fires import DXF action", async () => {
    const { handler } = setup();
    await openMenu("File");
    await userEvent.click(screen.getByRole("menuitem", { name: "Import DXF from Files" }));
    expect(handler).toHaveBeenCalledWith("file:import-dxf");
  });

  it("fires edit actions", async () => {
    const { handler } = setup();
    await openMenu("Edit");
    await userEvent.click(screen.getByRole("menuitem", { name: "UndoCtrl+Z" }));
    expect(handler).toHaveBeenCalledWith("edit:undo");
  });

  it("fires view actions", async () => {
    const { handler } = setup();
    await openMenu("View");
    await userEvent.click(screen.getByRole("menuitem", { name: "Zoom Extents" }));
    expect(handler).toHaveBeenCalledWith("view:zoom-extents");
  });

  it("fires plot layout action", async () => {
    const { handler } = setup();
    await openMenu("Format");
    await userEvent.click(screen.getByRole("menuitem", { name: "Plot / Layout" }));
    expect(handler).toHaveBeenCalledWith("plot:layout");
  });

  it("does not fire an action for disabled/help items", async () => {
    const { handler } = setup();
    await openMenu("Help");
    await userEvent.click(screen.getByRole("menuitem", { name: "Command Help" }));
    expect(handler).not.toHaveBeenCalled();
  });
});
