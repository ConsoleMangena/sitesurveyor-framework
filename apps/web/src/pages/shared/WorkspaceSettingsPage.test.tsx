import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WorkspaceSettingsPage from "./WorkspaceSettingsPage.tsx";
import {
  getPesepayWallet,
  initiateWalletDeposit,
  listPesepayTransactions,
  listStoragePurchases,
  verifyWalletDeposit,
} from "../../lib/repositories/pesepay.ts";
import type {
  PesepayTransactionRow,
  PesepayWalletRow,
  StoragePurchaseRow,
} from "../../lib/repositories/pesepay.ts";

vi.mock("../../lib/hooks/useDatabaseStats.ts", () => ({
  useDatabaseStats: () => ({ totalSizeGB: 0, tablesSizeGB: 0, loading: false, error: null }),
}));

vi.mock("../../lib/hooks/useWorkspaceStorage.ts", () => ({
  useWorkspaceStorage: () => ({
    usedBytes: 100 * 1024 * 1024,
    fileCount: 4,
    limitMb: 20480,
    usedMb: 100,
    percent: 10,
    baseLimitMb: 10240,
    purchasedStorageMb: 10240,
    expiringStorageMb: 10240,
    nextStorageExpiration: "2027-02-01T00:00:00Z",
    overQuota: false,
    uploadAllowed: true,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("../../lib/repositories/pesepay.ts", () => ({
  getPesepayWallet: vi.fn(),
  initiateWalletDeposit: vi.fn(),
  listPesepayTransactions: vi.fn(),
  listStoragePurchases: vi.fn(),
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
  refund_reason: null,
  refunded_at: null,
  refunded_by: null,
  related_id: null,
  package_id: null,
  credit_amount: null,
  storage_mb: null,
  duration_days: null,
  estimated_infrastructure_cost: 0,
  estimated_payment_fee: 0,
  provider_status: "SUCCESS",
  created_at: "2026-10-31T10:00:00Z",
  completed_at: "2026-10-31T10:02:00Z",
};

const timedPurchase: StoragePurchaseRow = {
  id: "purchase-1",
  workspace_id: "workspace-1",
  purchased_by: "user-1",
  plan_id: "storage-10gb",
  storage_mb: 10240,
  amount: 5,
  currency_code: "USD",
  payment_method: "balance",
  starts_at: "2026-10-31T10:10:00Z",
  expires_at: "2027-02-01T00:00:00Z",
  included_in_base_quota: false,
  created_at: "2026-10-31T10:10:00Z",
  paid_at: "2026-10-31T10:10:00Z",
};

const expiredPurchase: StoragePurchaseRow = {
  ...timedPurchase,
  id: "purchase-0",
  expires_at: "2026-01-01T00:00:00Z",
};

function renderSettings(entry = "/?view=settings", onNavigate = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <WorkspaceSettingsPage workspaceId="workspace-1" onNavigate={onNavigate} />
    </MemoryRouter>,
  );
  return onNavigate;
}

async function enabledButton(name: string | RegExp) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe("WorkspaceSettingsPage PesePay balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});

describe("WorkspaceSettingsPage storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPesepayWallet).mockResolvedValue(initialWallet);
    vi.mocked(listPesepayTransactions).mockResolvedValue([]);
    vi.mocked(verifyWalletDeposit).mockResolvedValue({ status: "pending" });
  });

  it("splits the quota into base allowance and purchased storage", async () => {
    renderSettings();

    expect(await screen.findByText(/Base quota 10240 MB/)).toBeInTheDocument();
    expect(screen.getByText(/10240 MB of purchased add-ons/)).toBeInTheDocument();
    expect(screen.getByText(/expires .*2027/)).toBeInTheDocument();
  });

  it("sends storage purchases to Billing instead of checking out here", async () => {
    const onNavigate = renderSettings();
    await screen.findByText("How this quota is built");

    await userEvent.click(screen.getByRole("button", { name: "Buy storage" }));
    await userEvent.click(screen.getByRole("button", { name: "Add storage" }));

    expect(onNavigate).toHaveBeenCalledWith("billing");
    expect(screen.queryByRole("button", { name: /^Buy 10 GB/ })).not.toBeInTheDocument();
  });

  it("shows the validity of each purchased package", async () => {
    vi.mocked(listStoragePurchases).mockResolvedValue([timedPurchase, expiredPurchase]);
    renderSettings();

    expect(await screen.findByRole("cell", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Expired" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "PesePay balance" })).toHaveLength(2);
    expect(screen.getAllByText("$5.00").length).toBeGreaterThan(0);
  });
});
