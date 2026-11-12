/**
 * Supported file anchoring modes on Solana.
 */
export type AnchorMode = 'hash_memo' | 'full_file_encrypted';

/**
 * File anchor status on chain.
 */
export type AnchorStatus = 'unanchored' | 'pending' | 'confirmed' | 'failed';

/**
 * On-chain file anchor receipt.
 */
export interface AnchorReceipt {
  fileId: string;
  sha256Digest: string;
  txSignature?: string;
  walletAddress: string;
  cluster: 'devnet' | 'mainnet-beta';
  anchoredAt?: string;
  mode: AnchorMode;
  status: AnchorStatus;
}

