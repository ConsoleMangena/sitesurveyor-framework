import { WalletReadyState, type Adapter } from "@solana/wallet-adapter-base";

export function shouldAutoConnectWallet(
  adapter: Pick<Adapter, "readyState">,
): boolean {
  return adapter.readyState === WalletReadyState.Installed;
}
