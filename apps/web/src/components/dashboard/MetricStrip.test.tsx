import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricStrip } from "./MetricStrip.tsx";

describe("MetricStrip responsive layout", () => {
  function renderStrip() {
    return render(
      <MetricStrip
        metrics={[
          {
            label: "Total Projects",
            value: "12",
            subtext: "3 active",
            accentColor: "#2563eb",
            icon: <svg data-testid="metric-icon" />,
          },
        ]}
      />,
    );
  }

  it("renders the metric content as a mobile column that becomes a row at sm", () => {
    renderStrip();
    const content = screen.getByTestId("metric-strip-item-content");
    expect(content.className).toContain("flex-col");
    expect(content.className).toContain("sm:flex-row");
  });

  it("renders the icon above the label text in the DOM order", () => {
    renderStrip();
    const content = screen.getByTestId("metric-strip-item-content");
    const icon = screen.getByTestId("metric-icon");
    const label = screen.getByText("Total Projects");
    expect(
      icon.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(content.contains(icon)).toBe(true);
  });
});
