import { describe, expect, it } from "vitest";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { shouldAutoConnectWallet } from "./shouldAutoConnectWallet.ts";

describe("shouldAutoConnectWallet", () => {
  it("allows installed wallets to reconnect automatically", () => {
    expect(
      shouldAutoConnectWallet({ readyState: WalletReadyState.Installed }),
    ).toBe(true);
  });

  it.each([
    WalletReadyState.Loadable,
    WalletReadyState.NotDetected,
    WalletReadyState.Unsupported,
  ])("skips auto-connect for %s wallets", (readyState) => {
    expect(shouldAutoConnectWallet({ readyState })).toBe(false);
  });
});
