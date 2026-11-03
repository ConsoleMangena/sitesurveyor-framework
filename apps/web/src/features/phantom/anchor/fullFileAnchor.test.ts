import { describe, expect, it } from "vitest";

import {
  DEFAULT_FULL_FILE_CHUNK_SIZE,
  buildFullFileAnchorMemo,
  prepareFullFileAnchor,
  reconstructVerifiedFile,
  type FullFileManifest,
} from "./fullFileAnchor.ts";

const FILE_HASH = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
const MANIFEST_HASH = "dec866d4cc7004b919363b7f19b5366608a96145a068155614b35b68d8345be1";

const fixedManifest: FullFileManifest = {
  version: "ssv2",
  attachmentId: "attachment-1",
  fileName: "hello.txt",
  mimeType: "text/plain",
  fileSize: 11,
  fileHash: FILE_HASH,
  chunkSize: 5,
  chunks: [
    {
      index: 0,
      size: 5,
      hash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    },
    {
      index: 1,
      size: 5,
      hash: "43cf897720cc5a693b2508c9e95e8711942a96ed98d772fe37123d31603ce20f",
    },
    {
      index: 2,
      size: 1,
      hash: "18ac3e7343f016890c510e93f935261169d9e3f565436429830faf0934f4f8e4",
    },
  ],
};

async function prepareHello() {
  return prepareFullFileAnchor(new Blob(["hello world"], { type: "text/plain" }), {
    attachmentId: "attachment-1",
    fileName: "hello.txt",
    chunkSize: 5,
  });
}

describe("prepareFullFileAnchor", () => {
  it("matches fixed full-file, chunk, manifest and memo vectors", async () => {
    const prepared = await prepareHello();

    expect(prepared.fileHash).toBe(FILE_HASH);
    expect(prepared.manifest).toEqual(fixedManifest);
    expect(prepared.manifestJson).toBe(JSON.stringify(fixedManifest));
    expect(prepared.manifestHash).toBe(MANIFEST_HASH);
    expect(prepared.chunks).toHaveLength(3);
    expect(await Promise.all(prepared.chunks.map((chunk) => chunk.text()))).toEqual([
      "hello",
      " worl",
      "d",
    ]);
    expect(prepared.memo).toBe(
      `ssv2:attachment-1:sha256:${FILE_HASH}:${MANIFEST_HASH}:3`,
    );
  });

  it("is reproducible and excludes storage paths and creation timestamps", async () => {
    const first = await prepareHello();
    const second = await prepareHello();

    expect(second.manifestJson).toBe(first.manifestJson);
    expect(second.manifestHash).toBe(first.manifestHash);
    expect(Object.keys(first.manifest)).toEqual([
      "version",
      "attachmentId",
      "fileName",
      "mimeType",
      "fileSize",
      "fileHash",
      "chunkSize",
      "chunks",
    ]);
    expect(first.manifestJson).not.toMatch(/storage|created|path/i);
  });

  it("uses 256 KiB chunks by default, including a short final chunk", async () => {
    const size = DEFAULT_FULL_FILE_CHUNK_SIZE * 2 + 123;
    const prepared = await prepareFullFileAnchor(new Blob([new Uint8Array(size)]), {
      attachmentId: "large-file",
      fileName: "zeros.bin",
    });

    expect(prepared.manifest.chunkSize).toBe(256 * 1024);
    expect(prepared.manifest.chunks.map((chunk) => chunk.size)).toEqual([
      DEFAULT_FULL_FILE_CHUNK_SIZE,
      DEFAULT_FULL_FILE_CHUNK_SIZE,
      123,
    ]);
    expect(prepared.chunks.map((chunk) => chunk.size)).toEqual([
      DEFAULT_FULL_FILE_CHUNK_SIZE,
      DEFAULT_FULL_FILE_CHUNK_SIZE,
      123,
    ]);
  });

  it("preserves Chinese file names and hashes unicode content correctly", async () => {
    const text = "控制点 A：纬度 30°，测量完成 ✅";
    const prepared = await prepareFullFileAnchor(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
      { attachmentId: "附件-1", fileName: "现场测量📐.txt", chunkSize: 7 },
    );

    expect(prepared.manifest.fileName).toBe("现场测量📐.txt");
    expect(prepared.manifest.chunks.length).toBeGreaterThan(1);
    const restored = await reconstructVerifiedFile(prepared.chunks, prepared.manifest);
    expect(restored.type).toBe("text/plain;charset=utf-8");
    expect(await restored.text()).toBe(text);
  });

  it("rejects empty files", async () => {
    await expect(
      prepareFullFileAnchor(new Blob([]), { attachmentId: "empty" }),
    ).rejects.toThrow(/empty file/i);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    "rejects invalid or oversized chunk size %s",
    async (chunkSize) => {
      await expect(
        prepareFullFileAnchor(new Blob(["content"]), {
          attachmentId: "bad-chunk-size",
          chunkSize,
        }),
      ).rejects.toThrow(/chunk size/i);
    },
  );
});

describe("buildFullFileAnchorMemo", () => {
  it("validates and canonicalises both hashes", () => {
    expect(
      buildFullFileAnchorMemo(
        "file-1",
        `  ${"A".repeat(64)}  `,
        "B".repeat(64),
        2,
      ),
    ).toBe(`ssv2:file-1:sha256:${"a".repeat(64)}:${"b".repeat(64)}:2`);
  });

  it.each(["", "abc", "g".repeat(64), "a".repeat(65)])(
    "rejects malformed file hash %s",
    (fileHash) => {
      expect(() =>
        buildFullFileAnchorMemo("file-1", fileHash, "b".repeat(64), 1),
      ).toThrow(/file hash/i);
    },
  );

  it("rejects a malformed manifest hash", () => {
    expect(() =>
      buildFullFileAnchorMemo("file-1", "a".repeat(64), "not-a-hash", 1),
    ).toThrow(/manifest hash/i);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid chunk count %s",
    (chunkCount) => {
      expect(() =>
        buildFullFileAnchorMemo("file-1", "a".repeat(64), "b".repeat(64), chunkCount),
      ).toThrow(/chunk count/i);
    },
  );

  it("enforces the Solana memo limit in UTF-8 bytes, not characters", () => {
    expect(() =>
      buildFullFileAnchorMemo(
        "现".repeat(180),
        "a".repeat(64),
        "b".repeat(64),
        1,
      ),
    ).toThrow(/566-byte UTF-8 limit/i);
  });
});

describe("reconstructVerifiedFile", () => {
  it("joins verified chunks in order and restores the MIME type", async () => {
    const prepared = await prepareHello();
    const restored = await reconstructVerifiedFile(
      prepared.chunks,
      prepared.manifest,
      "renamed.txt",
    );

    expect(restored).toBeInstanceOf(Blob);
    expect(restored.type).toBe("text/plain");
    expect(restored.size).toBe(11);
    expect(await restored.text()).toBe("hello world");
  });

  it("rejects reordered chunks", async () => {
    const prepared = await prepareHello();
    const reordered = [prepared.chunks[1], prepared.chunks[0], prepared.chunks[2]];

    await expect(
      reconstructVerifiedFile(reordered, prepared.manifest),
    ).rejects.toThrow(/chunk hash mismatch at index 0/i);
  });

  it("rejects missing chunks", async () => {
    const prepared = await prepareHello();

    await expect(
      reconstructVerifiedFile(prepared.chunks.slice(0, -1), prepared.manifest),
    ).rejects.toThrow(/expected 3 chunks, received 2/i);
  });

  it("rejects same-size chunk tampering", async () => {
    const prepared = await prepareHello();
    const tampered = [...prepared.chunks];
    tampered[0] = new Blob(["jello"]);

    await expect(
      reconstructVerifiedFile(tampered, prepared.manifest),
    ).rejects.toThrow(/chunk hash mismatch at index 0/i);
  });

  it("rejects a tampered manifest chunk hash", async () => {
    const prepared = await prepareHello();
    const manifest: FullFileManifest = {
      ...prepared.manifest,
      chunks: prepared.manifest.chunks.map((chunk, index) =>
        index === 1 ? { ...chunk, hash: "0".repeat(64) } : chunk,
      ),
    };

    await expect(
      reconstructVerifiedFile(prepared.chunks, manifest),
    ).rejects.toThrow(/chunk hash mismatch at index 1/i);
  });

  it("rejects invalid manifest chunk ordering before reconstruction", async () => {
    const prepared = await prepareHello();
    const manifest: FullFileManifest = {
      ...prepared.manifest,
      chunks: [prepared.manifest.chunks[1], prepared.manifest.chunks[0], prepared.manifest.chunks[2]],
    };

    await expect(
      reconstructVerifiedFile(prepared.chunks, manifest),
    ).rejects.toThrow(/chunk order mismatch/i);
  });

  it("rejects a whole-file hash mismatch even when every chunk passes", async () => {
    const prepared = await prepareHello();
    const manifest = { ...prepared.manifest, fileHash: "0".repeat(64) };

    await expect(
      reconstructVerifiedFile(prepared.chunks, manifest),
    ).rejects.toThrow(/file hash does not match/i);
  });

  it("rejects chunk sizes that disagree with the manifest", async () => {
    const prepared = await prepareHello();
    const chunks = [...prepared.chunks];
    chunks[0] = new Blob(["hell"]);

    await expect(
      reconstructVerifiedFile(chunks, prepared.manifest),
    ).rejects.toThrow(/chunk size mismatch at index 0/i);
  });
});
