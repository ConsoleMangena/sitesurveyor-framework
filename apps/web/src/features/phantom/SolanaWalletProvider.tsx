import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { SOLANA_RPC_URL } from "./lib/config.ts";

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  // WalletProvider discovers Wallet Standard wallets, including Phantom.
  // Do not also register PhantomWalletAdapter: that creates duplicate adapters.
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
