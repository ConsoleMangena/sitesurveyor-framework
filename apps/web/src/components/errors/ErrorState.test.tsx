import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ErrorState from "./ErrorState.tsx";

vi.mock("@/lib/clearSiteData", () => ({
  clearSiteData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/appErrorUtils.ts", () => ({
  isDynamicImportError: (error: Error) =>
    error.message.toLowerCase().includes("dynamically imported module"),
}));

describe("ErrorState", () => {
  it("renders the runtime state and calls onRetry", () => {
    const onRetry = vi.fn();
    render(<ErrorState kind="runtime" onRetry={onRetry} />);

    expect(screen.getByRole("heading", { name: "We hit a temporary problem" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("promotes dynamic import failures to the chunk state", () => {
    render(<ErrorState kind="runtime" error={new Error("Failed to fetch dynamically imported module")} />);

    expect(screen.getByRole("heading", { name: "This page needs a fresh copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh app" })).toBeInTheDocument();
  });

  it("renders offline with a retry action", () => {
    render(<ErrorState kind="offline" onRetry={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "You appear to be offline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders a 404 without a retry action", () => {
    render(<ErrorState kind="not-found" />);

    expect(screen.getByRole("heading", { name: "That page moved or does not exist" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go home" })).toBeInTheDocument();
  });
});
