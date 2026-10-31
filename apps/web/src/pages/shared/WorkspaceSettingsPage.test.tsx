import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WorkspaceSettingsPage from "./WorkspaceSettingsPage.tsx";
import { getMyWorkspaceMembership } from "../../lib/repositories/workspaces.ts";
import {
  getPesepayWallet,
  initiateWalletDeposit,
  listPesepayTransactions,
  listStoragePurchases,
  payStorageWithBalance,
  verifyWalletDeposit,
} from "../../lib/repositories/pesepay.ts";
import type {
  PesepayTransactionRow,
  PesepayWalletRow,
  StoragePurchaseRow,
} from "../../lib/repositories/pesepay.ts";

const { reloadStorage } = vi.hoisted(() => ({ reloadStorage: vi.fn() }));

vi.mock("../../lib/hooks/useDatabaseStats.ts", () => ({
  useDatabaseStats: () => ({ totalSizeGB: 0, tablesSizeGB: 0, loading: false, error: null }),
}));

vi.mock("../../lib/hooks/useWorkspaceStorage.ts", () => ({
  useWorkspaceStorage: () => ({
    usedBytes: 100 * 1024 * 1024,
    fileCount: 4,
    limitMb: 1024,
    usedMb: 100,
    percent: 10,
    loading: false,
    error: null,
    reload: reloadStorage,
  }),
}));

vi.mock("../../lib/repositories/workspaces.ts", () => ({
  getMyWorkspaceMembership: vi.fn(),
}));

vi.mock("../../lib/repositories/pesepay.ts", () => ({
  STORAGE_PLANS: [
    { id: "10gb", label: "10 GB", storageMb: 10240, amount: 5, currencyCode: "USD" },
    { id: "50gb", label: "50 GB", storageMb: 51200, amount: 15, currencyCode: "USD" },
    { id: "100gb", label: "100 GB", storageMb: 102400, amount: 30, currencyCode: "USD" },
  ],
  getPesepayWallet: vi.fn(),
  initiateWalletDeposit: vi.fn(),
  listPesepayTransactions: vi.fn(),
  listStoragePurchases: vi.fn(),
  payStorageWithBalance: vi.fn(),
  verifyWalletDeposit: vi.fn(),
}));

const initialWallet: PesepayWalletRow = {
  id: "wallet-1",
  workspace_id: "workspace-1",
  user_id: "user-1",
  currency_code: "USD",
  balance: 20,
  created_at: "2026-10-31T09:00:00Z",
  updated_at: "2026-10-31T09:00:00Z",
};

const fundedWallet: PesepayWalletRow = { ...initialWallet, balance: 145 };

const depositTransaction: PesepayTransactionRow = {
  id: "deposit-1",
  wallet_id: "wallet-1",
  workspace_id: "workspace-1",
  user_id: "user-1",
  kind: "deposit",
  amount: 125,
  currency_code: "USD",
  status: "completed",
  description: "PesePay balance deposit",
  pesepay_reference: "PESE-DEPOSIT",
  related_id: null,
  created_at: "2026-10-31T10:00:00Z",
  completed_at: "2026-10-31T10:02:00Z",
};

const balancePurchase: StoragePurchaseRow = {
  id: "purchase-1",
  workspace_id: "workspace-1",
  purchased_by: "user-1",
  plan_id: "10gb",
  storage_mb: 10240,
  amount: 5,
  currency_code: "USD",
  payment_method: "balance",
  created_at: "2026-10-31T10:10:00Z",
  paid_at: "2026-10-31T10:10:00Z",
};

const storageDebit: PesepayTransactionRow = {
  id: "debit-1",
  wallet_id: "wallet-1",
  workspace_id: "workspace-1",
  user_id: "user-1",
  kind: "storage_purchase",
  amount: 5,
  currency_code: "USD",
  status: "completed",
  description: "10 GB workspace storage add-on",
  pesepay_reference: null,
  related_id: "purchase-1",
  created_at: "2026-10-31T10:10:00Z",
  completed_at: "2026-10-31T10:10:00Z",
};

function membership(role: string) {
  return { role } as unknown as Awaited<ReturnType<typeof getMyWorkspaceMembership>>;
}

function renderSettings(entry = "/?view=settings") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <WorkspaceSettingsPage workspaceId="workspace-1" />
    </MemoryRouter>,
  );
}

async function enabledButton(name: string | RegExp) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe("WorkspaceSettingsPage PesePay balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyWorkspaceMembership).mockResolvedValue(membership("owner"));
    vi.mocked(listStoragePurchases).mockResolvedValue([]);
    vi.mocked(getPesepayWallet).mockResolvedValue(initialWallet);
    vi.mocked(listPesepayTransactions).mockResolvedValue([]);
    vi.mocked(verifyWalletDeposit).mockResolvedValue({ status: "pending" });
  });

  it("opens a PesePay deposit checkout for the entered amount", async () => {
    vi.mocked(initiateWalletDeposit).mockImplementation(() => new Promise(() => {}));
    renderSettings();

    const input = await screen.findByLabelText("Add money");
    await userEvent.clear(input);
    await userEvent.type(input, "125");
    await userEvent.click(await enabledButton("Add with PesePay"));

    expect(initiateWalletDeposit).toHaveBeenCalledWith({ amount: 125, workspaceId: "workspace-1" });
    expect(screen.getByRole("button", { name: "Opening…" })).toBeDisabled();
  });

  it("confirms a returning deposit and shows it in the user's transaction history", async () => {
    vi.mocked(verifyWalletDeposit).mockResolvedValue({ status: "completed" });
    vi.mocked(getPesepayWallet).mockResolvedValue(fundedWallet);
    vi.mocked(listPesepayTransactions).mockResolvedValue([depositTransaction]);
    renderSettings("/?view=settings&pesepay=wallet-return&deposit=deposit-1");

    expect(await screen.findByText("Deposit confirmed. Your SiteSurveyor balance is ready to use.")).toBeInTheDocument();
    expect(verifyWalletDeposit).toHaveBeenCalledWith({ depositId: "deposit-1", workspaceId: "workspace-1" });
    expect(screen.getByText("$145.00")).toBeInTheDocument();
    expect(screen.getByText("+ $125.00")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("lets a pending deposit be checked again", async () => {
    renderSettings("/?view=settings&pesepay=wallet-return&deposit=deposit-1");

    const checkButton = await enabledButton("Check deposit status");
    expect(screen.getByText("PesePay has not confirmed this deposit yet. If you completed payment, check again in a moment.")).toBeInTheDocument();
    await userEvent.click(checkButton);

    await waitFor(() => expect(verifyWalletDeposit).toHaveBeenCalledTimes(2));
  });

  it("pays a storage add-on from the wallet and refreshes workspace storage", async () => {
    vi.mocked(getPesepayWallet)
      .mockResolvedValueOnce({ ...initialWallet, balance: 15 })
      .mockResolvedValueOnce({ ...initialWallet, balance: 10 });
    vi.mocked(listStoragePurchases).mockResolvedValue([balancePurchase]);
    vi.mocked(listPesepayTransactions)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([storageDebit]);
    vi.mocked(payStorageWithBalance).mockResolvedValue({ status: "paid", purchaseId: "purchase-1", balance: 10 });
    renderSettings();

    await userEvent.click(await enabledButton("Buy 10 GB"));

    expect(payStorageWithBalance).toHaveBeenCalledWith({ storagePlanId: "10gb", workspaceId: "workspace-1" });
    expect(await screen.findByText("Payment completed. Your workspace storage has been increased.")).toBeInTheDocument();
    expect(reloadStorage).toHaveBeenCalledOnce();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "PesePay balance" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "10 GB workspace storage add-on" })).toBeInTheDocument();
    expect(screen.getByText("− $5.00")).toBeInTheDocument();
  });

  it("explains when a member cannot purchase storage from the balance", async () => {
    vi.mocked(getMyWorkspaceMembership).mockResolvedValue(membership("member"));
    renderSettings();

    expect(await screen.findByText("Only workspace owners, admins, and finance managers can purchase storage.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy 10 GB" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add with PesePay" })).toBeEnabled();
  });
});
