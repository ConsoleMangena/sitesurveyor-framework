import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useState } from "react";

import { useSurveyQuote } from "./useSurveyQuote.ts";
import type { SurveyQuote } from "../surveys/pricing.ts";

const quoteSurvey = vi.fn();

vi.mock("../repositories/satelliteSurveys.ts", () => ({
  quoteSurvey: (...args: unknown[]) => quoteSurvey(...args),
}));

function priced(credits: number): SurveyQuote {
  return {
    credits,
    surfaceAreaKm2: 668.4,
    surfaceAreaHa: 66840,
    halfDeg: 0.12,
    latitude: -19.5,
    categories: ["water"],
    lines: [],
  };
}

/** A caller that re-renders for reasons of its own, with the same specification. */
function Station({ latitude }: { latitude: number }) {
  const [, setTick] = useState(0);
  const { quote, loading } = useSurveyQuote({
    categories: ["water"],
    halfDeg: 0.12,
    latitude,
  });

  return (
    <div>
      <span data-testid="price">{quote ? quote.credits : "none"}</span>
      <span data-testid="loading">{loading ? "loading" : "idle"}</span>
      <button type="button" onClick={() => setTick((tick) => tick + 1)}>
        rerender
      </button>
    </div>
  );
}

describe("useSurveyQuote", () => {
  beforeEach(() => {
    quoteSurvey.mockReset();
    quoteSurvey.mockResolvedValue(priced(17));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prices the specification once, not on every render", async () => {
    render(<Station latitude={-19.5} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(quoteSurvey).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("price")).toHaveTextContent("17");

    await act(async () => {
      screen.getByRole("button", { name: "rerender" }).click();
    });

    expect(quoteSurvey).toHaveBeenCalledTimes(1);
  });

  it("prices again when the specification changes", async () => {
    const { rerender } = render(<Station latitude={-19.5} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(quoteSurvey).toHaveBeenCalledTimes(1);

    quoteSurvey.mockResolvedValue(priced(23));
    rerender(<Station latitude={-19.6} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(quoteSurvey).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("price")).toHaveTextContent("23");
  });

  it("shows no price rather than a price of zero when the quote cannot be read", async () => {
    quoteSurvey.mockResolvedValue(null);

    render(<Station latitude={-19.5} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByTestId("price")).toHaveTextContent("none");
    expect(screen.getByTestId("loading")).toHaveTextContent("idle");
  });
});
