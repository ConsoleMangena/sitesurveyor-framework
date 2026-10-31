import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DialogTemplate, DialogActionButtons } from "./DialogTemplate.tsx";

describe("DialogTemplate", () => {
  it("renders a panel with header, body and footer chrome", () => {
    render(
      <DialogTemplate open onOpenChange={() => {}} size="md" title="Edit widget" description="Change it.">
        <p>Body</p>
        <DialogActionButtons onCancel={() => {}} confirmLabel="Save" onConfirm={() => {}} />
      </DialogTemplate>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("dlg-sheet");
    expect(panel.getAttribute("data-size")).toBe("md");
    expect(screen.getByText("Edit widget")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("keeps the sheet chrome so the header and footer stay put", () => {
    render(
      <DialogTemplate open onOpenChange={() => {}} size="md" title="Centered panel">
        <p>Body</p>
      </DialogTemplate>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.querySelector(".dlg-header")).not.toBeNull();
    expect(panel.querySelector(".dlg-body")).not.toBeNull();
  });

  it("renders the footer region only when actions are supplied", () => {
    render(
      <DialogTemplate open onOpenChange={() => {}} title="No footer">
        <p>Body</p>
      </DialogTemplate>,
    );
    expect(screen.getByRole("dialog").querySelector(".dlg-footer")).toBeNull();
  });
});
