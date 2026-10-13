/**
 * Solana network configuration, driven entirely by Vite env vars so the same
 * build can target devnet or mainnet-beta without code changes.
 *
 *   VITE_SOLANA_CLUSTER          devnet | mainnet-beta   (default: devnet)
 *   VITE_SOLANA_RPC_URL          full RPC endpoint        (default: cluster URL)
 *   VITE_SOLANA_USDC_MINT        USDC SPL mint address    (cluster-specific)
 *   VITE_SOLANA_TREASURY_ADDRESS recipient wallet (base58)
 */

export type SolanaCluster = "devnet" | "mainnet-beta" | "testnet";

/** Canonical USDC mints per cluster (used as fallback defaults). */
const DEFAULT_USDC_MINT: Record<SolanaCluster, string> = {
  // Circle's official devnet USDC mint.
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  // Circle's official mainnet USDC mint.
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  testnet: "CpMah17kQEL2wqyMKt3mZBdTnZbkbfx4nqmQMFDP5vwp",
};

const DEFAULT_RPC_URL: Record<SolanaCluster, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  testnet: "https://api.testnet.solana.com",
};

const env = import.meta.env;

export const SOLANA_CLUSTER: SolanaCluster =
  (env.VITE_SOLANA_CLUSTER as SolanaCluster) || "devnet";

export const SOLANA_RPC_URL: string =
  env.VITE_SOLANA_RPC_URL || DEFAULT_RPC_URL[SOLANA_CLUSTER];

export const SOLANA_USDC_MINT: string =
  env.VITE_SOLANA_USDC_MINT || DEFAULT_USDC_MINT[SOLANA_CLUSTER];

export const SOLANA_TREASURY_ADDRESS: string =
  env.VITE_SOLANA_TREASURY_ADDRESS || "";

/** USDC is a 6-decimal SPL token. */
export const USDC_DECIMALS = 6;

/** Convert a USD/USDC decimal amount to the smallest unit (base units). */
export function toUsdcBaseUnits(amount: number): bigint {
  // Round to avoid floating-point dust beyond 6 dp.
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

/** True when the treasury address is configured (payments can proceed). */
export function isOnChainPaymentConfigured(): boolean {
  return SOLANA_TREASURY_ADDRESS.trim().length > 0;
}
