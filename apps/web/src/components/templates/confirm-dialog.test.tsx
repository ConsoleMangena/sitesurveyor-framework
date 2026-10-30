import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

describe("ConfirmDialog", () => {
  it("renders title, description and confirm action", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open onOpenChange={() => {}} title="Delete item" description="It will be removed." confirmText="Delete" onConfirm={onConfirm}>
        <p>Extra body</p>
      </ConfirmDialog>,
    );
    expect(screen.getByText("Delete item")).toBeTruthy();
    expect(screen.getByText("It will be removed.")).toBeTruthy();
    expect(screen.getByText("Extra body")).toBeTruthy();
    await userEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});