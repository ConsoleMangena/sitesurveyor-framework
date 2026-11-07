import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Banknote,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { Connection, Transaction } from "@solana/web3.js";

import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DashboardHeader } from "@/components/dashboard/DashboardShell.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ComboboxField } from "@/components/templates/ComboboxField.tsx";
import { PageForm } from "@/components/templates/PageForm.tsx";
import WalletMethodsCard from "../../features/phantom/components/WalletMethodsCard.tsx";
import PaymentRails from "../../components/finance/PaymentRails.tsx";
import MetricsTiles from "../../components/finance/MetricsTiles.tsx";
import TransactionTable from "../../components/finance/TransactionTable.tsx";
import MarketplaceWalletCard from "../../components/finance/MarketplaceWalletCard.tsx";
import { formatCurrency } from "../../components/finance/FinanceUtils.ts";
import { cn } from "@/lib/utils";

import { listInvoices } from "../../lib/repositories/invoices.ts";
import type { InvoiceWithDetails } from "../../lib/repositories/invoices.ts";
import { createPayment, listPayments } from "../../lib/repositories/payments.ts";
import {
  getPesepayWallet,
  initiatePesepayCheckout,
  payInvoiceWithBalance,
  verifyOrder,
  verifyWalletDeposit,
  type PesepayWalletRow,
} from "../../lib/repositories/pesepay.ts";
import BillingOverviewSection from "../../components/finance/BillingOverviewSection.tsx";
import AiCreditsSection from "../../components/finance/AiCreditsSection.tsx";
import StorageSection from "../../components/finance/StorageSection.tsx";
import BillingLedgerSection from "../../components/finance/BillingLedgerSection.tsx";
import FinancialInsightsSection from "../../components/finance/FinancialInsightsSection.tsx";
import type { PurchaseMessage } from "../../components/finance/PackageCatalog.tsx";
import {
  BILLING_SECTIONS,
  type BillingSectionId,
} from "../../components/finance/billingSections.ts";
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
import PesepayLogo from "../../features/phantom/components/PesepayLogo.tsx";
import { useSiteSurveyorWallet } from "../../features/phantom/hooks/useSiteSurveyorWallet.ts";
import { useSolanaBalances } from "../../features/phantom/hooks/useSolanaBalances.ts";
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

interface BillingPageProps {
  workspaceId: string;
  /** Workspace managers and platform admins may record/manage payments. */
  isPlatformAdmin?: boolean;
  onNavigate?: (view: string) => void;
}

type PaymentMode = "rails" | "offline";
type PaymentSource = "crypto" | "pesepay";

function shorten(value: string, lead = 6, tail = 6): string {
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

function formatAmount(value: number | null, maxDp: number): string {
  if (value === null) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDp,
  });
}

function methodIcon(method: PaymentMethodRow) {
  const label = method.label.toLowerCase();
  if (label.includes("metamask"))
    return <img src="/metamask.svg" alt="" className="size-5 object-contain" />;
  if (label.includes("solflare"))
    return <img src="/solflare.svg" alt="" className="size-5 object-contain" />;
  if (method.type === "Crypto Wallet")
    return <img src="/solanaLogoMark.svg" alt="" className="size-5 object-contain" />;
  return <span>{method.label.slice(0, 2).toUpperCase()}</span>;
}

function clusterLabelFor(expiry: string | null): string {
  if (!expiry) return "Solana";
  if (expiry === "mainnet-beta") return "Solana Mainnet";
  return `Solana ${expiry.charAt(0).toUpperCase()}${expiry.slice(1)}`;
}

function purchaseTone(tone: PurchaseMessage["tone"]) {
  if (tone === "success") return "success" as const;
  return tone === "error" ? ("danger" as const) : ("info" as const);
}

export default function BillingPage({
  workspaceId,
  isPlatformAdmin = false,
  onNavigate,
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
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("rails");
  const [paymentSource, setPaymentSource] = useState<PaymentSource>("crypto");
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [purchaseMessage, setPurchaseMessage] = useState<PurchaseMessage | null>(null);
  const [purchaseRefresh, setPurchaseRefresh] = useState(0);

  const visibleSections = BILLING_SECTIONS.filter(
    (item) => !item.adminOnly || isPlatformAdmin,
  );
  const sectionParam = searchParams.get("section");
  const activeSection: BillingSectionId =
    visibleSections.find((item) => item.id === sectionParam)?.id ?? "overview";

  const goSection = (next: BillingSectionId) => {
    const params = new URLSearchParams(searchParams);
    params.set("section", next);
    setSearchParams(params, { replace: true });
  };

  const activeSectionMeta =
    visibleSections.find((item) => item.id === activeSection) ?? BILLING_SECTIONS[0];

  // PesePay sends package checkouts back to ?pesepay=package-return&purchase=<id>.
  // The Edge Function asks the provider and allocates in one atomic step.
  const returnedPurchaseId =
    searchParams.get("pesepay") === "package-return"
      ? searchParams.get("purchase")
      : null;

  useEffect(() => {
    if (!returnedPurchaseId) return;
    const params = new URLSearchParams(searchParams);
    params.delete("pesepay");
    params.delete("purchase");
    setSearchParams(params, { replace: true });

    let cancelled = false;
    setPurchaseMessage({
      tone: "pending",
      text: "Confirming your purchase with PesePay…",
    });
    void verifyOrder({ workspaceId, orderId: returnedPurchaseId })
      .then((result) => {
        if (cancelled) return;
        if (result.status === "completed") {
          setPurchaseMessage({
            tone: "success",
            text:
              result.kind === "storage"
                ? "Payment confirmed. The storage you bought is active on this workspace."
                : result.kind === "ai_credits"
                  ? "Payment confirmed. Your AI credits are ready to use."
                  : "Payment confirmed by PesePay.",
          });
        } else if (result.status === "pending") {
          setPurchaseMessage({
            tone: "pending",
            text: "PesePay has not confirmed this payment yet. If you completed it, check the transactions tab again in a moment.",
          });
        } else {
          setPurchaseMessage({
            tone: "error",
            text: `PesePay reported this payment as ${result.status}. Nothing was added to the workspace.`,
          });
        }
        setPurchaseRefresh((count) => count + 1);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPurchaseMessage({
          tone: "error",
          text:
            err instanceof Error
              ? err.message
              : "Unable to confirm this purchase with PesePay. Check the transactions tab.",
        });
      });
    return () => {
      cancelled = true;
    };
    // searchParams is read, not depended on: the effect must run once per return.
  }, [returnedPurchaseId, setSearchParams, searchParams, workspaceId]);

  const clusterLabel = SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER];

  const savedCryptoMethods = paymentMethods.filter(
    (method) => method.type === "Crypto Wallet" && Boolean(method.detail),
  );
  const preferredSavedWallet =
    savedCryptoMethods.find((method) => method.is_default) ??
    savedCryptoMethods[0] ??
    null;
  const cryptoConnected = Boolean(phantomWallet.address);
  const cryptoAddress = phantomWallet.address ?? preferredSavedWallet?.detail ?? null;
  const solanaBalances = useSolanaBalances(cryptoAddress);

  const connectedWalletName = useMemo(() => {
    const name = activeWallet?.adapter.name;
    if (name === CUSTOM_WALLET_NAME) return "SiteSurveyor Wallet";
    if (name) return name;
    return phantomWallet.address ? "Phantom" : null;
  }, [activeWallet, phantomWallet.address]);

  const cryptoWalletName = connectedWalletName ?? preferredSavedWallet?.label ?? null;

  const walletAdapterForPayment = useMemo<WalletPaymentAdapter | undefined>(() => {
    if (!activeWallet || !activePublicKey) return undefined;
    return {
      publicKey: activePublicKey,
      sendTransaction: (transaction: Transaction, connection: Connection) =>
        sendAdapterTransaction(transaction, connection),
    };
  }, [activeWallet, activePublicKey, sendAdapterTransaction]);

  const walletLabel =
    cryptoWalletName ?? (phantomWallet.installed ? "Phantom" : "Solana wallet");

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

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2300);
  }, []);

  /** A purchase settled locally (balance payment): refresh every money view. */
  const reloadAfterPurchase = useCallback(() => {
    setPurchaseRefresh((count) => count + 1);
    void fetchPesepayBalance();
  }, [fetchPesepayBalance]);

  const scrollToWalletMethods = () => {
    const scroll = () => {
      const target = document.getElementById("wallet-methods");
      if (!target) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
    };
    if (activeSection !== "methods") {
      goSection("methods");
      window.setTimeout(scroll, 120);
      return;
    }
    scroll();
  };

  const openPaymentComposer = () => {
    setPaymentMode("rails");
    setPaymentSource(cryptoAddress ? "crypto" : "pesepay");
    setRecordPaymentError(null);
    setSolanaStatus("idle");
    setIsPaymentOpen(true);
  };

  const openPesepaySettings = () => {
    if (onNavigate) {
      onNavigate("settings");
      return;
    }
    window.location.assign(`${window.location.pathname}?view=settings`);
  };

  const manageWalletsFromComposer = () => {
    setIsPaymentOpen(false);
    window.setTimeout(scrollToWalletMethods, 80);
  };

  const openOfflineRecording = () => {
    setPaymentMode("offline");
    setRecordPaymentError(null);
    setPaymentDate(new Date().toISOString().slice(0, 10));
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
      setIsPaymentOpen(false);
      resetRecordPaymentForm();
      showNotice("Payment recorded.");
    } catch (err: unknown) {
      setRecordPaymentError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setRecordingPayment(false);
    }
  };

  const payableInvoices = invoices.filter(
    (invoice) => invoice.status !== "paid" && invoice.status !== "cancelled",
  );
  const selectedInvoice = payableInvoices.find((inv) => inv.id === paymentInvoiceId);
  const pesepayBalanceValue = Number(pesepayBalance?.balance ?? 0);
  const invoiceAmount = selectedInvoice ? Number(selectedInvoice.total) : 0;
  const invoiceCurrency = selectedInvoice?.currency_code ?? null;
  const balanceCoversInvoice = Boolean(
    selectedInvoice && invoiceCurrency === "USD" && pesepayBalanceValue + 0.0001 >= invoiceAmount,
  );

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
    if (!balanceCoversInvoice) {
      setRecordPaymentError("Your PesePay balance does not cover this invoice. Add funds first.");
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
      setIsPaymentOpen(false);
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
    if (!phantomWallet.address) {
      setRecordPaymentError(
        `Connect ${cryptoWalletName ?? "your wallet"} to pay from this saved method.`,
      );
      return;
    }
    if (selectedInvoice.currency_code !== "USD") {
      setRecordPaymentError("Crypto wallets settle USD invoices. Use PesePay checkout for this invoice.");
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
      setIsPaymentOpen(false);
      resetRecordPaymentForm();
      showNotice("Solana payment sent and recorded.");
    } catch (err: unknown) {
      setRecordPaymentError(err instanceof Error ? err.message : "Solana payment failed.");
    } finally {
      setSolanaStatus("idle");
    }
  };

  useAsyncAction(
    async () => {
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
    },
    [selectedInvoice, solanaConfigured],
  );

  const canManageBilling = canManageFinance(membership?.role) || isPlatformAdmin;

  const paymentRails = (
    <PaymentRails
      address={cryptoAddress}
      walletName={cryptoWalletName}
      connected={cryptoConnected}
      solana={solanaBalances}
      pesepayBalance={pesepayBalance}
      pesepayLoading={pesepayBalanceLoading}
      pesepayError={pesepayBalanceError}
      onManageWallets={scrollToWalletMethods}
      onOpenBalance={openPesepaySettings}
      onRetryPesepay={() => void fetchPesepayBalance()}
    />
  );

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

  if (isPaymentOpen) {
    const railsMode = paymentMode === "rails";
    const cryptoReady = Boolean(cryptoAddress);
    const currencySupported = invoiceCurrency === "USD";

    return (
      <PageForm
        title={railsMode ? "Make a payment" : "Record an offline payment"}
        description={
          railsMode
            ? "Pay an invoice from a Solana wallet or your PesePay balance."
            : "Add a cash, bank, or card payment to the ledger."
        }
        onBack={() => setIsPaymentOpen(false)}
        footer={
          railsMode ? undefined : (
            <>
              <Button
                variant="outline"
                onClick={() => setIsPaymentOpen(false)}
                disabled={recordingPayment}
              >
                Cancel
              </Button>
              <Button onClick={submitRecordPayment} disabled={recordingPayment}>
                {recordingPayment && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {recordingPayment ? "Saving..." : "Save payment"}
              </Button>
            </>
          )
        }
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-6">
              {/* ── Invoice ─────────────────────────────────── */}
              <Card className="gap-4 border-border">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Banknote className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="text-base">Invoice</CardTitle>
                      <CardDescription>
                        {railsMode
                          ? "Choose the invoice to settle. The rail you pick sends the full total."
                          : "Choose the invoice this payment belongs to."}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ComboboxField
                    label="Invoice"
                    value={paymentInvoiceId}
                    onChange={(val) => setPaymentInvoiceId(val)}
                    options={payableInvoices.map((inv) => ({
                      value: inv.id,
                      label: `${inv.invoice_number} - ${formatCurrency(inv.total)}`,
                    }))}
                    placeholder="Select invoice"
                    emptyText="No open invoices found."
                    optional
                    optionalLabel="Select invoice"
                  />

                  {selectedInvoice ? (
                    <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border bg-muted/50 p-4">
                      <div className="min-w-0">
                        <p className="payment-ticket-name font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {selectedInvoice.invoice_number}
                        </p>
                        <span className="mt-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {selectedInvoice.status}
                        </span>
                      </div>
                      <p className="flex items-baseline gap-2 font-mono text-2xl font-semibold tabular-nums">
                        {formatCurrency(selectedInvoice.total)}
                        <span className="text-xs font-medium text-muted-foreground">
                          {selectedInvoice.currency_code}
                        </span>
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {recordPaymentError ? (
                <ErrorNotice tone="danger">{recordPaymentError}</ErrorNotice>
              ) : null}

              {railsMode ? (
                <>
                  {/* ── Payment rail ─────────────────────────── */}
                  <Card className="gap-4 border-border">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Wallet className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <CardTitle className="text-base">Payment rail</CardTitle>
                          <CardDescription>
                            Wallets settle in USDC; the PesePay balance settles in USD.
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div
                        className="grid gap-3 sm:grid-cols-2"
                        role="group"
                        aria-label="Payment rail"
                      >
                        <button
                          type="button"
                          aria-pressed={paymentSource === "crypto"}
                          onClick={() => setPaymentSource("crypto")}
                          className={cn(
                            "flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors",
                            paymentSource === "crypto"
                              ? "border-primary bg-primary/5"
                              : "border-border bg-card hover:border-primary/40",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                              <SolanaLogo size={20} />
                            </span>
                            <span className="truncate text-sm font-semibold">
                              Crypto wallet
                            </span>
                            <span
                              className={cn(
                                "ml-auto flex size-4 shrink-0 items-center justify-center rounded-full border",
                                paymentSource === "crypto"
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border text-transparent",
                              )}
                              aria-hidden="true"
                            >
                              <Check className="h-3 w-3" />
                            </span>
                          </span>
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {cryptoAddress
                              ? `${cryptoWalletName ?? "Connected wallet"} · ${shorten(cryptoAddress, 4, 4)}${
                                  cryptoConnected ? "" : " · saved"
                                }`
                              : "No wallet connected"}
                          </span>
                          <span className="flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums text-muted-foreground">
                            <SolanaLogo size={12} />
                            {solanaBalances.usdc === null
                              ? solanaBalances.loading
                                ? "…"
                                : "— USDC"
                              : `${formatAmount(solanaBalances.usdc, 2)} USDC`}
                          </span>
                        </button>

                        <button
                          type="button"
                          aria-pressed={paymentSource === "pesepay"}
                          onClick={() => setPaymentSource("pesepay")}
                          className={cn(
                            "flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors",
                            paymentSource === "pesepay"
                              ? "border-primary bg-primary/5"
                              : "border-border bg-card hover:border-primary/40",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                              <PesepayLogo size={20} />
                            </span>
                            <span className="truncate text-sm font-semibold">
                              PesePay balance
                            </span>
                            <span
                              className={cn(
                                "ml-auto flex size-4 shrink-0 items-center justify-center rounded-full border",
                                paymentSource === "pesepay"
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border text-transparent",
                              )}
                              aria-hidden="true"
                            >
                              <Check className="h-3 w-3" />
                            </span>
                          </span>
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {pesepayBalanceLoading
                              ? "Loading balance…"
                              : "Prepaid USD · invoices and storage"}
                          </span>
                          <span className="flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums text-muted-foreground">
                            <PesepayLogo size={12} />
                            {pesepayBalanceLoading ? "—" : formatCurrency(pesepayBalanceValue)}
                          </span>
                        </button>
                      </div>

                      {paymentSource === "crypto" ? (
                        <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/40 p-4">
                          {cryptoReady ? (
                            <>
                              <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
                                <span>Pay from</span>
                                <strong className="min-w-0 truncate font-mono text-xs font-semibold text-foreground">
                                  {cryptoWalletName ?? "Connected wallet"} · {shorten(cryptoAddress ?? "", 4, 4)}
                                </strong>
                              </div>
                              <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
                                <span>USDC available</span>
                                <span className="flex items-center gap-1 font-mono text-xs font-semibold tabular-nums text-foreground">
                                  <SolanaLogo size={10} />
                                  {formatAmount(solanaBalances.usdc, 2)} USDC
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
                                <span>Network fee</span>
                                <span className="font-mono text-xs font-semibold text-foreground">
                                  {solanaFeeEstimate ?? "—"}
                                </span>
                              </div>
                              {cryptoConnected ? (
                                <Button
                                  type="button"
                                  className="w-full gap-2"
                                  onClick={payWithSolana}
                                  disabled={
                                    solanaBusy ||
                                    recordingPayment ||
                                    !selectedInvoice ||
                                    !currencySupported
                                  }
                                  aria-busy={solanaBusy}
                                >
                                  {solanaBusy ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <SolanaLogo size={16} />
                                  )}
                                  {solanaButtonLabel}
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full gap-2"
                                  onClick={manageWalletsFromComposer}
                                >
                                  <Wallet className="h-4 w-4" />
                                  Connect {cryptoWalletName ?? "this wallet"} to pay
                                </Button>
                              )}
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                {!selectedInvoice
                                  ? "Select an invoice to pay with a wallet."
                                  : !currencySupported
                                    ? "Crypto wallets settle USD invoices in USDC. Use PesePay checkout for this currency."
                                    : !cryptoConnected
                                      ? `${cryptoWalletName ?? "This wallet"} is saved for payments but isn't connected in this session. Connect it to sign the USDC transfer — your invoice stays selected.`
                                      : `Sends ${formatCurrency(selectedInvoice.total)} in USDC on Solana ${clusterLabel} to the workspace treasury.${
                                          solanaFeeEstimate && solanaFeeEstimate !== "…"
                                            ? ` Estimated network cost: ${solanaFeeEstimate}.`
                                            : ""
                                        }`}
                              </p>
                            </>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-xs text-muted-foreground">
                                Connect a Solana wallet to pay with USDC.
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                className="gap-2"
                                onClick={manageWalletsFromComposer}
                              >
                                <Wallet className="h-4 w-4" />
                                Manage wallets
                              </Button>
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                Connect in the Payment rails section, then come back — your
                                invoice stays selected.
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/40 p-4">
                          <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
                            <span>PesePay balance</span>
                            <span className="flex items-center gap-1 font-mono text-xs font-semibold text-foreground">
                              <PesepayLogo size={10} />
                              {pesepayBalanceLoading ? "Loading…" : formatCurrency(pesepayBalanceValue)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
                            <span>Invoice amount</span>
                            <span className="font-mono text-xs font-semibold text-foreground">
                              {selectedInvoice
                                ? `${formatCurrency(selectedInvoice.total)} ${selectedInvoice.currency_code}`
                                : "—"}
                            </span>
                          </div>
                          <Button
                            type="button"
                            className="w-full gap-2"
                            onClick={payFromPesepayBalance}
                            disabled={
                              balancePaymentBusy ||
                              pesepayBusy ||
                              solanaBusy ||
                              recordingPayment ||
                              !selectedInvoice ||
                              !currencySupported ||
                              !balanceCoversInvoice
                            }
                            aria-busy={balancePaymentBusy}
                          >
                            {balancePaymentBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <PesepayLogo size={16} />
                            )}
                            {balancePaymentBusy ? "Paying…" : "Pay from PesePay balance"}
                          </Button>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {!selectedInvoice
                              ? "Select a USD invoice to pay from your balance."
                              : !currencySupported
                                ? "The PesePay balance settles USD invoices only. Use checkout for this invoice."
                                : balanceCoversInvoice
                                  ? `Uses ${formatCurrency(invoiceAmount)} from your prepaid balance. Deposits cannot be refunded or withdrawn.`
                                  : `Your balance covers ${formatCurrency(pesepayBalanceValue)} of ${formatCurrency(invoiceAmount)}. Add funds to pay this invoice.`}
                          </p>
                          {selectedInvoice &&
                          currencySupported &&
                          !balanceCoversInvoice &&
                          !pesepayBalanceLoading ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2 self-start"
                              onClick={openPesepaySettings}
                            >
                              <Plus className="h-4 w-4" />
                              Add funds
                            </Button>
                          ) : null}

                          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <span className="h-px flex-1 bg-border" aria-hidden="true" />
                            or pay another way
                            <span className="h-px flex-1 bg-border" aria-hidden="true" />
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
                            {pesepayBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <PesepayLogo size={20} />
                            )}
                            {pesepayBusy ? "Opening PesePay…" : "Pay with PesePay checkout"}
                          </Button>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            EcoCash, InnBucks, cards, and Zimswitch open in a secure PesePay
                            checkout.
                          </p>
                          {pesepayReference ? (
                            <p className="font-mono text-xs text-muted-foreground">
                              Reference: {pesepayReference}
                            </p>
                          ) : null}
                          {pesepayBalanceError ? (
                            <div className="flex items-center justify-between gap-3 text-xs text-destructive">
                              <span>{pesepayBalanceError}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void fetchPesepayBalance()}
                              >
                                Retry
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {canManageBilling ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Received cash or a bank transfer?{" "}
                      <button
                        type="button"
                        onClick={openOfflineRecording}
                        className="font-semibold text-foreground underline underline-offset-4 hover:text-primary"
                      >
                        Record an offline payment
                      </button>
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  {/* ── Offline payment ──────────────────────── */}
                  <Card className="gap-4 border-border">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Banknote className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <CardTitle className="text-base">Offline payment</CardTitle>
                          <CardDescription>
                            Cash, bank transfer, or a card taken outside SiteSurveyor.
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => setPaymentMode("rails")}
                      className="font-semibold text-foreground underline underline-offset-4 hover:text-primary"
                    >
                      Pay an invoice with a wallet or balance instead
                    </button>
                  </p>
                </>
              )}
            </div>

            <aside className="h-fit space-y-6 lg:sticky lg:top-0">
              <Card className="gap-4 border-border">
                <CardHeader className="space-y-0 pb-2">
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
                      <dd className="font-mono font-semibold tabular-nums">
                        {railsMode
                          ? selectedInvoice
                            ? formatCurrency(selectedInvoice.total)
                            : "—"
                          : formatCurrency(Number(paymentAmount || 0))}
                      </dd>
                    </div>
                    {railsMode ? (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">Rail</dt>
                        <dd className="truncate font-medium">
                          {paymentSource === "crypto" ? "Crypto wallet" : "PesePay balance"}
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Date</dt>
                      <dd className="truncate font-medium">{paymentDate || "—"}</dd>
                    </div>
                    {selectedInvoice ? (
                      <div className="border-t pt-3">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Invoice total
                        </p>
                        <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
                          {formatCurrency(selectedInvoice.total)}{" "}
                          <span className="text-xs font-medium text-muted-foreground">
                            {selectedInvoice.currency_code}
                          </span>
                        </p>
                      </div>
                    ) : null}
                  </dl>
                  {railsMode ? (
                    <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                      Crypto payments settle wallet to wallet. PesePay checkout returns to
                      Treasury once the network confirms.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </PageForm>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────── */}
      <DashboardHeader
        title="Billing"
        subtitle="AI credits, workspace storage and invoice payments, with the ledger behind all of them."
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 font-medium text-foreground">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {activeSectionMeta.label}
            </span>
            <span>{activeSectionMeta.description}</span>
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadStatementCsv}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            {canManageBilling && (
              <Button
                size="sm"
                onClick={openPaymentComposer}
                disabled={invoicesLoading || payableInvoices.length === 0}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Make a payment
              </Button>
            )}
          </>
        }
      />

      {/* ── Sections ─────────────────────────────────────── */}
      <nav className="flex flex-wrap items-center gap-2" aria-label="Billing sections">
        {visibleSections.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={activeSection === item.id ? "default" : "outline"}
            aria-current={activeSection === item.id ? "true" : undefined}
            onClick={() => goSection(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </nav>

      {purchaseMessage ? (
        <ErrorNotice
          layout="banner"
          tone={purchaseTone(purchaseMessage.tone)}
          role="status"
          action={
            <Button variant="outline" size="sm" onClick={() => setPurchaseMessage(null)}>
              Dismiss
            </Button>
          }
        >
          {purchaseMessage.text}
        </ErrorNotice>
      ) : null}

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-foreground"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          {notice}
        </div>
      )}

      {activeSection === "overview" ? (
        <>
          <BillingOverviewSection
            workspaceId={workspaceId}
            refreshKey={purchaseRefresh}
            onSection={goSection}
          />

          {paymentRails}
        </>
      ) : null}

      {activeSection === "credits" ? (
        <AiCreditsSection
          workspaceId={workspaceId}
          walletBalance={pesepayBalanceValue}
          refreshKey={purchaseRefresh}
          onMessage={setPurchaseMessage}
          isPlatformAdmin={isPlatformAdmin}
        />
      ) : null}

      {activeSection === "storage" ? (
        <StorageSection
          workspaceId={workspaceId}
          walletBalance={pesepayBalanceValue}
          refreshKey={purchaseRefresh}
          onMessage={setPurchaseMessage}
        />
      ) : null}

      {activeSection === "insights" ? (
        <FinancialInsightsSection
          workspaceId={workspaceId}
          isPlatformAdmin={isPlatformAdmin}
          refreshKey={purchaseRefresh}
        />
      ) : null}

      {activeSection === "overview" ? (
        <MetricsTiles
          collected={history.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)}
          outstanding={invoices.reduce(
            (sum, invoice) => sum + (invoice.status === "paid" ? 0 : Number(invoice.total || 0)),
            0,
          )}
          invoiceCount={invoices.length}
        />
      ) : null}

      {activeSection === "methods" ? (
        <>
        {paymentRails}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.62fr)_minmax(300px,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <WalletMethodsCard
            workspaceId={workspaceId}
            paymentMethods={paymentMethods}
            canManageBilling={canManageBilling}
            onMethodsChanged={fetchMethods}
            onNotice={showNotice}
          />

          {/* ── Saved methods ───────────────────────────── */}
          <Card className="gap-0 border-border" aria-labelledby="saved-methods-title">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Saved methods
                </p>
                <h2 id="saved-methods-title" className="mt-1 text-base font-semibold">
                  Receiving accounts
                </h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={scrollToWalletMethods}
              >
                <Plus className="h-4 w-4" />
                {canManageBilling ? "Add wallet method" : "Connect a wallet"}
              </Button>
            </CardHeader>

            <CardContent>
              {methodsLoading ? (
                <div className="space-y-2" aria-busy="true">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : paymentMethods.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Wallet className="h-5 w-5" />
                    </EmptyMedia>
                    <EmptyTitle>No saved methods yet</EmptyTitle>
                  </EmptyHeader>
                  <EmptyContent>
                    <p className="max-w-[46ch] text-sm text-muted-foreground">
                      Connect a wallet above to save its address for invoices and
                      marketplace payouts.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={scrollToWalletMethods}
                    >
                      <Wallet className="h-4 w-4" />
                      Choose a wallet
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
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
                        className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
                        data-default={method.is_default || undefined}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-xs font-semibold text-foreground">
                          {methodIcon(method)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            {method.label}
                            {method.is_default && (
                              <Badge variant="success">Default</Badge>
                            )}
                          </span>
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {isCrypto ? `${meta} · ${detail}` : `${detail} · ${meta}`}
                          </span>
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-2">
                          {canManageBilling && !method.is_default && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void setDefaultMethod(method.id)}
                            >
                              Set default
                            </Button>
                          )}
                          {canManageBilling && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground"
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
            </CardContent>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <MarketplaceWalletCard
            workspaceId={workspaceId}
            connectedAddress={phantomWallet.address}
            connectedWalletName={connectedWalletName}
            cryptoMethods={paymentMethods.filter(
              (method) => method.type === "Crypto Wallet" && method.detail,
            )}
            canManage={canManageBilling}
            onAddWallet={scrollToWalletMethods}
            onNotice={showNotice}
          />

          {/* ── Settlement ───────────────────────────────── */}
          <Card className="gap-0 border-border" aria-labelledby="settlement-title">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Settlement
                  </p>
                  <h2 id="settlement-title" className="mt-1 text-sm font-semibold">
                    How funds move
                  </h2>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <dl className="flex flex-col divide-y divide-border">
                <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0">
                  <dt className="text-xs text-muted-foreground">Network</dt>
                  <dd className="font-mono text-xs">Solana {clusterLabel}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-xs text-muted-foreground">Token</dt>
                  <dd className="font-mono text-xs">USDC · {shorten(SOLANA_USDC_MINT, 4, 4)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-xs text-muted-foreground">Treasury</dt>
                  <dd className="flex min-w-0 items-center justify-end gap-2 font-mono text-xs">
                    {SOLANA_TREASURY_ADDRESS ? (
                      <>
                        <span className="truncate">
                          {shorten(SOLANA_TREASURY_ADDRESS)}
                        </span>
                        <button
                          type="button"
                          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
                          onClick={() => void copyTreasuryAddress()}
                          aria-label="Copy treasury address"
                        >
                          {copiedTreasury ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                        <a
                          href={explorerAccountUrl(SOLANA_TREASURY_ADDRESS)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="View treasury on Solana Explorer"
                          className="shrink-0 text-muted-foreground hover:text-primary"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </>
                    ) : (
                      <span>Not configured</span>
                    )}
                  </dd>
                </div>
              </dl>

              <p className="flex items-start gap-2 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                SiteSurveyor never holds funds. Payments move wallet to wallet; this
                ledger keeps the record.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
        </>
      ) : null}

      {activeSection === "transactions" ? (
        <>
        <BillingLedgerSection
          workspaceId={workspaceId}
          refreshKey={purchaseRefresh}
          onMessage={setPurchaseMessage}
          onSettled={reloadAfterPurchase}
          isPlatformAdmin={isPlatformAdmin}
        />

      {/* ── Payment history ──────────────────────────────── */}
      <Card className="gap-0 border-border">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Treasury
            </p>
            <h2 className="mt-1 text-base font-semibold">Invoice payment history</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {filteredHistory.length} of {history.length}{" "}
              {history.length === 1 ? "entry" : "entries"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={downloadStatementCsv}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </CardHeader>

        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border bg-muted/50 px-6 py-3">
          <Input
            placeholder="Search transactions..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="max-w-[300px]"
            aria-label="Search transactions"
          />
          <div
            className="inline-flex overflow-hidden rounded-md border border-border"
            role="group"
            aria-label="Sort payments"
          >
            {[
              { value: "date-desc", label: "Newest" },
              { value: "date-asc", label: "Oldest" },
              { value: "amount-desc", label: "Highest amount" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "border-l border-border px-3 py-1.5 text-xs font-medium first:border-l-0",
                  historySort === option.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={historySort === option.value}
                onClick={() => setHistorySort(option.value as typeof historySort)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <CardContent className="pt-4">
          <TransactionTable
            rows={filteredHistory}
            loading={historyLoading}
            error={historyError}
          />
        </CardContent>
      </Card>
        </>
      ) : null}
    </div>
  );
}
