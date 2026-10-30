import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ErrorNotice from "./ErrorNotice.tsx";

describe("ErrorNotice", () => {
  it("renders danger notices as alerts with a title and message", () => {
    render(
      <ErrorNotice tone="danger" title="Upload failed">
        Please retry the file.
      </ErrorNotice>,
    );

    expect(screen.getByRole("alert")).toHaveAttribute("data-tone", "danger");
    expect(screen.getByText("Upload failed")).toBeInTheDocument();
    expect(screen.getByText("Please retry the file.")).toBeInTheDocument();
  });

  it("renders informational tones as status regions", () => {
    render(<ErrorNotice tone="info">Syncing changes.</ErrorNotice>);

    expect(screen.getByRole("status")).toHaveTextContent("Syncing changes.");
  });

  it("calls onDismiss from the labeled dismiss button", () => {
    const onDismiss = vi.fn();
    render(
      <ErrorNotice tone="warning" onDismiss={onDismiss}>
        You are offline.
      </ErrorNotice>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
