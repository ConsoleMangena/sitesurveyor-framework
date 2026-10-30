import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadCustomWallet = vi.hoisted(() => vi.fn());
const mockHasStoredWallet = vi.hoisted(() => vi.fn(() => false));

vi.mock("../lib/customWalletRepository.ts", () => ({
  loadCustomWallet: mockLoadCustomWallet,
  saveCustomWallet: vi.fn(),
  deleteCustomWallet: vi.fn(),
}));

vi.mock("../lib/customWalletAdapter.ts", () => ({
  customWalletAdapter: { hasStoredWallet: mockHasStoredWallet },
  CUSTOM_WALLET_NAME: "SiteSurveyor Wallet",
}));

import { useCustomWalletStatus } from "./useCustomWalletStatus.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCustomWalletStatus", () => {
  it("resolves to stored when the database has a wallet, even without a local hint", async () => {
    mockHasStoredWallet.mockReturnValue(false);
    mockLoadCustomWallet.mockResolvedValue({
      wallet_address: "Addr111",
      salt: "s",
      iv: "i",
      ciphertext: "c",
    });

    const { result } = renderHook(() => useCustomWalletStatus());
    expect(result.current.status).toBe("none"); // optimistic local hint

    await waitFor(() => expect(result.current.status).toBe("stored"));
  });

  it("resolves to none when the database has no wallet", async () => {
    mockLoadCustomWallet.mockResolvedValue(null);

    const { result } = renderHook(() => useCustomWalletStatus());

    await waitFor(() => expect(result.current.status).toBe("none"));
  });

  it("keeps the local hint when the database fetch fails", async () => {
    mockHasStoredWallet.mockReturnValue(true);
    mockLoadCustomWallet.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useCustomWalletStatus());
    expect(result.current.status).toBe("stored");

    // Give the fetch a chance to settle; status must not flip to "none".
    await waitFor(() => expect(mockLoadCustomWallet).toHaveBeenCalled());
    expect(result.current.status).toBe("stored");
  });

  it("refresh re-queries the database", async () => {
    mockLoadCustomWallet.mockResolvedValue(null);
    const { result } = renderHook(() => useCustomWalletStatus());
    await waitFor(() => expect(result.current.status).toBe("none"));

    mockLoadCustomWallet.mockResolvedValue({
      wallet_address: "Addr222",
      salt: "s",
      iv: "i",
      ciphertext: "c",
    });
    result.current.refresh();

    await waitFor(() => expect(result.current.status).toBe("stored"));
  });
});
