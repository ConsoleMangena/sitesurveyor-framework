import { useCallback, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { type WalletError } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { SOLANA_RPC_URL } from "./lib/config.ts";
import { customWalletAdapter } from "./lib/customWalletAdapter.ts";

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  // Built-in SiteSurveyor encrypted vault adapter + standard hardware & extension adapters.
  // Wallets supporting the Solana Wallet Standard (including Brave Wallet and mobile apps)
  // are automatically detected and registered by WalletProvider.
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      customWalletAdapter,
    ],
    [],
  );

  const handleError = useCallback((error: WalletError) => {
    // Gracefully capture adapter errors without unhandled console noise
    console.warn("[SolanaWalletProvider]", error?.name || "WalletError", error?.message);
  }, []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect onError={handleError}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

