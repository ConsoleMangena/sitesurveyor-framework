import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetricStrip } from "./MetricStrip.tsx";

const metrics = [
  { label: "Total Projects", value: "12", subtext: "3 active", tone: "primary" as const },
  { label: "Field Sessions", value: "48" },
  { label: "Storage Used", value: "2.1 GB", subtext: "of 5 GB" },
  { label: "Open Quotes", value: "6" },
];

const tiles = (container: HTMLElement) => container.querySelectorAll('[data-slot="card"]');

describe("MetricStrip", () => {
  it("renders every metric with its label, value and subtext", () => {
    render(<MetricStrip metrics={metrics} />);

    expect(screen.getByText("Total Projects")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3 active")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("lays the tiles on the shared 2-up to 4-up grid", () => {
    const { container } = render(<MetricStrip metrics={metrics} className="mt-4" />);

    const grid = screen.getByTestId("metric-strip");
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("lg:grid-cols-4");
    expect(grid.className).toContain("mt-4");
    expect(tiles(container)).toHaveLength(4);
  });

  it("reserves the same number of tiles while loading", () => {
    const { container } = render(<MetricStrip metrics={[]} loading />);

    expect(screen.getByTestId("metric-strip")).toHaveAttribute("aria-busy", "true");
    expect(tiles(container)).toHaveLength(4);
  });

  it("gives a clickable metric button semantics and keyboard activation", () => {
    const onClick = vi.fn();
    render(<MetricStrip metrics={[{ ...metrics[0], onClick }]} />);

    const tile = screen.getByRole("button", { name: /total projects/i });
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(tile, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("leaves a metric without a handler as static content", () => {
    render(<MetricStrip metrics={[metrics[0]]} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
