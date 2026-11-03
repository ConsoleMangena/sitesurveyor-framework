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
import {
  createAnchorOperation,
  linkAttachmentAnchor,
  updateAnchorOperation,
} from "../../../lib/repositories/fileAnchors.ts";
import { getWalletBalanceLamports } from "../lib/solanaRpc.ts";

vi.mock("../../../lib/repositories/attachments.ts", () => ({
  markAttachmentAnchorPending: vi.fn(),
  saveAttachmentAnchor: vi.fn(),
}));

vi.mock("../../../lib/repositories/fileAnchors.ts", () => ({
  anchorStoragePrefix: vi.fn(() => "workspace/anchors/operation"),
  createAnchorOperation: vi
    .fn()
    .mockResolvedValue({ id: "anchor-op-1", status: "preparing" }),
  updateAnchorOperation: vi.fn().mockResolvedValue({ id: "anchor-op-1" }),
  linkAttachmentAnchor: vi.fn().mockResolvedValue(undefined),
  listAnchorOperations: vi.fn().mockResolvedValue([]),
}));

// The wallet balance check is an RPC round-trip; anchoring tests only need it to pass.
vi.mock("../lib/solanaRpc.ts", () => ({
  getWalletBalanceLamports: vi.fn().mockResolvedValue(1_000_000_000),
}));

const signer = Keypair.generate().publicKey;
const blockhash = Keypair.generate().publicKey.toBase58();
const attachment = {
  id: "3f2a1b6c-0000-4000-8000-000000000001",
  workspace_id: "3f2a1b6c-0000-4000-8000-000000000002",
  content_hash: "AB12F0",
  bucket_name: "workspace-files",
  storage_path: "3f2a1b6c-0000-4000-8000-000000000002/sites/site-1/roof-photo.jpg",
  size_bytes: 20480,
  mime_type: "image/jpeg",
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
    getTransaction: vi
      .fn()
      .mockResolvedValue({ slot: 341_000_123, meta: { fee: 5000 } }),
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
  it("targets the memo program with no accounts (feePayer is author)", () => {
    const instruction = buildAnchorInstruction("ssv1:file-1:sha256:ab");
    expect(instruction.programId.toBase58()).toBe(MEMO_PROGRAM_ID.toBase58());
    expect(instruction.keys).toHaveLength(0);
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
    expect(outcome.operationId).toBe("anchor-op-1");
    expect(outcome.feeLamports).toBe(5000);
    expect(createAnchorOperation).toHaveBeenCalledWith({
      workspaceId: attachment.workspace_id,
      attachmentId: attachment.id,
      mode: "hash",
      bucketName: "workspace-files",
      network: "devnet",
      fileName: "roof-photo.jpg",
      fileSizeBytes: 20480,
      mimeType: "image/jpeg",
      fileHash: "AB12F0",
    });
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
    expect(linkAttachmentAnchor).toHaveBeenCalledWith(
      attachment.id,
      attachment.workspace_id,
      { mode: "hash", operationId: "anchor-op-1", feeLamports: 5000 },
    );
  });

  it("walks the anchor record through each stage of the attempt", async () => {
    await anchorAttachment(attachment, walletAdapter, {
      connection: fakeConnection(),
      intervalMs: 5,
    });

    const stages = vi
      .mocked(updateAnchorOperation)
      .mock.calls.map(([, patch]) => patch.status);
    expect(stages).toEqual([
      "submitting",
      "submitted",
      "confirming",
      "anchored",
    ]);
    expect(vi.mocked(updateAnchorOperation).mock.calls[0][1]).toMatchObject({
      wallet_address: signer.toBase58(),
      fee_lamports: 5000,
      memo: `ssv1:${attachment.id}:sha256:ab12f0`,
    });
    expect(vi.mocked(updateAnchorOperation).mock.calls[3][1]).toMatchObject({
      tx_slot: 341_000_123,
      error_message: null,
    });
  });

  it("refuses to sign when the wallet cannot pay the network fee", async () => {
    vi.mocked(getWalletBalanceLamports).mockResolvedValueOnce(100);

    await expect(
      anchorAttachment(attachment, walletAdapter, { connection: fakeConnection() }),
    ).rejects.toThrow(/Not enough SOL/);
    expect(walletAdapter.sendTransaction).not.toHaveBeenCalled();
    expect(updateAnchorOperation).toHaveBeenLastCalledWith(
      "anchor-op-1",
      expect.objectContaining({ status: "failed" }),
    );
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
    expect(updateAnchorOperation).toHaveBeenLastCalledWith(
      "anchor-op-1",
      expect.objectContaining({ status: "cancelled" }),
    );
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
