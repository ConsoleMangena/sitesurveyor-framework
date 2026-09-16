/**
 * Solana Pay style USDC transfer builder.
 *
 * Implements the small slice of the Solana Pay spec we need:
 *   - a USDC (SPL token) transfer to the workspace treasury
 *   - a unique `reference` public key attached as a read-only, non-signer key
 *     on the transfer instruction, so the backend can correlate the on-chain
 *     transaction with a specific invoice without trusting the client.
 *
 * The SPL-token transfer instruction and associated-token-account derivation
 * are built directly with @solana/web3.js to avoid pulling in @solana/spl-token
 * (and @solana/pay) as extra dependencies.
 */

import { Buffer } from "buffer";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  SOLANA_RPC_URL,
  SOLANA_TREASURY_ADDRESS,
  SOLANA_USDC_MINT,
  toUsdcBaseUnits,
} from "../lib/config";
import {
  connectWallet,
  isUserRejection,
  type SolanaWalletProvider,
} from "../lib/provider";

// Well-known program IDs.
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

let connection: Connection | null = null;
export function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(SOLANA_RPC_URL, "confirmed");
  }
  return connection;
}

/** Derive the associated token account (ATA) for an owner + mint. */
export function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

/** Encode an SPL-token `TransferChecked` (instruction 12) data buffer. */
function encodeTransferChecked(amount: bigint, decimals: number): Uint8Array {
  const data = new Uint8Array(10);
  data[0] = 12; // TransferChecked discriminator
  const view = new DataView(data.buffer);
  view.setBigUint64(1, amount, true); // little-endian u64 amount
  data[9] = decimals;
  return data;
}

export interface BuildTransferResult {
  signature: string;
  reference: string;
  walletAddress: string;
}

export interface InvoicePaymentRequest {
  /** Invoice total in USD (== USDC, 1:1). */
  amount: number;
  /** Opaque memo correlated server-side (e.g. invoice id). Optional. */
  invoiceId?: string;
}

/**
 * Build the USDC transfer instruction to the treasury.
 * This instruction carries a unique reference key for server-side correlation.
 */
export function buildUsdcTransferInstruction(
  payer: PublicKey,
  treasury: PublicKey,
  amount: number,
): {
  instruction: TransactionInstruction;
  reference: PublicKey;
  sourceAta: PublicKey;
  destAta: PublicKey;
} {
  const mint = new PublicKey(SOLANA_USDC_MINT);
  const sourceAta = getAssociatedTokenAddress(mint, payer);
  const destAta = getAssociatedTokenAddress(mint, treasury);
  const reference = Keypair.generate().publicKey;

  const amountBaseUnits = toUsdcBaseUnits(amount);

  const transferIx = new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: sourceAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destAta, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: false },
      // Solana Pay reference: read-only, non-signer marker key.
      { pubkey: reference, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(encodeTransferChecked(amountBaseUnits, 6)),
  });

  return { instruction: transferIx, reference, sourceAta, destAta };
}

/** Size in bytes of an SPL token account (for rent-exemption calculations). */
const TOKEN_ACCOUNT_SIZE = 165;

/** Estimate the network cost of a USDC transfer, in SOL. */
export async function estimateUsdcTransferFee(amount: number): Promise<number> {
  if (!SOLANA_TREASURY_ADDRESS) return 0;
  const treasury = new PublicKey(SOLANA_TREASURY_ADDRESS);
  const placeholderPayer = new PublicKey(
    "11111111111111111111111111111111",
  );
  const { instruction: transferIx, destAta } = buildUsdcTransferInstruction(
    placeholderPayer,
    treasury,
    amount,
  );
  const conn = getConnection();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.feePayer = placeholderPayer;
  tx.recentBlockhash = blockhash;

  // When the treasury has no USDC account yet the payer also funds its
  // rent-exempt deposit. The rent is not part of the signature fee, so add it
  // explicitly for a realistic cost estimate.
  let rentLamports = 0;
  const destInfo = await conn.getAccountInfo(destAta, "confirmed");
  if (!destInfo) {
    tx.add(
      createAtaInstruction(
        placeholderPayer,
        destAta,
        treasury,
        new PublicKey(SOLANA_USDC_MINT),
      ),
    );
    rentLamports = await conn.getMinimumBalanceForRentExemption(
      TOKEN_ACCOUNT_SIZE,
    );
  }
  tx.add(transferIx);

  const { value } = await conn.getFeeForMessage(tx.compileMessage(), "confirmed");
  return ((value ?? 0) + rentLamports) / LAMPORTS_PER_SOL;
}

/**
 * Pay an invoice with USDC.
 *
 * When `signer` is provided (embedded wallet), the transaction is signed
 * directly in-app. Otherwise we fall back to an external wallet provider such
 * as Phantom or Solflare.
 *
 * If the treasury's USDC token account does not exist yet, the transaction
 * prepends an associated-token-account `Create` instruction funded by the
 * payer; otherwise the transfer would fail on-chain on the very first payment.
 */
export async function payInvoiceWithUsdc(
  request: InvoicePaymentRequest,
  signer?: Keypair,
): Promise<BuildTransferResult> {
  if (!SOLANA_TREASURY_ADDRESS) {
    throw new Error(
      "On-chain payments are not configured (missing treasury address).",
    );
  }

  const treasury = new PublicKey(SOLANA_TREASURY_ADDRESS);
  let payer: PublicKey;
  let walletAddress: string;
  let provider: SolanaWalletProvider | undefined;

  if (signer) {
    payer = signer.publicKey;
    walletAddress = signer.publicKey.toBase58();
  } else {
    const connected = await connectWallet();
    if (!connected.provider.signAndSendTransaction) {
      throw new Error(
        "This wallet does not support sending transactions. Use Phantom or Solflare.",
      );
    }
    provider = connected.provider;
    walletAddress = connected.walletAddress;
    payer = new PublicKey(connected.walletAddress);
  }

  const conn = getConnection();
  const { instruction: transferIx, reference, destAta } =
    buildUsdcTransferInstruction(payer, treasury, request.amount);

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;

  // Create the treasury's USDC account on the first payment (payer pays rent).
  const destInfo = await conn.getAccountInfo(destAta, "confirmed");
  if (!destInfo) {
    tx.add(
      createAtaInstruction(
        payer,
        destAta,
        treasury,
        new PublicKey(SOLANA_USDC_MINT),
      ),
    );
  }
  tx.add(transferIx);

  let signature: string;
  if (signer) {
    tx.sign(signer);
    signature = await conn.sendRawTransaction(tx.serialize(), {
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(signature, "confirmed");
  } else {
    signature = (await sendWithProvider(provider!, tx)).signature;
  }

  return { signature, reference: reference.toBase58(), walletAddress };
}

async function sendWithProvider(
  provider: SolanaWalletProvider,
  tx: Transaction,
): Promise<{ signature: string }> {
  try {
    return await provider.signAndSendTransaction!(tx);
  } catch (err) {
    if (isUserRejection(err)) {
      throw new Error("Payment cancelled in wallet.");
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** Manually build the SPL Associated Token Account `Create` instruction. */
function createAtaInstruction(
  payer: PublicKey,
  associatedAccount: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedAccount, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

export interface SendTokensRequest {
  keypair: Keypair;
  token: "SOL" | "USDC";
  recipient: string;
  amount: number;
}

export interface SendTokensResult {
  signature: string;
  walletAddress: string;
}

/**
 * Send SOL or USDC from the embedded wallet to an arbitrary recipient.
 * For USDC, the recipient's associated token account is created automatically
 * if it does not already exist.
 */
export async function sendTokens(
  request: SendTokensRequest,
): Promise<SendTokensResult> {
  const { keypair, token, recipient, amount } = request;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a positive amount.");
  }

  let recipientPublicKey: PublicKey;
  try {
    recipientPublicKey = new PublicKey(recipient);
  } catch {
    throw new Error("Invalid recipient address.");
  }

  const conn = getConnection();
  const payer = keypair.publicKey;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;

  if (token === "SOL") {
    const transferIx = SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: recipientPublicKey,
      lamports: Math.round(amount * LAMPORTS_PER_SOL),
    });
    tx.add(transferIx);
  } else {
    const mint = new PublicKey(SOLANA_USDC_MINT);
    const sourceAta = getAssociatedTokenAddress(mint, payer);
    const destAta = getAssociatedTokenAddress(mint, recipientPublicKey);

    const sourceInfo = await conn.getAccountInfo(sourceAta, "confirmed");
    if (!sourceInfo) {
      throw new Error(
        "This wallet does not have a USDC token account. Receive USDC first.",
      );
    }

    const destInfo = await conn.getAccountInfo(destAta, "confirmed");
    if (!destInfo) {
      tx.add(
        createAtaInstruction(payer, destAta, recipientPublicKey, mint),
      );
    }

    const amountBaseUnits = toUsdcBaseUnits(amount);
    const transferIx = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: sourceAta, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: destAta, isSigner: false, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: false },
      ],
      data: Buffer.from(encodeTransferChecked(amountBaseUnits, 6)),
    });
    tx.add(transferIx);
  }

  tx.sign(keypair);
  const signature = await conn.sendRawTransaction(tx.serialize(), {
    preflightCommitment: "confirmed",
  });
  await conn.confirmTransaction(signature, "confirmed");
  return { signature, walletAddress: payer.toBase58() };
}

export { isUserRejection };
