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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty.tsx";
import { ResponsiveTable } from "../../components/ui/responsive-table.tsx";
import ErrorNotice from "../../components/errors/ErrorNotice.tsx";
import {
  DashboardHeader,
  DashboardSection,
  DashboardShell,
} from "../../components/dashboard/DashboardShell.tsx";
import { KpiCard, KpiGrid } from "../../components/dashboard/KpiCard.tsx";
import { useDatabaseStats } from "../../lib/hooks/useDatabaseStats.ts";
import { useWorkspaceStorage } from "../../lib/hooks/useWorkspaceStorage.ts";
import {
  getPesepayWallet,
  initiateWalletDeposit,
  listPesepayTransactions,
  listStoragePurchases,
  verifyWalletDeposit,
  type PesepayTransactionRow,
  type PesepayWalletRow,
  type StoragePurchaseRow,
} from "../../lib/repositories/pesepay.ts";

interface WorkspaceSettingsProps {
  workspaceId: string;
  isPlatformAdmin?: boolean;
  onNavigate?: (view: string) => void;
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

function formatPurchaseAmount(purchase: {
  amount: number;
  currency_code: string;
}): string {
  return purchase.currency_code === "USD"
    ? usdFormatter.format(Number(purchase.amount))
    : `${purchase.currency_code} ${Number(purchase.amount).toFixed(2)}`;
}

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
  onNavigate,
}: WorkspaceSettingsProps) {
  const [searchParams] = useSearchParams();
  const { totalSizeGB, tablesSizeGB, loading, error } = useDatabaseStats();
  const {
    usedMb,
    limitMb,
    percent,
    fileCount,
    purchasedStorageMb,
    expiringStorageMb,
    nextStorageExpiration,
    overQuota,
    loading: storageLoading,
    error: storageError,
  } = useWorkspaceStorage(workspaceId);
  const [purchases, setPurchases] = useState<StoragePurchaseRow[]>([]);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  const [purchasesLoadedAt, setPurchasesLoadedAt] = useState(0);
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
      const rows = await listStoragePurchases(workspaceId);
      setPurchases(rows);
      setPurchasesLoadedAt(Date.now());
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

  const storageUsedGB = usedMb / 1024;
  const storageLimitGB = limitMb / 1024;
  const isNearLimit = percent >= 80;
  const isAtLimit = percent >= 95;

  if (isPlatformAdmin) {
    return (
      <DashboardShell className="w-full max-w-full">
        <DashboardHeader
          badge={<Badge variant="secondary">Platform</Badge>}
          title="System Settings"
          subtitle="Platform-wide database and system statistics."
          meta={loading ? "Reading…" : `${totalSizeGB.toFixed(2)} GB on disk`}
        />

        <DashboardSection title="System database">
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
            <KpiGrid>
              <KpiCard
                title="Total database size"
                value={`${totalSizeGB.toFixed(2)} GB`}
                subtext="all schemas and storage objects"
                icon={<Database className="h-4 w-4" />}
                tone="primary"
              />
              <KpiCard
                title="Tables size"
                value={`${tablesSizeGB.toFixed(2)} GB`}
                subtext="relational table data"
                icon={<Server className="h-4 w-4" />}
                tone="info"
              />
            </KpiGrid>
          )}
        </DashboardSection>

        <DashboardSection title="Notifications">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Email notifications</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Receive email updates for important events
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Project updates</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
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

  const expiredPurchaseIds = new Set(
    purchases
      .filter(
        (purchase) =>
          purchase.expires_at !== null &&
          new Date(purchase.expires_at).getTime() <= purchasesLoadedAt,
      )
      .map((purchase) => purchase.id),
  );

  return (
    <DashboardShell className="w-full max-w-full">
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
            onClick={() => onNavigate?.("billing")}
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
                    <Empty className="gap-4 border border-dashed p-8">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Wallet />
                        </EmptyMedia>
                        <EmptyTitle className="text-base">
                          No balance transactions yet
                        </EmptyTitle>
                        <EmptyDescription>
                          Deposits and payments made from your balance will appear here.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <ResponsiveTable records>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Reference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {walletTransactions.map((transaction) => (
                            <TableRow key={transaction.id}>
                              <TableCell data-label="Description">
                                {transaction.description}
                              </TableCell>
                              <TableCell data-label="Date">
                                <time dateTime={transaction.created_at}>
                                  {dateFormatter.format(new Date(transaction.created_at))}
                                </time>
                              </TableCell>
                              <TableCell data-label="Type">
                                {transactionKindLabel(transaction.kind)}
                              </TableCell>
                              <TableCell
                                data-label="Amount"
                                className="font-mono tabular-nums"
                              >
                                {transaction.kind === "deposit" ? "+ " : "− "}
                                {usdFormatter.format(Number(transaction.amount))}
                              </TableCell>
                              <TableCell data-label="Status">
                                <Badge variant={walletStatusBadge(transaction.status)}>
                                  {walletStatusLabel(transaction.status)}
                                </Badge>
                              </TableCell>
                              <TableCell data-label="Reference">
                                {transaction.pesepay_reference ? (
                                  <span className="block max-w-48 truncate font-mono text-xs" title={transaction.pesepay_reference}>
                                    {transaction.pesepay_reference}
                                  </span>
                                ) : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ResponsiveTable>
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
                    {Math.max(limitMb / 1024 - usedMb / 1024, 0).toFixed(2)} GB remaining ·{" "}
                    {fileCount} files
                  </p>
                </div>

                {(isNearLimit || overQuota) && (
                  <div
                    className={
                      overQuota
                        ? "flex items-start gap-3 rounded-none border border-destructive/20 bg-destructive/10 p-4"
                        : "flex items-start gap-3 rounded-none border border-amber-500/20 bg-amber-500/10 p-4"
                    }
                  >
                    <HardDrive
                      size={16}
                      className={
                        overQuota
                          ? "mt-0.5 shrink-0 text-destructive"
                          : "mt-0.5 shrink-0 text-amber-500"
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {overQuota
                          ? "Over quota"
                          : isAtLimit
                            ? "Storage limit reached"
                            : "Storage almost full"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {overQuota
                          ? "New uploads are blocked, but every stored file stays available. Buy more storage or free space to resume uploading."
                          : "Buy a storage package to make more space available for projects and files."}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="scroll-mt-24 border-t border-border/70 pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">
                    How this quota is built
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Base quota {limitMb - purchasedStorageMb > 0 ? `${(limitMb - purchasedStorageMb).toFixed(0)} MB` : "0 MB"}
                    {" · "}{purchasedStorageMb.toFixed(0)} MB of purchased add-ons
                    {expiringStorageMb > 0
                      ? ` · ${expiringStorageMb.toFixed(0)} MB expires ${
                          nextStorageExpiration ? dateFormatter.format(new Date(nextStorageExpiration)) : "soon"
                        }`
                      : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2"
                  onClick={() => onNavigate?.("billing")}
                >
                  <CreditCard size={14} />
                  Buy storage
                </Button>
              </div>

              {overQuota && (
                <div className="mt-3 flex items-start gap-3 rounded-none border border-destructive/20 bg-destructive/10 p-4">
                  <HardDrive size={16} className="mt-0.5 shrink-0 text-destructive" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Over quota</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Existing files stay available. New uploads pause until the quota grows
                      again, either by buying storage or by freeing space.
                    </p>
                  </div>
                </div>
              )}

              <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
                Storage packages are timed and priced from the billing catalog. Purchases are
                activated by the server only after the payment is verified, and losing quota never
                deletes files that are already stored.
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
              <Empty className="gap-4 border border-dashed p-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CreditCard />
                  </EmptyMedia>
                  <EmptyTitle className="text-base">
                    No storage purchases yet
                  </EmptyTitle>
                  <EmptyDescription>
                    Storage packages bought from Billing appear here with their validity dates.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ResponsiveTable records>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Add-on</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Valid until</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((purchase) => {
                      const expired = expiredPurchaseIds.has(purchase.id);
                      return (
                        <TableRow key={purchase.id}>
                          <TableCell data-label="Add-on">
                            {purchase.storage_mb / 1024} GB
                          </TableCell>
                          <TableCell data-label="Date">
                            <time dateTime={purchase.paid_at}>
                              {dateFormatter.format(new Date(purchase.paid_at))}
                            </time>
                          </TableCell>
                          <TableCell
                            data-label="Amount"
                            className="font-mono tabular-nums"
                          >
                            {formatPurchaseAmount(purchase)}
                          </TableCell>
                          <TableCell data-label="Method">
                            {purchase.payment_method === "balance"
                              ? "PesePay balance"
                              : purchase.payment_method === "pesepay"
                                ? "PesePay checkout"
                                : purchase.payment_method}
                          </TableCell>
                          <TableCell data-label="Valid until">
                            {purchase.expires_at ? (
                              <time dateTime={purchase.expires_at}>
                                {dateFormatter.format(new Date(purchase.expires_at))}
                              </time>
                            ) : (
                              "No expiry"
                            )}
                          </TableCell>
                          <TableCell data-label="Status">
                            <Badge variant={expired ? "secondary" : "success"}>
                              {expired ? "Expired" : "Active"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ResponsiveTable>
            )}
          </CardContent>
        </Card>
      </DashboardSection>

      <DashboardSection title="Team">
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Allow team invites</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Members can invite others to the workspace
                </p>
              </div>
              <Switch />
            </div>
            <div className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Require admin approval</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
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
            <div className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Email notifications</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Receive email updates for important events
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Project updates</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
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
