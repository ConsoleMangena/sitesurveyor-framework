import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Keypair } from "@solana/web3.js";

import FileManagerPage from "./FileManagerPage.tsx";
import type { AttachmentRow } from "../../lib/repositories/attachments.ts";
import {
  getAttachmentTags,
  listActivityLog,
  listAttachments,
  listFolders,
  listTags,
} from "../../lib/repositories/attachments.ts";
import {
  anchorAttachment,
  estimateAnchorFeeLamports,
} from "../../features/phantom/anchor/fileAnchor.ts";
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
  };
});

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
    folder_id: null,
    created_at: "2026-10-21T09:12:00.000Z",
    updated_at: "2026-10-21T09:12:00.000Z",
    uploaded_by: "user-1",
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
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
  vi.mocked(estimateAnchorFeeLamports).mockResolvedValue(5000);
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
});
