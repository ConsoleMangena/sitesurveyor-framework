import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamAiReply } from "./aiChatApi.ts";
import { supabase } from "../supabase/client.ts";

vi.mock("../supabase/client.ts", () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

const TURN_ID_PATTERN = /^[A-Za-z0-9_-]{8,160}$/;

function ndjson(events: Record<string, unknown>[]): Response {
  return new Response(
    events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
  );
}

function rejection(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status });
}

/** The JSON body sent to a mocked fetch call. */
function sentBody(fetchMock: ReturnType<typeof vi.fn>, call: number) {
  return JSON.parse(String(fetchMock.mock.calls[call][1]?.body));
}

function handlers() {
  return {
    onDelta: vi.fn(),
    onFinal: vi.fn(),
    onError: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: { access_token: "token-1" } },
  } as never);
});

describe("streamAiReply credit contract", () => {
  it("stops at a credit rejection instead of retrying the fallback runtime", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rejection(402, "Not enough AI credits for this reply."));
    vi.stubGlobal("fetch", fetchMock);
    const sink = handlers();

    await streamAiReply("conv-1", "Survey this site", sink);

    expect(sink.onError).toHaveBeenCalledWith(
      "Not enough AI credits for this reply.",
    );
    expect(sink.onFinal).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses one turn id across both runtimes so a fallback cannot double-spend", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rejection(500, "Edge runtime unavailable."))
      .mockResolvedValueOnce(ndjson([{ type: "final", text: "Done." }]));
    vi.stubGlobal("fetch", fetchMock);

    await streamAiReply("conv-1", "Survey this site", handlers());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = sentBody(fetchMock, 0);
    const second = sentBody(fetchMock, 1);
    expect(first.turn_id).toMatch(TURN_ID_PATTERN);
    expect(second.turn_id).toBe(first.turn_id);
  });

  it("streams a successful reply through the primary runtime", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      ndjson([
        { type: "delta", text: "Hello" },
        { type: "final", text: "Hello there" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const sink = handlers();

    await streamAiReply("conv-1", "Hi", sink);

    expect(sink.onDelta).toHaveBeenCalledWith("Hello");
    expect(sink.onFinal).toHaveBeenCalledWith("Hello there");
    expect(sink.onError).not.toHaveBeenCalled();
  });
});
