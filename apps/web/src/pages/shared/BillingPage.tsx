import { useState, useCallback, useMemo } from "react";
import {
  Banknote,
  Check,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { Connection, Transaction } from "@solana/web3.js";

import PageLoader from "@/components/PageLoader.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ComboboxField } from "@/components/templates/ComboboxField.tsx";
import { PageForm } from "@/components/templates/PageForm.tsx";
import { DashboardHeader, DashboardShell } from "@/components/dashboard/DashboardShell.tsx";
import WalletBalancesStrip from "../../features/phantom/components/WalletBalancesStrip.tsx";
import WalletMethodsCard from "../../features/phantom/components/WalletMethodsCard.tsx";
import MetricsTiles from "../../components/finance/MetricsTiles.tsx";
import TransactionTable from "../../components/finance/TransactionTable.tsx";
import MarketplaceWalletCard from "../../components/finance/MarketplaceWalletCard.tsx";
import { formatCurrency } from "../../components/finance/FinanceUtils.ts";

import { listInvoices } from "../../lib/repositories/invoices.ts";
import type { InvoiceWithDetails } from "../../lib/repositories/invoices.ts";
import { createPayment, listPayments } from "../../lib/repositories/payments.ts";
import {
  getPesepayWallet,
  initiatePesepayCheckout,
  payInvoiceWithBalance,
  type PesepayWalletRow,
} from "../../lib/repositories/pesepay.ts";
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
import { useSiteSurveyorWallet } from "../../features/phantom/hooks/useSiteSurveyorWallet.ts";
import { CUSTOM_WALLET_NAME } from "../../features/phantom/lib/customWalletAdapter.ts";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import {
  estimateUsdcTransferFee,
  payInvoiceWithUsdc,
} from "../../features/phantom/payments/phantomPay.ts";
import type { WalletPaymentAdapter } from "../../features/phantom/payments/phantomPay.ts";
import {
  explorerAccountUrl,
  isOnChainPaymentConfigured,
  SOLANA_CLUSTER,
  SOLANA_CLUSTER_LABEL,
  SOLANA_TREASURY_ADDRESS,
  SOLANA_USDC_MINT,
} from "../../features/phantom/lib/config.ts";
import "../../styles/billing.css";

interface BillingPageProps {
  workspaceId: string;
  /** Workspace managers and platform admins may record/manage payments. */
  isPlatformAdmin?: boolean;
}

function shorten(value: string, lead = 6, tail = 6): string {
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

function methodIcon(method: PaymentMethodRow) {
  const label = method.label.toLowerCase();
  if (label.includes("metamask")) return <img src="/metamask.svg" alt="" />;
  if (label.includes("solflare")) return <img src="/solflare.svg" alt="" />;
  if (method.type === "Crypto Wallet") return <img src="/solanaLogoMark.svg" alt="" />;
  return <span>{method.label.slice(0, 2).toUpperCase()}</span>;
}

function clusterLabelFor(expiry: string | null): string {
  if (!expiry) return "Solana";
  if (expiry === "mainnet-beta") return "Solana Mainnet";
  return `Solana ${expiry.charAt(0).toUpperCase()}${expiry.slice(1)}`;
}

export default function BillingPage({
  workspaceId,
  isPlatformAdmin = false,
}: BillingPageProps) {
  const phantomWallet = useSiteSurveyorWallet();
  const {
    wallet: activeWallet,
    publicKey: activePublicKey,
    sendTransaction: sendAdapterTransaction,
  } = phantomWallet;

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
  const [pesepayBalance, setPesepayBalance] = useState<PesepayWalletRow | null>(null);
  const [pesepayBalanceLoading, setPesepayBalanceLoading] = useState(true);
  const [pesepayBalanceError, setPesepayBalanceError] = useState<string | null>(null);
  const [balancePaymentBusy, setBalancePaymentBusy] = useState(false);
  const [solanaStatus, setSolanaStatus] = useState<
    "idle" | "connecting" | "pending" | "recording"
  >("idle");
  const [solanaFeeEstimate, setSolanaFeeEstimate] = useState<string | null>(null);
  const [copiedTreasury, setCopiedTreasury] = useState(false);
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

  const clusterLabel = SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER];

  const connectedWalletName = useMemo(() => {
    const name = activeWallet?.adapter.name;
    if (name === CUSTOM_WALLET_NAME) return null;
    if (name) return name;
    return phantomWallet.address ? "Phantom" : null;
  }, [activeWallet, phantomWallet.address]);

  const walletAdapterForPayment = useMemo<WalletPaymentAdapter | undefined>(() => {
    if (!activeWallet || !activePublicKey) return undefined;
    if (activeWallet.adapter.name === CUSTOM_WALLET_NAME) return undefined;
    return {
      publicKey: activePublicKey,
      sendTransaction: (transaction: Transaction, connection: Connection) =>
        sendAdapterTransaction(transaction, connection),
    };
  }, [activeWallet, activePublicKey, sendAdapterTransaction]);

  const walletLabel =
    connectedWalletName ?? (phantomWallet.installed ? "Phantom" : "Solana wallet");

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

  const fetchPesepayBalance = useCallback(async () => {
    try {
      setPesepayBalanceError(null);
      setPesepayBalance(await getPesepayWallet(workspaceId));
    } catch (err: unknown) {
      setPesepayBalanceError(err instanceof Error ? err.message : "Failed to load your PesePay balance.");
    } finally {
      setPesepayBalanceLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(fetchPesepayBalance, [fetchPesepayBalance]);

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

  const scrollToWalletMethods = () => {
    const target = document.getElementById("wallet-methods");
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
  };

  const copyTreasuryAddress = async () => {
    if (!SOLANA_TREASURY_ADDRESS) return;
    try {
      await navigator.clipboard.writeText(SOLANA_TREASURY_ADDRESS);
      setCopiedTreasury(true);
      window.setTimeout(() => setCopiedTreasury(false), 2000);
    } catch {
      showNotice("Could not copy the treasury address.");
    }
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

  const payFromPesepayBalance = async () => {
    if (!selectedInvoice) {
      setRecordPaymentError("Please select an invoice to pay.");
      return;
    }
    if (selectedInvoice.currency_code !== "USD") {
      setRecordPaymentError("The PesePay balance currently supports USD invoices only.");
      return;
    }
    setRecordPaymentError(null);
    setBalancePaymentBusy(true);
    try {
      await payInvoiceWithBalance({
        invoiceId: selectedInvoice.id,
        workspaceId,
      });
      await Promise.all([fetchHistory(), fetchInvoices(), fetchPesepayBalance()]);
      setIsRecordPaymentOpen(false);
      resetRecordPaymentForm();
      showNotice("Invoice paid from your PesePay balance.");
    } catch (err: unknown) {
      setRecordPaymentError(err instanceof Error ? err.message : "PesePay balance payment failed.");
    } finally {
      setBalancePaymentBusy(false);
    }
  };

  const solanaBusy = solanaStatus !== "idle";
  const solanaConfigured = isOnChainPaymentConfigured();

  const solanaButtonLabel = {
    idle: `Pay with ${walletLabel}`,
    connecting: `Connecting ${walletLabel}…`,
    pending: `Confirm in ${walletLabel}…`,
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
        walletAdapter: walletAdapterForPayment,
      });

      setSolanaStatus("recording");
      await createPayment(workspaceId, {
        invoice_id: selectedInvoice.id,
        paid_on: new Date().toISOString().slice(0, 10),
        amount: selectedInvoice.total,
        payment_method: "Solana (USDC)",
        reference,
        notes: `Invoice ${selectedInvoice.invoice_number} paid via ${connectedWalletName ?? "Solana wallet"}`,
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
        description="Record an offline payment or pay an invoice on-chain with Solana."
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
              <Card className="rounded-2xl border-border/60">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Banknote size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">Payment details</CardTitle>
                      <CardDescription>
                        Choose the invoice, then pay on-chain or record an offline payment.
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
                <ErrorNotice tone="danger">{recordPaymentError}</ErrorNotice>
              ) : null}

              {solanaConfigured && (
                <Card className="rounded-2xl border-border/60">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <SolanaLogo size={16} />
                      </div>
                      <div>
                        <CardTitle className="text-base">Pay on-chain</CardTitle>
                        <CardDescription>
                          Send USDC on Solana {clusterLabel} directly to the workspace
                          treasury.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Pay from any wallet you sign in with — Phantom, Solflare,
                        MetaMask, or a wallet app. SiteSurveyor builds the USDC
                        transfer; you approve it in your wallet.
                      </p>
                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <strong className="block text-foreground">1. Connect</strong>
                          Use your sign-in wallet.
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <strong className="block text-foreground">2. Review</strong>
                          Check the invoice, treasury, and amount.
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <strong className="block text-foreground">3. Confirm</strong>
                          Approve only the expected transaction.
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Button
                        type="button"
                        className="w-full gap-2"
                        onClick={payWithSolana}
                        disabled={solanaBusy || recordingPayment || !selectedInvoice}
                        aria-busy={solanaBusy}
                      >
                        {solanaBusy && <Loader2 size={16} className="animate-spin" />}
                        <SolanaLogo size={18} />
                        {solanaButtonLabel}
                      </Button>
                      <p className="text-center text-xs text-muted-foreground">
                        {selectedInvoice
                          ? `Pays ${formatCurrency(selectedInvoice.total)} in USDC on Solana ${clusterLabel}${
                              solanaFeeEstimate
                                ? `. Estimated network cost: ${solanaFeeEstimate}.`
                                : "."
                            }`
                          : "Select an invoice to pay it directly with your wallet."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="rounded-2xl border-border/60">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CreditCard size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">Pay with Pesepay</CardTitle>
                      <CardDescription>
                        Use EcoCash, InnBucks, cards, Zimswitch, or other supported
                        Zimbabwe payment methods.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-3 rounded-lg border bg-muted/25 p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Available PesePay balance</span>
                      {pesepayBalanceLoading ? (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <Loader2 size={14} className="animate-spin" /> Loading…
                        </span>
                      ) : (
                        <strong className="tabular-nums">
                          {formatCurrency(Number(pesepayBalance?.balance ?? 0))}
                        </strong>
                      )}
                    </div>
                    <Button
                      type="button"
                      className="w-full gap-2"
                      onClick={payFromPesepayBalance}
                      disabled={
                        balancePaymentBusy ||
                        pesepayBusy ||
                        solanaBusy ||
                        !selectedInvoice ||
                        selectedInvoice.currency_code !== "USD"
                      }
                      aria-busy={balancePaymentBusy}
                    >
                      {balancePaymentBusy && <Loader2 size={16} className="animate-spin" />}
                      <Wallet size={16} />
                      {balancePaymentBusy ? "Paying…" : "Pay from PesePay balance"}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      {selectedInvoice
                        ? selectedInvoice.currency_code === "USD"
                          ? `Uses ${formatCurrency(Number(selectedInvoice.total))} from your prepaid SiteSurveyor balance. Deposits cannot be refunded or withdrawn.`
                          : "This balance currently supports USD invoices only."
                        : "Select a USD invoice to pay it from your balance."}
                    </p>
                    {pesepayBalanceError && (
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-destructive">{pesepayBalanceError}</span>
                        <Button variant="outline" size="sm" onClick={() => void fetchPesepayBalance()}>
                          Retry
                        </Button>
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={payWithPesepay}
                    disabled={
                      pesepayBusy ||
                      balancePaymentBusy ||
                      solanaBusy ||
                      recordingPayment ||
                      !selectedInvoice
                    }
                  >
                    {pesepayBusy && <Loader2 size={16} className="animate-spin" />}
                    <CreditCard size={16} />
                    {pesepayBusy ? "Opening Pesepay…" : "Pay with Pesepay"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    {selectedInvoice
                      ? `Opens a ${formatCurrency(Number(selectedInvoice.total))} ${selectedInvoice.currency_code} Pesepay checkout for ${selectedInvoice.invoice_number}.`
                      : "Select an invoice to continue."}
                  </p>
                  {pesepayReference && (
                    <p className="text-center text-xs text-muted-foreground">
                      Reference: {pesepayReference}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <aside className="h-fit space-y-6 lg:sticky lg:top-0">
              <Card className="gap-4 rounded-2xl border-border/60">
                <CardHeader>
                  <CardTitle className="text-base">Payment</CardTitle>
                  <CardDescription>Summary at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Invoice</dt>
                      <dd className="truncate font-medium">
                        {selectedInvoice ? selectedInvoice.invoice_number : "—"}
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
                      <dd className="truncate font-medium">{paymentDate || "—"}</dd>
                    </div>
                    {selectedInvoice && (
                      <div className="border-t pt-3">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          Invoice total
                        </p>
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">
                          {formatCurrency(selectedInvoice.total)}
                        </p>
                      </div>
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
        badge={
          <span className="treasury-badge">
            <span className="treasury-badge-dot" />
            Treasury
          </span>
        }
        title="Treasury"
        subtitle={`Solana ${clusterLabel} · USDC`}
        description="Wallets, balances, and payment records for this workspace."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadStatementCsv}
              className="gap-2 rounded-lg"
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
                className="gap-2 rounded-lg"
              >
                <Plus size={16} />
                Record Payment
              </Button>
            )}
          </div>
        }
      />

      {notice && (
        <div className="treasury-notice" role="status">
          {notice}
        </div>
      )}

      <WalletBalancesStrip
        address={phantomWallet.address}
        connected={Boolean(phantomWallet.address)}
        walletName={connectedWalletName}
        onConnect={scrollToWalletMethods}
      />

      <MetricsTiles
        collected={history.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)}
        outstanding={invoices.reduce(
          (sum, invoice) => sum + (invoice.status === "paid" ? 0 : Number(invoice.total || 0)),
          0,
        )}
        invoiceCount={invoices.length}
      />

      <div className="treasury-layout">
        <div className="treasury-main">
          <WalletMethodsCard
            workspaceId={workspaceId}
            paymentMethods={paymentMethods}
            canManageBilling={canManageBilling}
            onMethodsChanged={fetchMethods}
            onNotice={showNotice}
          />

          <section className="method-ledger" aria-labelledby="saved-methods-title">
            <div className="method-ledger-head">
              <div>
                <p className="treasury-eyebrow">Saved methods</p>
                <h2 id="saved-methods-title" className="method-ledger-title">
                  Receiving accounts
                </h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-lg"
                onClick={scrollToWalletMethods}
              >
                <Plus size={14} />
                {canManageBilling ? "Add wallet method" : "Connect a wallet"}
              </Button>
            </div>

            {methodsLoading ? (
              <div className="method-ledger-loading">
                <PageLoader compact />
              </div>
            ) : paymentMethods.length === 0 ? (
              <div className="method-ledger-empty">
                <p className="method-ledger-empty-title">No saved methods yet</p>
                <p className="method-ledger-empty-hint">
                  Connect a wallet above to save its address for invoices and
                  marketplace payouts.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-lg"
                  onClick={scrollToWalletMethods}
                >
                  <Wallet size={14} />
                  Choose a wallet
                </Button>
              </div>
            ) : (
              <div className="method-ledger-list">
                {paymentMethods.map((method) => {
                  const isCrypto = method.type === "Crypto Wallet";
                  const detail = method.detail
                    ? isCrypto
                      ? shorten(method.detail)
                      : method.detail
                    : "No detail saved";
                  const meta = isCrypto
                    ? clusterLabelFor(method.expiry)
                    : method.expiry
                      ? `Expires ${method.expiry}`
                      : method.type;

                  return (
                    <div
                      key={method.id}
                      className="method-ledger-row"
                      data-default={method.is_default || undefined}
                    >
                      <span className="method-ledger-icon">{methodIcon(method)}</span>
                      <span className="method-ledger-copy">
                        <span className="method-ledger-name">
                          {method.label}
                          {method.is_default && (
                            <span className="method-ledger-flag">Default</span>
                          )}
                        </span>
                        <span className="method-ledger-meta">
                          {isCrypto ? `${meta} · ${detail}` : `${detail} · ${meta}`}
                        </span>
                      </span>
                      <span className="method-ledger-actions">
                        {canManageBilling && !method.is_default && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg"
                            onClick={() => void setDefaultMethod(method.id)}
                          >
                            Set default
                          </Button>
                        )}
                        {canManageBilling && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg text-muted-foreground"
                            onClick={() => void removeMethod(method.id)}
                          >
                            Remove
                          </Button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="treasury-side">
          <MarketplaceWalletCard
            workspaceId={workspaceId}
            connectedAddress={phantomWallet.address}
            connectedWalletName={connectedWalletName}
            cryptoMethods={paymentMethods.filter(
              (method) => method.type === "Crypto Wallet" && method.detail,
            )}
            onAddWallet={scrollToWalletMethods}
            onNotice={showNotice}
          />

          <section className="side-card settlement-card" aria-labelledby="settlement-title">
            <div className="side-card-head">
              <span className="side-card-mark">
                <ShieldCheck size={17} />
              </span>
              <div>
                <p className="treasury-eyebrow">Settlement</p>
                <h2 id="settlement-title" className="side-card-title">
                  How funds move
                </h2>
              </div>
            </div>
            <div className="side-card-body">
              <dl className="settlement-list">
                <div className="settlement-row">
                  <dt>Network</dt>
                  <dd>Solana {clusterLabel}</dd>
                </div>
                <div className="settlement-row">
                  <dt>Token</dt>
                  <dd>USDC · {shorten(SOLANA_USDC_MINT, 4, 4)}</dd>
                </div>
                <div className="settlement-row">
                  <dt>Treasury</dt>
                  <dd>
                    {SOLANA_TREASURY_ADDRESS ? (
                      <>
                        <span>{shorten(SOLANA_TREASURY_ADDRESS)}</span>
                        <button
                          type="button"
                          className="settlement-copy"
                          onClick={() => void copyTreasuryAddress()}
                          aria-label="Copy treasury address"
                        >
                          {copiedTreasury ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                        <a
                          href={explorerAccountUrl(SOLANA_TREASURY_ADDRESS)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="View treasury on Solana Explorer"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </>
                    ) : (
                      <span>Not configured</span>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="settlement-note">
                <ShieldCheck size={13} />
                SiteSurveyor never holds funds. Payments move wallet to wallet; this
                ledger keeps the record.
              </p>
            </div>
          </section>
        </aside>
      </div>

      <Card className="treasury-history-card">
        <div className="treasury-history-head">
          <div>
            <p className="treasury-eyebrow">Ledger</p>
            <h2 className="treasury-history-title">Payment history</h2>
            <p className="treasury-history-sub">
              {filteredHistory.length} of {history.length}{" "}
              {history.length === 1 ? "entry" : "entries"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-lg"
            onClick={downloadStatementCsv}
          >
            <Download size={14} />
            Export CSV
          </Button>
        </div>

        <div className="treasury-history-toolbar">
          <Input
            placeholder="Search transactions..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="treasury-search"
            aria-label="Search transactions"
          />
          <div className="treasury-sort-group" role="group" aria-label="Sort payments">
            {[
              { value: "date-desc", label: "Newest" },
              { value: "date-asc", label: "Oldest" },
              { value: "amount-desc", label: "Highest amount" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className="treasury-sort-btn"
                aria-pressed={historySort === option.value}
                onClick={() => setHistorySort(option.value as typeof historySort)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="treasury-history-body">
          <TransactionTable
            rows={filteredHistory}
            loading={historyLoading}
            error={historyError}
          />
        </div>
      </Card>
    </DashboardShell>
  );
}
