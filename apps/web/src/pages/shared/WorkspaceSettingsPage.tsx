import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CreditCard,
  Database,
  HardDrive,
  Server,
  Loader2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Card, CardContent } from "../../components/ui/card.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import ErrorNotice from "../../components/errors/ErrorNotice.tsx";
import {
  DashboardHeader,
  DashboardSection,
  DashboardShell,
} from "../../components/dashboard/DashboardShell.tsx";
import { KpiCard } from "../../components/dashboard/KpiCard.tsx";
import { useDatabaseStats } from "../../lib/hooks/useDatabaseStats.ts";
import { useWorkspaceStorage } from "../../lib/hooks/useWorkspaceStorage.ts";
import { canManageFinance } from "../../lib/permissions.ts";
import { getMyWorkspaceMembership } from "../../lib/repositories/workspaces.ts";
import {
  getPesepayWallet,
  initiateWalletDeposit,
  listPesepayTransactions,
  listStoragePurchases,
  payStorageWithBalance,
  STORAGE_PLANS,
  verifyWalletDeposit,
  type PesepayTransactionRow,
  type PesepayWalletRow,
  type StoragePlanId,
  type StoragePurchaseRow,
} from "../../lib/repositories/pesepay.ts";
import "../../styles/console.css";

interface WorkspaceSettingsProps {
  workspaceId: string;
  isPlatformAdmin?: boolean;
}

type CheckoutMessage = {
  tone: "success" | "pending" | "error";
  text: string;
} | null;

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function noticeTone(tone: "success" | "pending" | "error") {
  if (tone === "success") return "success" as const;
  return tone === "error" ? "danger" as const : "info" as const;
}

function walletStatusLabel(status: string) {
  if (status === "completed") return "Completed";
  return status === "failed" ? "Failed" : "Pending";
}

function walletStatusBadge(status: string) {
  if (status === "completed") return "success" as const;
  return status === "failed" ? "destructive" as const : "warning" as const;
}

function transactionKindLabel(kind: string) {
  if (kind === "deposit") return "Deposit";
  return kind === "storage_purchase" ? "Storage" : "Invoice";
}

function StatNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-none border border-destructive/20 bg-destructive/10 p-4">
      <HardDrive size={16} className="mt-0.5 shrink-0 text-destructive" />
      <div className="min-w-0">
        <p className="text-sm font-medium">Unable to load storage info</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

export default function WorkspaceSettingsPage({
  workspaceId,
  isPlatformAdmin = false,
}: WorkspaceSettingsProps) {
  const [searchParams] = useSearchParams();
  const { totalSizeGB, tablesSizeGB, loading, error } = useDatabaseStats();
  const {
    usedMb,
    limitMb,
    percent,
    fileCount,
    loading: storageLoading,
    error: storageError,
    reload: reloadStorage,
  } = useWorkspaceStorage(workspaceId);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<CheckoutMessage>(null);
  const [canPurchase, setCanPurchase] = useState<boolean | null>(null);
  const [purchases, setPurchases] = useState<StoragePurchaseRow[]>([]);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<PesepayWalletRow | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<PesepayTransactionRow[]>([]);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState<"deposit" | "verify" | null>(null);
  const [walletMessage, setWalletMessage] = useState<CheckoutMessage>(null);
  const [depositAmount, setDepositAmount] = useState("25");
  const [activeDepositId, setActiveDepositId] = useState<string | null>(null);

  const returnedDepositId = searchParams.get("pesepay") === "wallet-return"
    ? searchParams.get("deposit")
    : null;

  const walletLoading = !walletLoaded;
  const purchasesLoading = !purchasesLoaded;

  const loadPurchases = useCallback(async () => {
    if (isPlatformAdmin) return;
    try {
      setPurchases(await listStoragePurchases(workspaceId));
      setPurchasesError(null);
    } catch (loadError) {
      setPurchasesError(loadError instanceof Error ? loadError.message : "Unable to load storage purchases.");
    } finally {
      setPurchasesLoaded(true);
    }
  }, [workspaceId, isPlatformAdmin]);

  const loadWallet = useCallback(async () => {
    if (isPlatformAdmin) return;
    try {
      const [nextWallet, nextTransactions] = await Promise.all([
        getPesepayWallet(workspaceId),
        listPesepayTransactions(workspaceId),
      ]);
      setWallet(nextWallet);
      setWalletTransactions(nextTransactions);
      setWalletError(null);
    } catch (loadError) {
      setWalletError(loadError instanceof Error ? loadError.message : "Unable to load the PesePay balance.");
    } finally {
      setWalletLoaded(true);
    }
  }, [workspaceId, isPlatformAdmin]);

  useEffect(() => {
    void loadPurchases();
  }, [loadPurchases]);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    if (isPlatformAdmin) return;
    let cancelled = false;
    getMyWorkspaceMembership(workspaceId)
      .then((member) => {
        if (!cancelled) setCanPurchase(canManageFinance(member?.role));
      })
      .catch(() => {
        if (!cancelled) setCanPurchase(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, isPlatformAdmin]);

  const checkDeposit = useCallback(async (depositId: string) => {
    setActiveDepositId(depositId);
    setWalletBusy("verify");
    setWalletMessage({ tone: "pending", text: "Checking your PesePay deposit…" });
    try {
      const result = await verifyWalletDeposit({ depositId, workspaceId });
      if (result.status === "completed") {
        setWalletMessage({
          tone: "success",
          text: "Deposit confirmed. Your SiteSurveyor balance is ready to use.",
        });
      } else if (result.status === "failed") {
        setWalletMessage({
          tone: "error",
          text: "This deposit could not be confirmed. Start a new deposit, or contact support if you completed payment.",
        });
      } else {
        setWalletMessage({
          tone: "pending",
          text: "PesePay has not confirmed this deposit yet. If you completed payment, check again in a moment.",
        });
      }
      await loadWallet();
    } catch (verificationError) {
      setWalletMessage({
        tone: "error",
        text: verificationError instanceof Error
          ? verificationError.message
          : "Unable to verify the deposit. Check again in a moment.",
      });
    } finally {
      setWalletBusy(null);
    }
  }, [workspaceId, loadWallet]);

  useEffect(() => {
    if (!returnedDepositId || isPlatformAdmin) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("pesepay");
    url.searchParams.delete("deposit");
    window.history.replaceState(window.history.state, "", url);
    void checkDeposit(returnedDepositId);
  }, [returnedDepositId, checkDeposit, isPlatformAdmin]);

  const depositFunds = async () => {
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
      setWalletMessage({ tone: "error", text: "Enter a deposit amount between USD 1 and USD 10,000." });
      return;
    }
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001) {
      setWalletMessage({ tone: "error", text: "Use no more than two decimal places for the deposit." });
      return;
    }

    setWalletBusy("deposit");
    setWalletMessage(null);
    setActiveDepositId(null);
    try {
      const checkout = await initiateWalletDeposit({ amount, workspaceId });
      window.location.assign(checkout.redirectUrl);
    } catch (depositError) {
      setWalletMessage({
        tone: "error",
        text: depositError instanceof Error ? depositError.message : "Unable to open PesePay checkout. Try again.",
      });
      setWalletBusy(null);
    }
  };

  const purchaseStorage = async (storagePlanId: StoragePlanId) => {
    setCheckoutBusy(storagePlanId);
    setCheckoutMessage(null);
    try {
      const result = await payStorageWithBalance({ storagePlanId, workspaceId });
      setWallet((current) => current ? { ...current, balance: result.balance } : current);
      setCheckoutMessage({
        tone: "success",
        text: "Payment completed. Your workspace storage has been increased.",
      });
      reloadStorage();
      await Promise.all([loadWallet(), loadPurchases()]);
    } catch (checkoutError) {
      setCheckoutMessage({
        tone: "error",
        text: checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to pay for storage from your PesePay balance. Try again.",
      });
    } finally {
      setCheckoutBusy(null);
    }
  };

  const storageUsedGB = usedMb / 1024;
  const storageLimitGB = limitMb / 1024;
  const isNearLimit = percent >= 80;
  const isAtLimit = percent >= 95;

  if (isPlatformAdmin) {
    return (
      <DashboardShell className="hub-body">
        <DashboardHeader
          badge={<Badge variant="secondary">Platform</Badge>}
          title="System Settings"
          subtitle="Platform-wide database and system statistics."
          meta={loading ? "Reading…" : `${totalSizeGB.toFixed(2)} GB on disk`}
        />

        <DashboardSection title="System database">
          <Card>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">
                    Loading database stats...
                  </span>
                </div>
              ) : error ? (
                <StatNote>{error}</StatNote>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <KpiCard
                    title="Total database size"
                    value={`${totalSizeGB.toFixed(2)} GB`}
                    subtext="All schemas and storage objects"
                    icon={<Database className="h-4 w-4" />}
                    tone="primary"
                  />
                  <KpiCard
                    title="Tables size"
                    value={`${tablesSizeGB.toFixed(2)} GB`}
                    subtext="Relational table data"
                    icon={<Server className="h-4 w-4" />}
                    tone="info"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </DashboardSection>

        <DashboardSection title="Notifications">
          <Card>
            <CardContent className="pt-4">
              <div className="console-setting">
                <div className="console-setting-text">
                  <p className="console-setting-title">Email notifications</p>
                  <p className="console-setting-hint">
                    Receive email updates for important events
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="console-setting">
                <div className="console-setting-text">
                  <p className="console-setting-title">Project updates</p>
                  <p className="console-setting-hint">
                    Get notified about project changes
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </DashboardSection>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="hub-body">
      <DashboardHeader
        badge={<Badge variant="secondary">Workspace</Badge>}
        title="Workspace Settings"
        subtitle="Manage your workspace storage, team, and preferences."
        meta={
          storageLoading
            ? "Loading…"
            : `${storageUsedGB.toFixed(2)} GB of ${storageLimitGB.toFixed(2)} GB used`
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => document.getElementById("storage-plans")?.scrollIntoView({ behavior: "smooth" })}
          >
            <HardDrive size={16} />
            Add storage
          </Button>
        }
      />

      <DashboardSection title="PesePay balance">
        <Card>
          <CardContent className="space-y-5">
            {walletLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading balance…</span>
              </div>
            ) : walletError ? (
              <ErrorNotice
                tone="danger"
                layout="banner"
                title="Unable to load your PesePay balance"
                action={<Button variant="outline" size="sm" onClick={() => void loadWallet()}>Try again</Button>}
              >
                {walletError}
              </ErrorNotice>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary/10">
                      <Wallet size={18} className="text-primary" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Available for SiteSurveyor payments</p>
                      <p className="text-2xl font-semibold text-foreground">
                        {usdFormatter.format(Number(wallet?.balance ?? 0))}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Personal USD balance for this workspace
                      </p>
                    </div>
                  </div>
                  <form
                    className="w-full max-w-sm space-y-2 sm:w-auto sm:text-right"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void depositFunds();
                    }}
                  >
                    <Label htmlFor="pesepay-deposit-amount">Add money</Label>
                    <div className="flex gap-2">
                      <Input
                        id="pesepay-deposit-amount"
                        type="number"
                        inputMode="decimal"
                        min="1"
                        max="10000"
                        step="0.01"
                        value={depositAmount}
                        onChange={(event) => setDepositAmount(event.target.value)}
                        disabled={walletBusy !== null}
                        aria-describedby="pesepay-deposit-help"
                      />
                      <Button type="submit" size="sm" className="shrink-0 gap-2" disabled={walletBusy !== null}>
                        {walletBusy === "deposit" && <Loader2 size={14} className="animate-spin" />}
                        {walletBusy === "deposit" ? "Opening…" : "Add with PesePay"}
                      </Button>
                    </div>
                  </form>
                </div>

                <p id="pesepay-deposit-help" className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
                  Deposits are final and can be used only for SiteSurveyor payments. They cannot be withdrawn or refunded.
                </p>

                {walletMessage && (
                  <ErrorNotice
                    layout="banner"
                    tone={noticeTone(walletMessage.tone)}
                    title={walletMessage.tone === "success" ? "Deposit confirmed" : walletMessage.tone === "error" ? "Deposit status" : "Deposit pending"}
                    action={activeDepositId && walletMessage.tone !== "success" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={walletBusy === "verify"}
                        onClick={() => {
                          if (activeDepositId) void checkDeposit(activeDepositId);
                        }}
                      >
                        {walletBusy === "verify" ? "Checking…" : "Check deposit status"}
                      </Button>
                    ) : undefined}
                  >
                    {walletMessage.text}
                  </ErrorNotice>
                )}

                <div className="border-t border-border/70 pt-4">
                  <h3 className="text-sm font-semibold text-foreground">Your transactions</h3>
                  {walletTransactions.length === 0 ? (
                    <div className="console-empty">
                      <span className="console-empty-icon"><Wallet size={18} /></span>
                      <p className="console-empty-title">No balance transactions yet</p>
                      <p>Deposits and payments made from your balance will appear here.</p>
                    </div>
                  ) : (
                    <div className="console-table-wrap">
                      <table className="console-table">
                        <thead>
                          <tr>
                            <th>Description</th>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Reference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {walletTransactions.map((transaction) => (
                            <tr key={transaction.id}>
                              <td data-label="Description">{transaction.description}</td>
                              <td data-label="Date">
                                <time dateTime={transaction.created_at}>
                                  {dateFormatter.format(new Date(transaction.created_at))}
                                </time>
                              </td>
                              <td data-label="Type">{transactionKindLabel(transaction.kind)}</td>
                              <td data-label="Amount" className="console-num">
                                {transaction.kind === "deposit" ? "+ " : "− "}
                                {usdFormatter.format(Number(transaction.amount))}
                              </td>
                              <td data-label="Status">
                                <Badge variant={walletStatusBadge(transaction.status)}>
                                  {walletStatusLabel(transaction.status)}
                                </Badge>
                              </td>
                              <td data-label="Reference">
                                {transaction.pesepay_reference ? (
                                  <span className="block max-w-48 truncate font-mono text-xs" title={transaction.pesepay_reference}>
                                    {transaction.pesepay_reference}
                                  </span>
                                ) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </DashboardSection>

      <DashboardSection title="Storage">
        <Card>
          <CardContent className="space-y-5">
            {storageLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading storage...</span>
              </div>
            ) : storageError ? (
              <StatNote>{storageError}</StatNote>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Storage used</span>
                    <span
                      className={
                        isAtLimit
                          ? "font-medium text-destructive"
                          : isNearLimit
                            ? "font-medium text-amber-500"
                            : "font-medium text-foreground"
                      }
                    >
                      {percent}%
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-none bg-muted"
                    role="progressbar"
                    aria-valuenow={Math.min(percent, 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Workspace storage used"
                  >
                    <div
                      className={`h-full transition-all ${
                        isAtLimit
                          ? "bg-destructive"
                          : isNearLimit
                            ? "bg-amber-500"
                            : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(limitMb / 1024 - usedMb / 1024).toFixed(2)} GB remaining ·{" "}
                    {fileCount} files
                  </p>
                </div>

                {isNearLimit && (
                  <div className="flex items-start gap-3 rounded-none border border-amber-500/20 bg-amber-500/10 p-4">
                    <HardDrive size={16} className="mt-0.5 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {isAtLimit ? "Storage limit reached" : "Storage almost full"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Purchase an add-on to make more space available for projects and files.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            <div id="storage-plans" className="scroll-mt-24 border-t border-border/70 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Add storage</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  One-time add-ons are permanently added to this workspace after payment confirmation.
                </p>
              </div>

              {checkoutMessage && (
                <ErrorNotice
                  className="mt-3"
                  layout="banner"
                  tone={noticeTone(checkoutMessage.tone)}
                  title={checkoutMessage.tone === "error" ? "Storage payment" : checkoutMessage.tone === "success" ? "Payment confirmed" : "Payment status"}
                >
                  {checkoutMessage.text}
                </ErrorNotice>
              )}

              <div className="mt-3 divide-y divide-border/70 border-y border-border/70">
                {STORAGE_PLANS.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10">
                        <HardDrive size={16} className="text-primary" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{plan.label} storage add-on</p>
                        <p className="text-xs text-muted-foreground">
                          {usdFormatter.format(plan.amount)} · one-time payment
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-2"
                      disabled={checkoutBusy !== null || canPurchase !== true}
                      onClick={() => void purchaseStorage(plan.id)}
                    >
                      {checkoutBusy === plan.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CreditCard size={14} />
                      )}
                      {checkoutBusy === plan.id ? "Paying…" : `Buy ${plan.label}`}
                    </Button>
                  </div>
                ))}
              </div>

              {canPurchase === null ? (
                <p className="mt-3 text-xs text-muted-foreground">Checking purchase permissions…</p>
              ) : !canPurchase ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Only workspace owners, admins, and finance managers can purchase storage.
                </p>
              ) : null}
              <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
                Paid from your PesePay balance. Storage increases only after the server confirms the payment.
              </p>
            </div>
          </CardContent>
        </Card>
      </DashboardSection>

      <DashboardSection title="Storage purchases">
        <Card>
          <CardContent className="pt-4">
            {purchasesLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 size={18} className="animate-spin" />
                Loading purchases…
              </div>
            ) : purchasesError ? (
              <ErrorNotice
                tone="danger"
                layout="banner"
                title="Unable to load storage purchases"
                action={<Button variant="outline" size="sm" onClick={() => void loadPurchases()}>Try again</Button>}
              >
                {purchasesError}
              </ErrorNotice>
            ) : purchases.length === 0 ? (
              <div className="console-empty">
                <span className="console-empty-icon"><CreditCard size={18} /></span>
                <p className="console-empty-title">No storage purchases yet</p>
                <p>Add-ons paid from the PesePay balance will appear here.</p>
              </div>
            ) : (
              <div className="console-table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>Add-on</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td data-label="Add-on">{purchase.storage_mb / 1024} GB</td>
                        <td data-label="Date">
                          <time dateTime={purchase.paid_at}>
                            {dateFormatter.format(new Date(purchase.paid_at))}
                          </time>
                        </td>
                        <td data-label="Amount" className="console-num">
                          {usdFormatter.format(Number(purchase.amount))}
                        </td>
                        <td data-label="Method">
                          {purchase.payment_method === "balance" ? "PesePay balance" : purchase.payment_method}
                        </td>
                        <td data-label="Status">
                          <Badge variant="success">Paid</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </DashboardSection>

      <DashboardSection title="Team">
        <Card>
          <CardContent className="pt-4">
            <div className="console-setting">
              <div className="console-setting-text">
                <p className="console-setting-title">Allow team invites</p>
                <p className="console-setting-hint">
                  Members can invite others to the workspace
                </p>
              </div>
              <Switch />
            </div>
            <div className="console-setting">
              <div className="console-setting-text">
                <p className="console-setting-title">Require admin approval</p>
                <p className="console-setting-hint">
                  New members must be approved before joining
                </p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>
      </DashboardSection>

      <DashboardSection title="Notifications">
        <Card>
          <CardContent className="pt-4">
            <div className="console-setting">
              <div className="console-setting-text">
                <p className="console-setting-title">Email notifications</p>
                <p className="console-setting-hint">
                  Receive email updates for important events
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="console-setting">
              <div className="console-setting-text">
                <p className="console-setting-title">Project updates</p>
                <p className="console-setting-hint">
                  Get notified about project changes
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
      </DashboardSection>
    </DashboardShell>
  );
}
