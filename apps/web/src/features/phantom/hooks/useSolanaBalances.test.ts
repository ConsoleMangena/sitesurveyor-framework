import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client.ts", () => ({
  supabase: {},
}));

import { useSolanaBalances } from "./useSolanaBalances.ts";

const VALID_ADDRESS = "11111111111111111111111111111111";

describe("useSolanaBalances", () => {
  const makeResponse = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), { status: 200, ...init, headers: { "Content-Type": "application/json" } });

  const successResponse = (sol: number, usdc: number) =>
    new Response(JSON.stringify({ result: sol }), { status: 200, headers: { "Content-Type": "application/json" } });

  const tokenResponse = (usdc: number) =>
    new Response(
      JSON.stringify({
        result: {
          value: { amount: String(usdc * 1_000_000), decimals: 6, uiAmount: usdc },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const errorResponse = (message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 502, headers: { "Content-Type": "application/json" } });

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("import", { meta: { env: { VITE_SUPABASE_URL: "https://example.supabase.co" } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns SOL and USDC balances for an address", async () => {
    (mockFetch as any)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { value: 2_500_000_000, context: { slot: 123 } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              value: { amount: String(123.45 * 1_000_000), decimals: 6, uiAmount: 123.45 },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      );

    const { result } = renderHook(() => useSolanaBalances(VALID_ADDRESS));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sol).toBe(2.5);
    expect(result.current.usdc).toBe(123.45);
    expect(result.current.error).toBeNull();
  });

  it("treats a missing USDC token account as zero, not an error", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { value: 1_000_000_000, context: { slot: 123 } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "AccountNotFound" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      );

    const { result } = renderHook(() => useSolanaBalances(VALID_ADDRESS));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sol).toBe(1);
    expect(result.current.usdc).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it("surfaces RPC failures as an error with null balances", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "RPC unreachable" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useSolanaBalances(VALID_ADDRESS));

    await waitFor(() => expect(result.current.error).toBe("RPC unreachable"));
    expect(result.current.sol).toBeNull();
    expect(result.current.usdc).toBeNull();
  });

  it("makes no RPC calls and returns nulls when address is null", async () => {
    const { result } = renderHook(() => useSolanaBalances(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sol).toBeNull();
    expect(result.current.usdc).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});