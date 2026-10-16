import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { SOLANA_RPC_URL } from "./lib/config.ts";
import { customWalletAdapter } from "./lib/customWalletAdapter.ts";

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  // Phantom is discovered through Wallet Standard; the custom SiteSurveyor
  // adapter is registered explicitly alongside it.
  const wallets = useMemo(() => [customWalletAdapter], []);
  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
