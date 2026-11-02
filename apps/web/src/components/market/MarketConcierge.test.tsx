import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MarketConcierge } from "./MarketConcierge.tsx";
import { streamMarketReply } from "../../lib/repositories/marketChatApi.ts";

vi.mock("../../lib/repositories/marketChatApi.ts", () => ({
  MARKET_MAX_MESSAGE_CHARS: 2_000,
  streamMarketReply: vi.fn(),
}));

/** A promise whose resolution the test controls (for streaming states). */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function sendButton() {
  return screen.getByRole("button", { name: "Send message" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MarketConcierge", () => {
  it("shows the empty state with starter suggestions", () => {
    render(<MarketConcierge />);

    expect(screen.getByText("What are you looking for?")).toBeInTheDocument();
    for (const suggestion of [
      "Total stations for sale",
      "Surveyors available in Harare",
      "Open survey jobs",
      "Training courses with CPD points",
    ]) {
      expect(
        screen.getByRole("button", { name: suggestion }),
      ).toBeInTheDocument();
    }
    expect(streamMarketReply).not.toHaveBeenCalled();
  });

  it("streams a reply when a suggestion is tapped", async () => {
    vi.mocked(streamMarketReply).mockImplementation(async (_m, _h, handlers) => {
      handlers.onActivity?.("query_site_data");
      handlers.onDelta("3 matches — ");
      handlers.onDelta("Leica TS16 1\" Total Station.");
      handlers.onFinal('3 matches — Leica TS16 1" Total Station.');
    });
    const user = userEvent.setup();
    render(<MarketConcierge />);

    await user.click(screen.getByRole("button", { name: "Total stations for sale" }));

    expect(await screen.findByText(/Leica TS16/)).toBeInTheDocument();
    expect(screen.getByText("Total stations for sale")).toBeInTheDocument(); // user bubble
    expect(vi.mocked(streamMarketReply).mock.calls[0][0]).toBe(
      "Total stations for sale",
    );
    expect(vi.mocked(streamMarketReply).mock.calls[0][1]).toEqual([]);
    // After a reply, the composer is empty — send stays disabled until typing
    expect(sendButton()).toBeDisabled();
  });

  it("sends a typed message on Enter and passes prior turns as history", async () => {
    let resolveFirst: () => void;
    const firstPromise = new Promise<void>((r) => (resolveFirst = r));
    vi.mocked(streamMarketReply).mockImplementation(async (_m, _h, handlers) => {
      handlers.onFinal("");
      await firstPromise;
    });
    const user = userEvent.setup();
    render(<MarketConcierge />);
    const composer = screen.getByRole("textbox", {
      name: "Ask the market concierge",
    });

    await user.type(composer, "Open survey jobs{Enter}");
    await waitFor(() => expect(streamMarketReply).toHaveBeenCalledTimes(1));

    // First reply resolves (resets streaming)
    resolveFirst();

    let resolveSecond: () => void;
    const secondPromise = new Promise<void>((r) => (resolveSecond = r));
    vi.mocked(streamMarketReply).mockImplementation(async (_m, _h, handlers) => {
      handlers.onFinal("");
      await secondPromise;
    });
    await user.type(composer, "In Nairobi{Enter}");
    await waitFor(() => expect(streamMarketReply).toHaveBeenCalledTimes(2));

    expect(vi.mocked(streamMarketReply).mock.calls[1][0]).toBe("In Nairobi");
    expect(vi.mocked(streamMarketReply).mock.calls[1][1]).toEqual([
      { role: "user", content: "Open survey jobs" },
      { role: "assistant", content: "" },
    ]);
    resolveSecond();
  });

  it("keeps the send button disabled while a reply streams", async () => {
    const gate = deferred();
    vi.mocked(streamMarketReply).mockImplementation(() => gate.promise);
    const user = userEvent.setup();
    render(<MarketConcierge />);
    const composer = screen.getByRole("textbox", {
      name: "Ask the market concierge",
    });

    await user.type(composer, "Firms in Harare{Enter}");
    await waitFor(() => expect(streamMarketReply).toHaveBeenCalledTimes(1));

    expect(sendButton()).toBeDisabled();
    gate.resolve();
    await waitFor(() => expect(screen.getByText("Firms in Harare")).toBeInTheDocument());
  });

  it("surfaces a stream error as an alert and drops the empty bubble", async () => {
    vi.mocked(streamMarketReply).mockImplementation(async (_m, _h, handlers) => {
      handlers.onError("Too many messages — try again in 60s.");
    });
    const user = userEvent.setup();
    render(<MarketConcierge />);

    await user.click(screen.getByRole("button", { name: "Open survey jobs" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many messages — try again in 60s.",
    );
    // The failed turn leaves no thinking placeholder behind.
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
    // After error the composer is still empty — send stays disabled until typing
    expect(sendButton()).toBeDisabled();
  });
});
