import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConn = vi.hoisted(() => ({
  getBalance: vi.fn(),
  getTokenAccountBalance: vi.fn(),
}));

vi.mock("../payments/phantomPay.ts", () => ({
  getConnection: () => mockConn,
  getAssociatedTokenAddress: () => ({ toBase58: () => "ATA_MOCK" }),
}));

import { useSolanaBalances } from "./useSolanaBalances.ts";

const VALID_ADDRESS = "11111111111111111111111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSolanaBalances", () => {
  it("returns SOL and USDC balances for an address", async () => {
    mockConn.getBalance.mockResolvedValue(2_500_000_000); // 2.5 SOL
    mockConn.getTokenAccountBalance.mockResolvedValue({
      value: { uiAmount: 123.45 },
    });

    const { result } = renderHook(() => useSolanaBalances(VALID_ADDRESS));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sol).toBe(2.5);
    expect(result.current.usdc).toBe(123.45);
    expect(result.current.error).toBeNull();
  });

  it("treats a missing USDC token account as zero, not an error", async () => {
    mockConn.getBalance.mockResolvedValue(1_000_000_000);
    mockConn.getTokenAccountBalance.mockRejectedValue(new Error("AccountNotFound"));

    const { result } = renderHook(() => useSolanaBalances(VALID_ADDRESS));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sol).toBe(1);
    expect(result.current.usdc).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it("surfaces RPC failures as an error with null balances", async () => {
    mockConn.getBalance.mockRejectedValue(new Error("RPC unreachable"));

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
    expect(mockConn.getBalance).not.toHaveBeenCalled();
  });
});
