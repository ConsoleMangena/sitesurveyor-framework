import { useState, useCallback } from "react";
import { Banknote, Loader2, Plus, Download, CreditCard, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import PageLoader from "@/components/PageLoader.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComboboxField } from "@/components/templates/ComboboxField.tsx";
import { PageForm } from "@/components/templates/PageForm.tsx";
import { DashboardHeader, DashboardShell } from "@/components/dashboard/DashboardShell.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import WalletBalancesStrip from "../../features/phantom/components/WalletBalancesStrip.tsx";
import MetricsTiles from "../../components/finance/MetricsTiles.tsx";
import TransactionTable from "../../components/finance/TransactionTable.tsx";
import MarketplaceWalletCard from "../../components/finance/MarketplaceWalletCard.tsx";
import { formatCurrency } from "../../components/finance/FinanceUtils.ts";

import { listInvoices } from "../../lib/repositories/invoices.ts";
import type { InvoiceWithDetails } from "../../lib/repositories/invoices.ts";
import { createPayment, listPayments } from "../../lib/repositories/payments.ts";
import { initiatePesepayCheckout } from "../../lib/repositories/pesepay.ts";
import type { PaymentWithInvoice } from "../../lib/repositories/payments.ts";
import {
  deletePaymentMethod,
  listPaymentMethods,
  setDefaultPaymentMethod,
  type PaymentMethodRow,
} from "../../lib/repositories/paymentMethods.ts";
import { canManageFinance } from "../../lib/permissions.ts";
import {
  getMyWorkspaceMembership,
  type WorkspaceMemberRow,
} from "../../lib/repositories/workspaces.ts";
import SolanaLogo from "../../features/phantom/components/SolanaLogo.tsx";
import PhantomWalletCard from "../../features/phantom/components/PhantomWalletCard.tsx";
import { useSiteSurveyorWallet } from "../../features/phantom/hooks/useSiteSurveyorWallet.ts";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import {
  estimateUsdcTransferFee,
  payInvoiceWithUsdc,
} from "../../features/phantom/payments/phantomPay.ts";
import {
  isOnChainPaymentConfigured,
  SOLANA_CLUSTER,
  SOLANA_USDC_MINT,
} from "../../features/phantom/lib/config.ts";

interface BillingPageProps {
  workspaceId: string;
  /** Workspace managers and platform admins may record/manage payments. */
  isPlatformAdmin?: boolean;
}

export default function BillingPage({
  workspaceId,
  isPlatformAdmin = false,
}: BillingPageProps) {
  const phantomWallet = useSiteSurveyorWallet();
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");
  const [notice, setNotice] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [history, setHistory] = useState<PaymentWithInvoice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [membership, setMembership] = useState<WorkspaceMemberRow | null>(null);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [recordPaymentError, setRecordPaymentError] = useState<string | null>(null);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [pesepayBusy, setPesepayBusy] = useState(false);
  const [pesepayReference, setPesepayReference] = useState<string | null>(null);
  const [solanaStatus, setSolanaStatus] = useState<
    "idle" | "connecting" | "pending" | "recording"
  >("idle");
  const [solanaFeeEstimate, setSolanaFeeEstimate] = useState<string | null>(null);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historySort, setHistorySort] = useState<
    "date-desc" | "date-asc" | "amount-desc"
  >("date-desc");

  const fetchMethods = useCallback(async () => {
    try {
      const data = await listPaymentMethods(workspaceId);
      setPaymentMethods(data);
    } catch {
      setPaymentMethods([]);
    } finally {
      setMethodsLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(fetchMethods, [fetchMethods]);

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryError(null);
      const data = await listPayments(workspaceId);
      setHistory(data);
    } catch (err: unknown) {
      setHistoryError(err instanceof Error ? err.message : "Failed to load billing history");
    } finally {
      setHistoryLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(fetchHistory, [fetchHistory]);

  const fetchInvoices = useCallback(async () => {
    try {
      const data = await listInvoices(workspaceId);
      setInvoices(data);
    } catch {
      setInvoices([]);
    } finally {
      setInvoicesLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(fetchInvoices, [fetchInvoices]);

  const fetchMembership = useCallback(async () => {
    try {
      const membershipData = await getMyWorkspaceMembership(workspaceId);
      setMembership(membershipData);
    } catch {
      setMembership(null);
    }
  }, [workspaceId]);

  useAsyncAction(fetchMembership, [fetchMembership]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2300);
  };

  const setDefaultMethod = async (id: string) => {
    try {
      await setDefaultPaymentMethod(workspaceId, id);
      await fetchMethods();
      showNotice("Default payment method updated.");
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Failed to update default.");
    }
  };

  const removeMethod = async (id: string) => {
    try {
      await deletePaymentMethod(id);
      await fetchMethods();
      showNotice("Payment method removed.");
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Failed to remove method.");
    }
  };

  const escapeCsv = (value: string | number | null | undefined) => {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
    return str;
  };

  const downloadStatementCsv = () => {
    const rows = query ? filteredHistory : history;
    if (rows.length === 0) {
      showNotice("No payment records available to export.");
      return;
    }
    const header = ["paid_on", "invoice_number", "payment_method", "reference", "amount", "notes"];
    const csvRows = rows.map((entry) =>
      [
        entry.paid_on,
        entry.invoice_number,
        entry.payment_method,
        entry.reference,
        entry.amount.toFixed(2),
        entry.notes ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    );
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `billing-statement-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice("Statement CSV downloaded.");
  };

  const resetRecordPaymentForm = () => {
    setPaymentInvoiceId("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentAmount("");
    setPaymentMethod("");
    setPaymentReference("");
    setPaymentNotes("");
    setRecordPaymentError(null);
    setSolanaStatus("idle");
  };

  const submitRecordPayment = async () => {
    if (!paymentInvoiceId) {
      setRecordPaymentError("Please select an invoice.");
      return;
    }
    const parsedAmount = Number(paymentAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setRecordPaymentError("Please enter a valid amount greater than zero.");
      return;
    }
    if (!paymentDate) {
      setRecordPaymentError("Please select a payment date.");
      return;
    }

    try {
      setRecordingPayment(true);
      setRecordPaymentError(null);
      await createPayment(workspaceId, {
        invoice_id: paymentInvoiceId,
        paid_on: paymentDate,
        amount: parsedAmount,
        payment_method: paymentMethod.trim() || null,
        reference: paymentReference.trim() || null,
        notes: paymentNotes.trim() || null,
      });
      await fetchHistory();
      setIsRecordPaymentOpen(false);
      resetRecordPaymentForm();
      showNotice("Payment recorded.");
    } catch (err: unknown) {
      setRecordPaymentError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setRecordingPayment(false);
    }
  };

  const selectedInvoice = invoices.find((inv) => inv.id === paymentInvoiceId);

  const payWithPesepay = async () => {
    if (!selectedInvoice) {
      setRecordPaymentError("Please select an invoice to pay.");
      return;
    }
    setRecordPaymentError(null);
    setPesepayBusy(true);
    try {
      const checkout = await initiatePesepayCheckout({
        invoiceId: selectedInvoice.id,
        workspaceId,
      });
      setPesepayReference(checkout.referenceNumber);
      window.location.assign(checkout.redirectUrl);
    } catch (err: unknown) {
      setRecordPaymentError(err instanceof Error ? err.message : "Pesepay checkout failed.");
      setPesepayBusy(false);
    }
  };

  const solanaBusy = solanaStatus !== "idle";
  const solanaConfigured = isOnChainPaymentConfigured();

  const solanaButtonLabel = {
    idle: `Pay with Solana (USDC) on ${SOLANA_CLUSTER}`,
    connecting: "Connecting Phantom…",
    pending: "Confirm in wallet…",
    recording: "Recording payment…",
  }[solanaStatus];

  const payWithSolana = async () => {
    if (!selectedInvoice) {
      setRecordPaymentError("Please select an invoice to pay.");
      return;
    }
    setRecordPaymentError(null);
    try {
      setSolanaStatus("connecting");
      const { signature, reference, walletAddress } = await payInvoiceWithUsdc({
        amount: selectedInvoice.total,
        invoiceId: selectedInvoice.id,
      });

      setSolanaStatus("recording");
      await createPayment(workspaceId, {
        invoice_id: selectedInvoice.id,
        paid_on: new Date().toISOString().slice(0, 10),
        amount: selectedInvoice.total,
        payment_method: "Solana (USDC)",
        reference,
        notes: `Invoice ${selectedInvoice.invoice_number} paid via Phantom`,
        chain: "solana",
        token_mint: SOLANA_USDC_MINT,
        tx_signature: signature,
        wallet_address: walletAddress,
      });
      await fetchHistory();
      setIsRecordPaymentOpen(false);
      resetRecordPaymentForm();
      showNotice("Solana payment sent and recorded.");
    } catch (err: unknown) {
      setRecordPaymentError(err instanceof Error ? err.message : "Solana payment failed.");
    } finally {
      setSolanaStatus("idle");
    }
  };

  const estimateFee = useCallback(async () => {
    if (!selectedInvoice || !solanaConfigured) {
      setSolanaFeeEstimate(null);
      return;
    }
    setSolanaFeeEstimate("…");
    try {
      const fee = await estimateUsdcTransferFee(selectedInvoice.total);
      setSolanaFeeEstimate(
        fee > 0
          ? `~${fee.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
          : null,
      );
    } catch {
      setSolanaFeeEstimate(null);
    }
  }, [selectedInvoice, solanaConfigured]);

  useAsyncAction(estimateFee, [estimateFee]);

  const canManageBilling = canManageFinance(membership?.role) || isPlatformAdmin;

  const query = historySearch.trim().toLowerCase();
  const filteredHistory = history
    .filter(
      (entry) =>
        !query ||
        (entry.notes ?? "").toLowerCase().includes(query) ||
        (entry.invoice_number ?? "").toLowerCase().includes(query) ||
        (entry.payment_method ?? "").toLowerCase().includes(query),
    )
    .sort((a, b) => {
      if (historySort === "amount-desc") return b.amount - a.amount;
      if (historySort === "date-asc")
        return new Date(a.paid_on).getTime() - new Date(b.paid_on).getTime();
      return new Date(b.paid_on).getTime() - new Date(a.paid_on).getTime();
    });

  if (isRecordPaymentOpen) {
    return (
      <PageForm
        title="Record Payment"
        description="Record an offline payment or pay on-chain with Solana."
        onBack={() => setIsRecordPaymentOpen(false)}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setIsRecordPaymentOpen(false)}
              disabled={recordingPayment || solanaBusy}
            >
              Cancel
            </Button>
            <Button onClick={submitRecordPayment} disabled={recordingPayment || solanaBusy}>
              {recordingPayment && <Loader2 size={14} className="mr-2 animate-spin" />}
              {recordingPayment ? "Saving..." : "Save Payment"}
            </Button>
          </>
        }
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-6">
              {/* ── Payment Details ──────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <Banknote size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Payment details
                      </CardTitle>
                      <CardDescription>
                        Record an offline payment or pay on-chain with Solana.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <ComboboxField
                        label="Invoice"
                        value={paymentInvoiceId}
                        onChange={(val) => setPaymentInvoiceId(val)}
                        options={invoices.map((inv) => ({
                          value: inv.id,
                          label: `${inv.invoice_number} - ${formatCurrency(inv.total)}`,
                        }))}
                        placeholder="Select invoice"
                        emptyText="No invoices found."
                        optional
                        optionalLabel="Select invoice"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="payment-date">Date</Label>
                      <Input
                        id="payment-date"
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="payment-amount">Amount</Label>
                      <Input
                        id="payment-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Amount"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="payment-method">Method</Label>
                      <Input
                        id="payment-method"
                        placeholder="Payment method (optional)"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="payment-reference">Reference</Label>
                      <Input
                        id="payment-reference"
                        placeholder="Reference (optional)"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="payment-notes">Notes</Label>
                      <Input
                        id="payment-notes"
                        placeholder="Notes (optional)"
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {recordPaymentError ? (
                <ErrorNotice tone="danger">
                  {recordPaymentError}
                </ErrorNotice>
              ) : null}

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <CreditCard size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">Pay with Pesepay</CardTitle>
                      <CardDescription>Use EcoCash, InnBucks, cards, Zimswitch, or other supported Zimbabwe payment methods.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button type="button" className="w-full gap-2" onClick={payWithPesepay} disabled={pesepayBusy || solanaBusy || !selectedInvoice}>
                    {pesepayBusy && <Loader2 size={16} className="animate-spin" />}
                    <CreditCard size={16} />
                    {pesepayBusy ? "Opening Pesepay…" : "Pay with Pesepay"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    {selectedInvoice ? `Pays ${formatCurrency(selectedInvoice.total)} ${selectedInvoice.currency_code} for ${selectedInvoice.invoice_number} on Pesepay.` : "Select an invoice to continue."}
                  </p>
                  {pesepayReference && <p className="text-center text-xs text-muted-foreground">Reference: {pesepayReference}</p>}
                </CardContent>
              </Card>


              {solanaConfigured && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                        <Wallet size={15} />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          Pay on-chain
                        </CardTitle>
                        <CardDescription>
                          Pay the invoice directly with a Solana wallet.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">SiteSurveyor uses the Solana wallet adapter for this payment. Confirm the network, token, recipient, and amount in Phantom before approving.</p>
                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                        <div className="rounded-lg border bg-muted/30 p-3"><strong className="block text-foreground">1. Connect</strong>Use your Phantom wallet.</div>
                        <div className="rounded-lg border bg-muted/30 p-3"><strong className="block text-foreground">2. Review</strong>Check the invoice and treasury.</div>
                        <div className="rounded-lg border bg-muted/30 p-3"><strong className="block text-foreground">3. Confirm</strong>Approve only the expected transaction.</div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={payWithSolana}
                        disabled={
                          solanaBusy ||
                          recordingPayment ||
                          !selectedInvoice
                        }
                        aria-busy={solanaBusy}
                      >
                        {solanaBusy && <Loader2 size={16} className="animate-spin" />}
                        <SolanaLogo size={18} />
                        {solanaButtonLabel}
                      </Button>
                      <p className="text-center text-xs text-muted-foreground">
                        {selectedInvoice
                          ? `Pays ${formatCurrency(selectedInvoice.total)} in USDC to the workspace treasury from your connected Phantom wallet.${
                              solanaFeeEstimate
                                ? ` Estimated network cost: ${solanaFeeEstimate}.`
                                : ""
                            }`
                          : "Select an invoice to pay it directly with your Phantom wallet."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── Summary ───────────────────────────────────── */}
            <aside className="h-fit space-y-6 lg:sticky lg:top-0">
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="text-base">Payment</CardTitle>
                  <CardDescription>Summary at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Invoice</dt>
                      <dd className="truncate font-medium">
                        {selectedInvoice
                          ? selectedInvoice.invoice_number
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Amount</dt>
                      <dd className="font-semibold tabular-nums">
                        {formatCurrency(Number(paymentAmount || 0))}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Date</dt>
                      <dd className="truncate font-medium">
                        {paymentDate || "—"}
                      </dd>
                    </div>
                    {selectedInvoice && (
                      <>
                        <div className="border-t pt-3">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Invoice total
                          </p>
                          <p className="mt-0.5 text-lg font-semibold tabular-nums">
                            {formatCurrency(selectedInvoice.total)}
                          </p>
                        </div>
                      </>
                    )}
                  </dl>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </PageForm>
    );
  }

  return (
    <DashboardShell className="hub-body billing-page finance-page">
      <DashboardHeader
        title="Treasury"
        subtitle="Wallet balances, payments, and transaction history"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadStatementCsv}
              className="gap-2 rounded-xl"
            >
              <Download size={16} />
              Export
            </Button>
            {canManageBilling && (
              <Button
                size="sm"
                onClick={() => {
                  resetRecordPaymentForm();
                  setIsRecordPaymentOpen(true);
                }}
                disabled={invoicesLoading || invoices.length === 0}
                className="gap-2 rounded-xl"
              >
                <Plus size={16} />
                Record Payment
              </Button>
            )}
          </div>
        }
      />

      {notice && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          {notice}
        </div>
      )}

      <WalletBalancesStrip
        address={phantomWallet.address}
        connected={phantomWallet.connected}
        onConnect={() => void phantomWallet.connect()}
      />

      <MetricsTiles
        collected={history.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)}
        outstanding={invoices.reduce(
          (sum, invoice) => sum + (invoice.status === "paid" ? 0 : Number(invoice.total || 0)),
          0,
        )}
        invoiceCount={invoices.length}
      />

      <div className="flex flex-col gap-4">
        <PhantomWalletCard />
        <MarketplaceWalletCard
          workspaceId={workspaceId}
          phantomAddress={phantomWallet.address}
          phantomShortAddress={phantomWallet.shortAddress}
          cryptoMethods={paymentMethods.filter((m) => m.type === "Crypto Wallet" && m.detail)}
          onNotice={showNotice}
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "overview" | "history")}
      >
        <DashboardCard
          title="Payments"
          icon={<Banknote size={16} />}
          className="rounded-2xl border-border/60"
          titleAction={
            <TabsList>
              <TabsTrigger value="overview">Payment methods</TabsTrigger>
              <TabsTrigger value="history">Payment history</TabsTrigger>
            </TabsList>
          }
        >
            <TabsContent value="overview" className="mt-0">
              {methodsLoading ? (
                <PageLoader compact />
              ) : paymentMethods.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No saved payment methods yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paymentMethods.map((method) => (
                    <Card
                      key={method.id}
                      className={cn(
                        "rounded-2xl border-border/60",
                        method.is_default && "border-primary/60 ring-1 ring-primary/40",
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center text-sm font-semibold",
                                method.type === "Card"
                                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                  : method.type === "Crypto Wallet"
                                    ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                              )}
                            >
                              {method.type === "Card"
                                ? method.label.slice(0, 2)
                                : method.type === "Crypto Wallet"
                                  ? <SolanaLogo size={22} />
                                  : "MM"}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{method.label}</p>
                              <p className="text-xs text-muted-foreground">{method.type}</p>
                            </div>
                          </div>
                          {method.is_default && <Badge variant="success">Default</Badge>}
                        </div>

                        <p className="mt-3 text-sm font-medium">
                          {method.type === "Crypto Wallet"
                            ? `${method.detail.slice(0, 6)}…${method.detail.slice(-6)}`
                            : method.detail}
                        </p>
                        {method.expiry && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {method.type === "Crypto Wallet"
                              ? `Network: ${method.expiry}`
                              : `Expires ${method.expiry}`}
                          </p>
                        )}
                        {method.holder && (
                          <p className="text-xs text-muted-foreground">{method.holder}</p>
                        )}

                        <div className="flex flex-wrap gap-2 mt-4">
                          {canManageBilling && !method.is_default && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void setDefaultMethod(method.id)}
                            >
                              Set Default
                            </Button>
                          )}
                          {canManageBilling && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void removeMethod(method.id)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-0 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  placeholder="Search transactions..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="max-w-sm rounded-xl"
                />
                <div className="inline-flex flex-wrap gap-2">
                  {[
                    { value: "date-desc", label: "Newest" },
                    { value: "date-asc", label: "Oldest" },
                    { value: "amount-desc", label: "Highest amount" },
                  ].map((opt) => (
                    <Button
                      key={opt.value}
                      variant={historySort === opt.value ? "default" : "outline"}
                      size="sm"
                      className="rounded-xl"
                      onClick={() => setHistorySort(opt.value as typeof historySort)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              <TransactionTable
                rows={filteredHistory}
                loading={historyLoading}
                error={historyError}
              />
            </TabsContent>
        </DashboardCard>
      </Tabs>

    </DashboardShell>
  );
}

