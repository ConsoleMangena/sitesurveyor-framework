import { Buffer } from "buffer";
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";

import {
  buildUsdcTransferInstruction,
  getAssociatedTokenAddress,
} from "./solanaPay.ts";
import { SOLANA_USDC_MINT, toUsdcBaseUnits } from "../lib/config.ts";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

describe("toUsdcBaseUnits", () => {
  it("converts whole dollars", () => {
    expect(toUsdcBaseUnits(1)).toBe(1_000_000n);
    expect(toUsdcBaseUnits(425)).toBe(425_000_000n);
  });

  it("converts fractional amounts", () => {
    expect(toUsdcBaseUnits(0.5)).toBe(500_000n);
    expect(toUsdcBaseUnits(0.01)).toBe(10_000n);
  });

  it("rounds sub-microcent dust to 6 decimals", () => {
    expect(toUsdcBaseUnits(1.2345678)).toBe(1_234_568n);
    expect(toUsdcBaseUnits(0.0000004)).toBe(0n);
  });
});

describe("getAssociatedTokenAddress", () => {
  it("is deterministic for a given owner + mint", () => {
    const owner = Keypair.generate().publicKey;
    const mint = new PublicKey(SOLANA_USDC_MINT);
    expect(getAssociatedTokenAddress(mint, owner).toBase58()).toBe(
      getAssociatedTokenAddress(mint, owner).toBase58(),
    );
  });

  it("derives distinct accounts for distinct owners", () => {
    const mint = new PublicKey(SOLANA_USDC_MINT);
    const a = getAssociatedTokenAddress(mint, Keypair.generate().publicKey);
    const b = getAssociatedTokenAddress(mint, Keypair.generate().publicKey);
    expect(a.toBase58()).not.toBe(b.toBase58());
  });
});

describe("buildUsdcTransferInstruction", () => {
  const payer = Keypair.generate().publicKey;
  const treasury = Keypair.generate().publicKey;

  it("targets the SPL Token program", () => {
    const { instruction } = buildUsdcTransferInstruction(payer, treasury, 10);
    expect(instruction.programId.toBase58()).toBe(TOKEN_PROGRAM_ID.toBase58());
  });

  it("lays out the five accounts in Solana Pay order", () => {
    const { instruction, reference, sourceAta, destAta } =
      buildUsdcTransferInstruction(payer, treasury, 10);
    const mint = new PublicKey(SOLANA_USDC_MINT);

    expect(instruction.keys).toHaveLength(5);

    const [src, mintKey, dest, payerKey, refKey] = instruction.keys;
    expect(src.pubkey.toBase58()).toBe(
      getAssociatedTokenAddress(mint, payer).toBase58(),
    );
    expect(sourceAta.toBase58()).toBe(src.pubkey.toBase58());
    expect(src.isWritable).toBe(true);
    expect(src.isSigner).toBe(false);

    expect(mintKey.pubkey.toBase58()).toBe(SOLANA_USDC_MINT);
    expect(mintKey.isWritable).toBe(false);

    expect(dest.pubkey.toBase58()).toBe(
      getAssociatedTokenAddress(mint, treasury).toBase58(),
    );
    expect(destAta.toBase58()).toBe(dest.pubkey.toBase58());
    expect(dest.isWritable).toBe(true);

    expect(payerKey.pubkey.toBase58()).toBe(payer.toBase58());
    expect(payerKey.isSigner).toBe(true);

    // Solana Pay reference: read-only, non-signer marker key.
    expect(refKey.pubkey.toBase58()).toBe(reference.toBase58());
    expect(refKey.isSigner).toBe(false);
    expect(refKey.isWritable).toBe(false);
  });

  it("encodes a TransferChecked instruction with the base-unit amount", () => {
    const amount = 123.456789;
    const { instruction } = buildUsdcTransferInstruction(
      payer,
      treasury,
      amount,
    );

    const data = Buffer.from(instruction.data);
    expect(data).toHaveLength(10);
    expect(data[0]).toBe(12); // TransferChecked discriminator

    const view = new DataView(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
    expect(view.getBigUint64(1, true)).toBe(toUsdcBaseUnits(amount));
    expect(data[9]).toBe(6); // USDC decimals
  });

  it("emits a fresh reference key on every call", () => {
    const a = buildUsdcTransferInstruction(payer, treasury, 1);
    const b = buildUsdcTransferInstruction(payer, treasury, 1);
    expect(a.reference.toBase58()).not.toBe(b.reference.toBase58());
  });

  it("encodes zero-amount transfers (verification sims, fee probes)", () => {
    const { instruction } = buildUsdcTransferInstruction(payer, treasury, 0);
    const data = Buffer.from(instruction.data);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getBigUint64(1, true)).toBe(0n);
  });
});
