import { describe, it, expect, vi, beforeEach } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import {
  MEMO_PROGRAM_ID,
  anchorAttachment,
  buildAnchorInstruction,
  buildAnchorMemo,
  buildAnchorTransaction,
  encodeMemoData,
  estimateAnchorFeeLamports,
  waitForAnchorConfirmation,
} from "./fileAnchor.ts";
import {
  markAttachmentAnchorPending,
  saveAttachmentAnchor,
} from "../../../lib/repositories/attachments.ts";

vi.mock("../../../lib/repositories/attachments.ts", () => ({
  markAttachmentAnchorPending: vi.fn(),
  saveAttachmentAnchor: vi.fn(),
}));

const signer = Keypair.generate().publicKey;
const blockhash = Keypair.generate().publicKey.toBase58();
const attachment = {
  id: "3f2a1b6c-0000-4000-8000-000000000001",
  workspace_id: "3f2a1b6c-0000-4000-8000-000000000002",
  content_hash: "AB12F0",
};

function fakeConnection(overrides: Record<string, unknown> = {}): Connection {
  return {
    getLatestBlockhash: vi
      .fn()
      .mockResolvedValue({ blockhash, lastValidBlockHeight: 150 }),
    getFeeForMessage: vi.fn().mockResolvedValue({ context: {}, value: 5000 }),
    getSignatureStatuses: vi.fn().mockResolvedValue({
      context: {},
      value: [{ err: null, confirmationStatus: "confirmed" }],
    }),
    ...overrides,
  } as unknown as Connection;
}

describe("buildAnchorMemo", () => {
  it("records the attachment id and a normalised digest", () => {
    expect(buildAnchorMemo(attachment.id, "AB12F0")).toBe(
      `ssv1:${attachment.id}:sha256:ab12f0`,
    );
  });

  it("trims surrounding whitespace before hashing text is embedded", () => {
    expect(buildAnchorMemo("file-1", "  deadbeef  ")).toBe(
      "ssv1:file-1:sha256:deadbeef",
    );
  });
});

describe("encodeMemoData", () => {
  it("prefixes the UTF-8 byte length as a little-endian u32", () => {
    const data = encodeMemoData("ssv1");
    expect(data.readUInt32LE(0)).toBe(4);
    expect(data.subarray(4).toString("utf8")).toBe("ssv1");
  });

  it("counts bytes, not characters", () => {
    const data = encodeMemoData("é");
    expect(data.readUInt32LE(0)).toBe(2);
    expect(data.subarray(4).toString("utf8")).toBe("é");
  });
});

describe("buildAnchorInstruction", () => {
  it("targets the memo program with the wallet as a read-only signer", () => {
    const instruction = buildAnchorInstruction("ssv1:file-1:sha256:ab", signer);
    expect(instruction.programId.toBase58()).toBe(MEMO_PROGRAM_ID.toBase58());
    expect(instruction.keys).toHaveLength(1);
    expect(instruction.keys[0].pubkey.toBase58()).toBe(signer.toBase58());
    expect(instruction.keys[0].isSigner).toBe(true);
    expect(instruction.keys[0].isWritable).toBe(false);
  });
});

describe("buildAnchorTransaction", () => {
  it("is a classic transaction paid for and signed by the wallet", () => {
    const memo = buildAnchorMemo(attachment.id, attachment.content_hash);
    const transaction = buildAnchorTransaction(memo, signer, blockhash);
    expect(transaction.feePayer?.toBase58()).toBe(signer.toBase58());
    expect(transaction.recentBlockhash).toBe(blockhash);
    expect(transaction.instructions).toHaveLength(1);
    expect(transaction.compileMessage().accountKeys[0].toBase58()).toBe(
      signer.toBase58(),
    );
  });
});

describe("estimateAnchorFeeLamports", () => {
  it("prices the compiled memo message", async () => {
    const connection = fakeConnection();
    await expect(
      estimateAnchorFeeLamports("ssv1:file-1:sha256:ab", signer, connection),
    ).resolves.toBe(5000);
    expect(connection.getFeeForMessage).toHaveBeenCalledOnce();
  });

  it("treats an unreadable fee as free rather than throwing", async () => {
    const connection = fakeConnection({
      getFeeForMessage: vi
        .fn()
        .mockResolvedValue({ context: {}, value: null }),
    });
    await expect(
      estimateAnchorFeeLamports("ssv1:file-1:sha256:ab", signer, connection),
    ).resolves.toBe(0);
  });
});

describe("waitForAnchorConfirmation", () => {
  it("polls until the cluster reports the signature", async () => {
    const getSignatureStatuses = vi
      .fn()
      .mockResolvedValueOnce({ context: {}, value: [null] })
      .mockResolvedValue({
        context: {},
        value: [{ err: null, confirmationStatus: "finalized" }],
      });
    const connection = fakeConnection({ getSignatureStatuses });

    await expect(
      waitForAnchorConfirmation("sig-1", { connection, intervalMs: 5 }),
    ).resolves.toBeUndefined();
    expect(getSignatureStatuses).toHaveBeenCalledTimes(2);
  });

  it("reports the on-chain error when the transaction lands badly", async () => {
    const connection = fakeConnection({
      getSignatureStatuses: vi.fn().mockResolvedValue({
        context: {},
        value: [{ err: { InstructionError: [0, "Custom"] }, confirmationStatus: null }],
      }),
    });

    await expect(
      waitForAnchorConfirmation("sig-1", { connection, intervalMs: 5 }),
    ).rejects.toThrow("failed on-chain (InstructionError)");
  });

  it("gives up instead of waiting forever on an unseen signature", async () => {
    const connection = fakeConnection({
      getSignatureStatuses: vi.fn().mockResolvedValue({ context: {}, value: [null] }),
    });

    await expect(
      waitForAnchorConfirmation("sig-12345678", {
        connection,
        intervalMs: 5,
        timeoutMs: 30,
      }),
    ).rejects.toThrow(/did not confirm/);
  });
});

describe("anchorAttachment", () => {
  const walletAdapter = {
    publicKey: signer,
    sendTransaction: vi.fn().mockResolvedValue("sig-anchor-1"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    walletAdapter.sendTransaction.mockResolvedValue("sig-anchor-1");
  });

  it("sends the hash memo, then records the confirmed anchor", async () => {
    const connection = fakeConnection();
    const outcome = await anchorAttachment(attachment, walletAdapter, {
      connection,
      intervalMs: 5,
    });

    expect(outcome.memo).toBe(`ssv1:${attachment.id}:sha256:ab12f0`);
    expect(outcome.signature).toBe("sig-anchor-1");
    expect(outcome.network).toBe("devnet");
    expect(markAttachmentAnchorPending).toHaveBeenCalledWith(attachment, {
      signature: "sig-anchor-1",
      network: "devnet",
    });
    expect(saveAttachmentAnchor).toHaveBeenCalledWith(attachment, {
      signature: "sig-anchor-1",
      network: "devnet",
      status: "anchored",
      anchoredAt: expect.any(String),
    });
  });

  it("leaves the attachment untouched when the wallet rejects signing", async () => {
    walletAdapter.sendTransaction.mockRejectedValue(
      new Error("User rejected the transaction."),
    );

    await expect(
      anchorAttachment(attachment, walletAdapter, { connection: fakeConnection() }),
    ).rejects.toThrow("Anchor cancelled in wallet.");
    expect(markAttachmentAnchorPending).not.toHaveBeenCalled();
    expect(saveAttachmentAnchor).not.toHaveBeenCalled();
  });

  it("marks the attachment failed once the transaction lands with an error", async () => {
    const connection = fakeConnection({
      getSignatureStatuses: vi.fn().mockResolvedValue({
        context: {},
        value: [{ err: { AccountNotFound: null }, confirmationStatus: null }],
      }),
    });

    await expect(
      anchorAttachment(attachment, walletAdapter, { connection, intervalMs: 5 }),
    ).rejects.toThrow("failed on-chain");
    expect(saveAttachmentAnchor).toHaveBeenCalledWith(attachment, {
      signature: "sig-anchor-1",
      network: "devnet",
      status: "failed",
    });
  });

  it("refuses to anchor a file with no recorded hash", async () => {
    await expect(
      anchorAttachment(
        { ...attachment, content_hash: null },
        walletAdapter,
        { connection: fakeConnection() },
      ),
    ).rejects.toThrow(/no recorded hash/);
    expect(walletAdapter.sendTransaction).not.toHaveBeenCalled();
  });

  it("refuses to sign without a connected wallet key", async () => {
    await expect(
      anchorAttachment(
        attachment,
        { publicKey: null, sendTransaction: walletAdapter.sendTransaction },
        { connection: fakeConnection() },
      ),
    ).rejects.toThrow(/Connect a Solana wallet/);
    expect(walletAdapter.sendTransaction).not.toHaveBeenCalled();
  });
});

describe("MEMO_PROGRAM_ID", () => {
  it("is the memo v3 program", () => {
    expect(new PublicKey(MEMO_PROGRAM_ID.toBase58()).toBase58()).toBe(
      "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    );
  });
});
