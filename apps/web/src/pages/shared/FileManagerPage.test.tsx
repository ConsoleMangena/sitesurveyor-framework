import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Keypair } from "@solana/web3.js";

import FileManagerPage from "./FileManagerPage.tsx";
import type { AttachmentRow, FolderRow } from "../../lib/repositories/attachments.ts";
import {
  createFolder,
  getAttachmentTags,
  getWorkspaceStorageUsage,
  listActivityLog,
  listAttachments,
  listFolders,
  listTags,
  uploadWorkspaceAttachment,
} from "../../lib/repositories/attachments.ts";
import {
  getLatestAnchorStates,
  listAnchorOperations,
} from "../../lib/repositories/fileAnchors.ts";
import {
  anchorAttachment,
  estimateAnchorFeeLamports,
} from "../../features/phantom/anchor/fileAnchor.ts";
import {
  downloadAttachmentBlob,
  runFullFileAnchor,
} from "../../features/phantom/anchor/fullFileAnchorRunner.ts";
import { useSiteSurveyorWallet } from "../../features/phantom/hooks/useSiteSurveyorWallet.ts";

vi.mock("../../lib/supabase/client.ts", () => ({ supabase: {} }));

vi.mock("../../lib/repositories/attachments.ts", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/repositories/attachments.ts")
  >("../../lib/repositories/attachments.ts");
  return {
    ...actual,
    listAttachments: vi.fn(),
    listFolders: vi.fn(),
    listTags: vi.fn(),
    listActivityLog: vi.fn(),
    getAttachmentTags: vi.fn(),
    getWorkspaceStorageUsage: vi.fn(),
    createFolder: vi.fn(),
    uploadWorkspaceAttachment: vi.fn(),
  };
});

vi.mock("../../lib/repositories/fileAnchors.ts", () => ({
  getLatestAnchorStates: vi.fn(),
  listAnchorOperations: vi.fn(),
}));

vi.mock("../../features/phantom/anchor/fullFileAnchorRunner.ts", () => ({
  downloadAttachmentBlob: vi.fn(),
  runFullFileAnchor: vi.fn(),
  verifyFullFileAnchor: vi.fn(),
}));

vi.mock("../../features/phantom/anchor/fileAnchor.ts", () => ({
  buildAnchorMemo: vi.fn(() => "ssv1:file-1:sha256:aa"),
  estimateAnchorFeeLamports: vi.fn(),
  anchorAttachment: vi.fn(),
}));

vi.mock("../../features/phantom/hooks/useSiteSurveyorWallet.ts", () => ({
  useSiteSurveyorWallet: vi.fn(),
}));

// A Radix Dialog mounted while a row menu is still alive deadlocks this jsdom
// harness (the menu popper keeps updating against the dialog's focus trap), so
// render dialogs inline and keep the page's own logic under test.
vi.mock("@/components/templates/DialogTemplate", async () => {
  const React = await import("react");
  interface StubProps {
    open: boolean;
    title: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }
  const DialogTemplate = ({ open, title, children, footer }: StubProps) =>
    open
      ? React.createElement(
          "div",
          { role: "dialog", "aria-label": String(title) },
          React.createElement("h2", null, title),
          children,
          footer ? React.createElement("div", null, footer) : null,
        )
      : null;
  return { DialogTemplate, default: DialogTemplate };
});

const WORKSPACE = "3f2a1b6c-0000-4000-8000-000000000002";
const HASH = "aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44";
const SIGNATURE =
  "5nEyc7rGzH3dQx1mBvTwUsRfJdLaZqCgXhNyMvKuYdQe1oBhYy1uJ7iSx7oVZ3n2Wu";
const wallet = Keypair.generate();

const anchoredFile = (): AttachmentRow =>
  makeFile({
    chain_status: "anchored",
    chain_tx_signature: SIGNATURE,
    chain_network: "devnet",
    anchored_at: "2026-10-21T09:20:00.000Z",
  });

function makeFile(overrides: Partial<AttachmentRow> = {}): AttachmentRow {
  return {
    id: "file-1",
    workspace_id: WORKSPACE,
    entity_table: "workspaces",
    entity_id: WORKSPACE,
    bucket_name: "workspace-private",
    storage_path: "docs/survey.pdf",
    visibility: "private",
    mime_type: "application/pdf",
    size_bytes: 20480,
    content_hash: HASH,
    storage_tier: "off_chain",
    chain_status: "none",
    chain_tx_signature: null,
    chain_network: null,
    chain_program_address: null,
    anchored_at: null,
    anchor_mode: null,
    anchor_operation_id: null,
    anchor_fee_lamports: null,
    folder_id: null,
    created_at: "2026-10-21T09:12:00.000Z",
    updated_at: "2026-10-21T09:12:00.000Z",
    uploaded_by: "user-1",
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

function makeFolder(overrides: Partial<FolderRow> = {}): FolderRow {
  return {
    id: "folder-1",
    workspace_id: WORKSPACE,
    name: "Site photos",
    parent_id: null,
    path: "",
    created_at: "2026-10-20T09:12:00.000Z",
    updated_at: "2026-10-20T09:12:00.000Z",
    created_by: "user-1",
    ...overrides,
  };
}

/** A File as the browser reports it from an <input webkitdirectory> picker. */
function diskFile(relativePath: string): File {
  const file = new File(["bytes"], relativePath.split("/").pop() ?? relativePath, {
    type: "image/jpeg",
  });
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
}

async function renderFiles(files: AttachmentRow[]) {
  vi.mocked(listAttachments).mockResolvedValue(files);
  render(
    <MemoryRouter>
      <FileManagerPage workspaceId={WORKSPACE} />
    </MemoryRouter>,
  );
  await screen.findAllByText("survey.pdf");
}

/** Radix opens a dropdown menu on pointerdown, not click. */
function openRowMenu(name = "survey.pdf") {
  fireEvent.pointerDown(screen.getByRole("button", { name: `Actions for ${name}` }), {
    button: 0,
    ctrlKey: false,
  });
}

function anchorMenuItem() {
  return screen.getByRole("menuitem", { name: "Anchor hash on Solana" });
}

function setWallet(overrides: Record<string, unknown>) {
  vi.mocked(useSiteSurveyorWallet).mockReturnValue({
    connected: true,
    connecting: false,
    address: wallet.publicKey.toBase58(),
    shortAddress: `${wallet.publicKey.toBase58().slice(0, 4)}…${wallet.publicKey
      .toBase58()
      .slice(-4)}`,
    publicKey: wallet.publicKey,
    sendTransaction: vi.fn(),
    wallet: { adapter: { name: "Phantom" } },
    connect: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useSiteSurveyorWallet>);
}

async function openAnchorDialog() {
  openRowMenu();
  fireEvent.click(anchorMenuItem());
  await screen.findByRole("dialog", { name: "Anchor file hash on Solana" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listFolders).mockResolvedValue([]);
  vi.mocked(listTags).mockResolvedValue([]);
  vi.mocked(listActivityLog).mockResolvedValue([]);
  vi.mocked(getAttachmentTags).mockResolvedValue([]);
  vi.mocked(getWorkspaceStorageUsage).mockResolvedValue({
    used_bytes: 100 * 1024 * 1024,
    file_count: 2,
    limit_mb: 500,
    used_mb: 100,
    percent: 20,
    base_limit_mb: 500,
    purchased_storage_mb: 0,
    expiring_storage_mb: 0,
    next_storage_expiration: null,
    over_quota: false,
    upload_allowed: true,
  });
  vi.mocked(getLatestAnchorStates).mockResolvedValue(new Map());
  vi.mocked(listAnchorOperations).mockResolvedValue([]);
  vi.mocked(estimateAnchorFeeLamports).mockResolvedValue(5000);
  vi.mocked(createFolder).mockImplementation(async (_workspaceId, name, parentId) =>
    makeFolder({ id: `folder-${name}`, name, parent_id: parentId ?? null }),
  );
  vi.mocked(uploadWorkspaceAttachment).mockImplementation(async (_workspaceId, file) =>
    makeFile({ id: `file-${file.name}`, storage_path: `uploads/${file.name}` }),
  );
  setWallet({});
});

describe("FileManagerPage anchoring", () => {
  it("offers anchoring for a hashed file that has no anchor yet", async () => {
    await renderFiles([makeFile()]);
    openRowMenu();

    expect(anchorMenuItem().getAttribute("data-disabled")).toBeNull();
  });

  it("does not offer anchoring for a file with no recorded hash", async () => {
    await renderFiles([makeFile({ content_hash: null })]);
    openRowMenu();

    expect(screen.queryByRole("menuitem", { name: "Anchor hash on Solana" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Verify integrity" })).toBeNull();
  });

  it("links an anchored file to its transaction instead of re-offering the anchor", async () => {
    await renderFiles([anchoredFile()]);

    const link = await screen.findByRole("link", { name: /Anchored on Devnet/ });
    expect(link.getAttribute("href")).toContain(
      `https://explorer.solana.com/tx/${SIGNATURE}`,
    );
    expect(link.getAttribute("href")).toContain("cluster=devnet");

    openRowMenu();
    expect(screen.queryByRole("menuitem", { name: "Anchor hash on Solana" })).toBeNull();
  });

  it("keeps a pending anchor visible but unclickable", async () => {
    await renderFiles([
      makeFile({
        chain_status: "pending",
        chain_tx_signature: SIGNATURE,
        chain_network: "devnet",
      }),
    ]);

    expect(await screen.findByText(/Anchoring on Devnet/)).toBeTruthy();
    openRowMenu();
    expect(anchorMenuItem().getAttribute("data-disabled")).not.toBeNull();
  });

  it("shows what will be signed before anything is sent", async () => {
    await renderFiles([makeFile()]);
    await openAnchorDialog();

    expect(await screen.findByText("5,000 lamports")).toBeTruthy();
    expect(await screen.findByText(/Signed by Phantom/)).toBeTruthy();
    expect(await screen.findByText(/file itself stays in workspace storage/i)).toBeTruthy();
    expect(estimateAnchorFeeLamports).toHaveBeenCalledTimes(1);
    expect(anchorAttachment).not.toHaveBeenCalled();
  });

  it("anchors through the connected wallet and reloads the confirmed row", async () => {
    const file = makeFile();
    vi.mocked(anchorAttachment).mockResolvedValue({
      signature: SIGNATURE,
      memo: "ssv1:file-1:sha256:aa11bb22",
      network: "devnet",
      anchoredAt: "2026-10-21T09:20:00.000Z",
      operationId: "anchor-op-1",
      feeLamports: 5000,
    });

    await renderFiles([file]);
    // The reload after a confirmed anchor must show the row the chain now has.
    vi.mocked(listAttachments).mockImplementation(async () =>
      vi.mocked(anchorAttachment).mock.calls.length > 0 ? [anchoredFile()] : [file],
    );
    await openAnchorDialog();
    fireEvent.click(screen.getByRole("button", { name: "Sign anchor transaction" }));

    await screen.findByRole("link", { name: /Anchored on Devnet/ });
    expect(
      await screen.findByText(/Hash anchored on Devnet: 5nEyc/),
    ).toBeTruthy();

    const [sentFile, sentSigner] = vi.mocked(anchorAttachment).mock.calls[0];
    expect(sentFile.id).toBe("file-1");
    expect(sentSigner.publicKey?.toBase58()).toBe(wallet.publicKey.toBase58());
  });

  it("offers to connect a wallet when nothing can sign", async () => {
    const connect = vi.fn();
    setWallet({
      connected: false,
      address: null,
      shortAddress: null,
      publicKey: null,
      sendTransaction: undefined,
      wallet: null,
      connect,
    });

    await renderFiles([makeFile()]);
    await openAnchorDialog();

    expect(
      await screen.findByText("Connect a Solana wallet to sign the anchor transaction."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Connect Solana wallet" }));
    expect(connect).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Sign anchor transaction")).toBeNull();
  });

  it("surfaces the reason an anchor did not land", async () => {
    vi.mocked(anchorAttachment).mockRejectedValue(new Error("Anchor cancelled in wallet."));

    await renderFiles([makeFile()]);
    await openAnchorDialog();
    fireEvent.click(screen.getByRole("button", { name: "Sign anchor transaction" }));

    expect(await screen.findByText("Anchor cancelled in wallet.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Anchored on Devnet/ })).toBeNull();
  });

  it("explains how to recover from a wallet network mismatch", async () => {
    vi.mocked(anchorAttachment).mockRejectedValue(new Error("Network mismatch"));

    await renderFiles([makeFile()]);
    await openAnchorDialog();
    fireEvent.click(screen.getByRole("button", { name: "Sign anchor transaction" }));

    expect(
      await screen.findByText(
        "Your wallet is on the wrong Solana network. Open your wallet, switch to Devnet, reconnect it, and try signing again.",
      ),
    ).toBeTruthy();
  });

  it("anchors the whole file in chunks when the full-file mode is chosen", async () => {
    const blob = new Blob(["bytes"], { type: "application/pdf" });
    vi.mocked(downloadAttachmentBlob).mockResolvedValue(blob);
    vi.mocked(runFullFileAnchor).mockResolvedValue({
      operationId: "op-1",
      signature: SIGNATURE,
      memo: "ssv2:file-1:sha256:aa:bb:1",
      fileHash: HASH,
      manifestHash: "bb",
      chunkCount: 3,
      feeLamports: 5000,
      network: "devnet",
      anchoredAt: "2026-10-21T09:20:00.000Z",
    });

    await renderFiles([makeFile()]);
    openRowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Anchor full file on Solana" }));

    expect(
      await screen.findByRole("dialog", { name: "Anchor full file on Solana" }),
    ).toBeTruthy();
    expect(screen.getByText(/chunks × 256 KB/)).toBeTruthy();
    expect(
      screen.getByText(/only the digests go on chain/i),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sign anchor transaction" }));

    expect(await screen.findByText(/Full file anchored on Devnet: 5nEyc/)).toBeTruthy();
    expect(vi.mocked(runFullFileAnchor).mock.calls[0][0].source).toBe(blob);
    expect(vi.mocked(anchorAttachment)).not.toHaveBeenCalled();
  });

  it("lists every anchor attempt with its chain record and a way to retry", async () => {
    vi.mocked(listAnchorOperations).mockResolvedValue([
      {
        id: "op-1",
        workspace_id: WORKSPACE,
        attachment_id: "file-1",
        created_by: "user-1",
        mode: "full_file",
        status: "anchored",
        file_name: "survey.pdf",
        file_size_bytes: 20480,
        mime_type: "application/pdf",
        chunk_size: 262144,
        chunk_count: 3,
        uploaded_chunks: 3,
        file_hash: HASH,
        manifest_hash: "bb22",
        manifest: {},
        manifest_storage_path: "x/manifest.json",
        memo: "ssv2:file-1",
        tx_signature: SIGNATURE,
        tx_slot: 341000123,
        fee_lamports: 5000,
        network: "devnet",
        wallet_address: wallet.publicKey.toBase58(),
        bucket_name: "workspace-private",
        error_message: null,
        verification_status: "verified",
        verified_at: "2026-10-21T09:30:00.000Z",
        completed_at: "2026-10-21T09:20:00.000Z",
        created_at: "2026-10-21T09:20:00.000Z",
        updated_at: "2026-10-21T09:20:00.000Z",
      },
      {
        id: "op-2",
        workspace_id: WORKSPACE,
        attachment_id: "file-1",
        created_by: "user-1",
        mode: "hash",
        status: "failed",
        file_name: "survey.pdf",
        file_size_bytes: 20480,
        mime_type: "application/pdf",
        chunk_size: null,
        chunk_count: null,
        uploaded_chunks: 0,
        file_hash: HASH,
        manifest_hash: null,
        manifest: null,
        manifest_storage_path: null,
        memo: "ssv1:file-1",
        tx_signature: null,
        tx_slot: null,
        fee_lamports: null,
        network: "devnet",
        wallet_address: wallet.publicKey.toBase58(),
        bucket_name: "workspace-private",
        error_message: "Not enough SOL to pay the network fee.",
        verification_status: "unverified",
        verified_at: null,
        completed_at: null,
        created_at: "2026-10-21T09:00:00.000Z",
        updated_at: "2026-10-21T09:00:00.000Z",
      },
    ] as never);

    await renderFiles([makeFile()]);
    openRowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "File details" }));

    const dialog = await screen.findByRole("dialog", { name: "File details" });
    expect(dialog).toBeTruthy();
    expect(screen.getByText(/100\.0 of 500 MB/)).toBeTruthy();
    expect(screen.getByText("Full file · Anchored")).toBeTruthy();
    expect(screen.getByText("3/3 chunks · 5,000 lamports · slot 341000123")).toBeTruthy();
    const chainLink = screen.getByRole("link", { name: /5nEyc/ });
    expect(chainLink.getAttribute("href")).toContain(
      `https://explorer.solana.com/tx/${SIGNATURE}`,
    );
    expect(screen.getByText("Hash only · Failed")).toBeTruthy();
    expect(screen.getByText("Not enough SOL to pay the network fee.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("dialog", { name: "Anchor file hash on Solana" }),
    ).toBeTruthy();
  });

  it("creates a folder from the toolbar", async () => {
    await renderFiles([makeFile()]);

    fireEvent.click(screen.getByRole("button", { name: /New folder/ }));
    await screen.findByRole("dialog", { name: "New folder" });
    fireEvent.change(screen.getByPlaceholderText("e.g. Site photos"), {
      target: { value: "Invoices" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create folder" }));

    expect(createFolder).toHaveBeenCalledWith(WORKSPACE, "Invoices", null);
    expect(await screen.findByText('Folder "Invoices" created.')).toBeTruthy();
  });

  it("creates each picked folder once and files every upload in it", async () => {
    await renderFiles([makeFile()]);

    fireEvent.change(screen.getByLabelText("Select a folder to upload"), {
      target: {
        files: [diskFile("Site photos/2026/roof.jpg"), diskFile("Site photos/2026/wall.jpg")],
      },
    });

    await waitFor(() => expect(uploadWorkspaceAttachment).toHaveBeenCalledTimes(2));
    expect(createFolder).toHaveBeenCalledTimes(2);
    expect(createFolder).toHaveBeenNthCalledWith(1, WORKSPACE, "Site photos", null);
    expect(createFolder).toHaveBeenNthCalledWith(2, WORKSPACE, "2026", "folder-Site photos");
    expect(vi.mocked(uploadWorkspaceAttachment).mock.calls[0]?.[2]).toMatchObject({
      folderId: "folder-2026",
    });
  });

  it("uploads into the folder opened from a file row", async () => {
    vi.mocked(listFolders).mockResolvedValue([makeFolder()]);
    await renderFiles([makeFile({ folder_id: "folder-1" })]);

    fireEvent.click(screen.getByRole("button", { name: "Site photos" }));
    fireEvent.change(screen.getByLabelText("Select files to upload"), {
      target: { files: [new File(["bytes"], "invoice.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => expect(uploadWorkspaceAttachment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(uploadWorkspaceAttachment).mock.calls[0]?.[2]).toMatchObject({
      folderId: "folder-1",
    });
  });

  it("pauses uploads when the workspace is over its storage quota", async () => {
    vi.mocked(getWorkspaceStorageUsage).mockResolvedValue({
      used_bytes: 900 * 1024 * 1024,
      file_count: 3,
      limit_mb: 500,
      used_mb: 900,
      percent: 180,
      base_limit_mb: 500,
      purchased_storage_mb: 0,
      expiring_storage_mb: 0,
      next_storage_expiration: null,
      over_quota: true,
      upload_allowed: false,
    });

    await renderFiles([makeFile()]);

    expect(await screen.findByText("Storage quota reached")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Quota reached/ })).toBeDisabled();
  });
});
