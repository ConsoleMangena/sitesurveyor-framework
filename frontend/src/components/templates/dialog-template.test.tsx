import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DialogTemplate, DialogActionButtons } from "./DialogTemplate.tsx";

describe("DialogTemplate", () => {
  it("renders a square md panel with header, body and footer chrome", () => {
    render(
      <DialogTemplate open onOpenChange={() => {}} size="md" title="Edit widget" description="Change it.">
        <p>Body</p>
        <DialogActionButtons onCancel={() => {}} confirmLabel="Save" onConfirm={() => {}} />
      </DialogTemplate>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("rounded-none");
    expect(screen.getByText("Edit widget")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });
});
