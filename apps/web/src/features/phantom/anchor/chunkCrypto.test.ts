import { describe, expect, it } from "vitest";

import {
  createAnchorKey,
  decryptChunk,
  encryptChunk,
  unlockAnchorKey,
} from "./chunkCrypto.ts";
import { prepareFullFileAnchor, reconstructVerifiedFile } from "./fullFileAnchor.ts";

/** 200 KB of repeating text, chunked small enough to make a fast test. */
function sampleFile(): Blob {
  const block = "survey point;east;north;elev\n".repeat(200);
  return new Blob(new Array(10).fill(block), { type: "text/csv" });
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("anchor chunk encryption", () => {
  it("round-trips a chunk and never leaves plaintext in the stored bytes", async () => {
    const plaintext = new Blob(["GRID-13 CONTROL POINT AZURE-7"], { type: "application/octet-stream" });
    const { key, wrapped } = await createAnchorKey("ridge-survey-2026");

    const stored = await encryptChunk(key, plaintext);
    const storedText = new TextDecoder().decode(await stored.arrayBuffer());
    expect(storedText).not.toContain("CONTROL POINT");
    expect(stored.size).toBeGreaterThan(plaintext.size);

    const restored = await decryptChunk(key, stored);
    expect(await restored.text()).toBe(await plaintext.text());
    expect(wrapped.wrapped_key).not.toBe("");
    expect(JSON.stringify(wrapped)).not.toContain("ridge-survey-2026");
  });

  it("refuses a passphrase that does not match the wrapped key", async () => {
    const { key, wrapped } = await createAnchorKey("ridge-survey-2026");
    const stored = await encryptChunk(key, new Blob(["bytes"]));

    await expect(unlockAnchorKey("wrong-passphrase", wrapped)).rejects.toThrow(
      /Wrong anchoring passphrase/,
    );
    await expect(unlockAnchorKey("", wrapped)).rejects.toThrow(/passphrase is required/);
    expect((await decryptChunk(key, stored)).size).toBe(5);
  });

  it("detects a tampered stored chunk", async () => {
    const { key } = await createAnchorKey("ridge-survey-2026");
    const stored = await encryptChunk(key, new Blob(["a longer chunk of survey notes"]));
    const bytes = new Uint8Array(await stored.arrayBuffer());
    bytes[bytes.length - 1] ^= 0xff;

    await expect(decryptChunk(key, new Blob([bytes]))).rejects.toThrow(/could not be decrypted/);
  });

  it("keeps the on-chain proof about the original file across encryption", async () => {
    const source = sampleFile();
    const prepared = await prepareFullFileAnchor(source, {
      attachmentId: "file-1",
      fileName: "control-points.csv",
      chunkSize: 4096,
    });
    expect(prepared.chunks.length).toBeGreaterThan(1);

    const { key, wrapped } = await createAnchorKey("ridge-survey-2026");
    const reopened = await unlockAnchorKey("ridge-survey-2026", wrapped);
    const stored = await Promise.all(prepared.chunks.map((chunk) => encryptChunk(key, chunk)));

    const decrypted = await Promise.all(stored.map((chunk) => decryptChunk(reopened, chunk)));
    const rebuilt = await reconstructVerifiedFile(decrypted, prepared.manifest, "control-points.csv");

    expect(rebuilt.type).toBe(source.type);
    expect(await sha256Hex(rebuilt)).toBe(prepared.fileHash);
    expect(await sha256Hex(rebuilt)).toBe(await sha256Hex(source));
  });
});
