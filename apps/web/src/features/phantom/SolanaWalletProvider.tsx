import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { SOLANA_RPC_URL } from "./lib/config.ts";
import { customWalletAdapter } from "./lib/customWalletAdapter.ts";

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  // Built-in SiteSurveyor encrypted vault adapter + standard hardware & extension adapters.
  // Wallets supporting the Solana Wallet Standard (including Brave Wallet and mobile apps)
  // are automatically detected and registered by WalletProvider.
  const wallets = useMemo(
    () => [
      customWalletAdapter,
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    [],
  );

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
