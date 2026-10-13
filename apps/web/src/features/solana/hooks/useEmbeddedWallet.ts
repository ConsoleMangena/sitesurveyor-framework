import { useContext } from "react";
import { EmbeddedWalletContext } from "../contexts/EmbeddedWalletContext.ts";
import type { EmbeddedWalletContextValue } from "../contexts/EmbeddedWalletContext.ts";

export function useEmbeddedWallet(): EmbeddedWalletContextValue {
  const ctx = useContext(EmbeddedWalletContext);
  if (!ctx) {
    throw new Error(
      "useEmbeddedWallet must be used within an EmbeddedWalletProvider.",
    );
  }
  return ctx;
}
