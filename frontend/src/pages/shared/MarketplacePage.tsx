import { useState, useCallback } from "react";
import {
  Package,
  Search,
  Plus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShoppingCart,
  Clock,
  Activity,
  Ban,
  Inbox,
  Send,
  DollarSign,
  MapPin,
  ClipboardList,
} from "lucide-react";
import { DashboardHeader, DashboardShell } from "../../components/dashboard/DashboardShell.tsx";
import { DashboardCard } from "../../components/dashboard/DashboardCard.tsx";
import { KpiCard } from "../../components/dashboard/KpiCard.tsx";
import {
  createMarketplaceListing,
  deleteMarketplaceListing,
  listMarketplaceListings,
  updateMarketplaceListing,
  type MarketplaceListingRow,
  type MarketplaceListingWithAsset,
} from "../../lib/repositories/marketplace.ts";
import {
  listAllMarketplaceListings,
} from "../../lib/repositories/adminPlatform.ts";
import {
  createMarketplaceRequest,
  hasActiveRequest,
  listMyRequestsWithListings,
  listSellerRequestsWithListings,
  updateRequestStatus,
  type RequestWithListing,
  type RequestWithListingAndWorkspace,
} from "../../lib/repositories/marketplaceRequests.ts";
import {
  createMarketplaceOrder,
} from "../../lib/repositories/marketplaceOrders.ts";
import { notifyMarketplaceRequest } from "../../lib/repositories/notificationEvents.ts";
import {
  getMarketplaceWallet,
  getWorkspaceById,
} from "../../lib/repositories/workspaces.ts";
import { useEmbeddedWallet } from "../../features/solana/hooks/useEmbeddedWallet.ts";
import { SOLANA_CLUSTER } from "../../features/solana/lib/config.ts";
import { PublicKey } from "@solana/web3.js";
import SelectDropdown from "../../components/SelectDropdown.tsx";
import PageLoader from "../../components/PageLoader.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Card, CardContent } from "../../components/ui/card.tsx";
import { DialogTemplate } from "../../components/templates/DialogTemplate.tsx";
import { PageForm } from "../../components/templates/PageForm.tsx";
import { Alert, AlertDescription } from "../../components/ui/alert.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { cn } from "../../lib/utils.ts";
import "../../styles/pages.css";

/* ── SVG Icon Components ── */
function IconTotalStation() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21v-3" />
      <path d="M8 21l2-3" />
      <path d="M16 21l-2-3" />
      <path d="M9 18h6" />
      <rect x="10" y="15" width="4" height="3" rx="0.5" />
      <path d="M10 15v-6a2 2 0 0 1 4 0v6" />
      <rect x="7" y="6" width="10" height="4" rx="1" />
      <path d="M17 7v2" />
      <path d="M7 7v2" />
      <path d="M5 7.5h2v1H5z" />
      <path d="M10 6V4h4v2" />
    </svg>
  );
}

function IconGnss() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21V9" />
      <path d="M10 21h4" />
      <path d="M8 9h8a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2z" />
      <path d="M9 4c1-2 5-2 6 0" />
      <path d="M8 6L7 2" />
      <rect x="13" y="12" width="3" height="5" rx="0.5" />
    </svg>
  );
}

function IconLevel() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21v-3" />
      <path d="M8 21l2-3" />
      <path d="M16 21l-2-3" />
      <path d="M9 18h6" />
      <rect x="6" y="10" width="12" height="8" rx="1" />
      <path d="M18 11v6" />
      <path d="M6 12v4" />
      <path d="M4 12.5h2v3H4z" />
      <rect x="9" y="12" width="4" height="4" rx="0.5" />
      <path d="M11 10V9h2v1" />
    </svg>
  );
}

function IconDrone() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="6" height="6" rx="2" />
      <path d="M11 15v2h2v-2" />
      <circle cx="12" cy="18" r="1" />
      <line x1="9" y1="9" x2="5" y2="5" />
      <line x1="15" y1="9" x2="19" y2="5" />
      <line x1="9" y1="15" x2="5" y2="19" />
      <line x1="15" y1="15" x2="19" y2="19" />
      <ellipse cx="5" cy="5" rx="3" ry="1" />
      <ellipse cx="19" cy="5" rx="3" ry="1" />
      <ellipse cx="5" cy="19" rx="3" ry="1" />
      <ellipse cx="19" cy="19" rx="3" ry="1" />
    </svg>
  );
}

function IconController() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <rect x="6" y="5" width="12" height="10" rx="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
      <circle cx="12" cy="17" r="0.5" />
      <circle cx="12" cy="19" r="0.5" />
      <circle cx="11" cy="18" r="0.5" />
      <circle cx="13" cy="18" r="0.5" />
    </svg>
  );
}

function IconCalibration() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <circle cx="12" cy="12" r="2" />
      <path d="M15 15l5 5a2 2 0 0 1-3 3l-5-5" />
      <path d="M16 14l2 2" />
    </svg>
  );
}

const iconMap: Record<string, React.FC> = {
  "Total Station": IconTotalStation,
  "GNSS Receiver": IconGnss,
  "Digital Level": IconLevel,
  "UAV / Drone": IconDrone,
  Controller: IconController,
  "Calibration Service": IconCalibration,
};

function ListingIcon({ type }: { type: string }) {
  const Ico = iconMap[type] || IconTotalStation;
  return <Ico />;
}

const conditionVariant: Record<string, string> = {
  New: "default",
  "Like New": "secondary",
  Good: "warning",
  Fair: "outline",
  Service: "purple",
};

const TYPE_OPTIONS = [
  "Total Station",
  "GNSS Receiver",
  "Digital Level",
  "UAV / Drone",
  "Controller",
  "Calibration Service",
].map((v) => ({ value: v, label: v }));

const CONDITION_OPTIONS = ["New", "Like New", "Good", "Fair", "Service"].map((v) => ({
  value: v,
  label: v,
}));

type FilterType =
  | "all"
  | "Total Station"
  | "GNSS Receiver"
  | "Digital Level"
  | "UAV / Drone"
  | "Controller"
  | "Calibration Service";

interface MarketplacePageProps {
  workspaceId: string;
  isPlatformAdmin?: boolean;
}

export default function MarketplacePage({
  workspaceId,
  isPlatformAdmin = false,
}: MarketplacePageProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [activeTab, setActiveTab] = useState<"browse" | "myRequests" | "incomingRequests">("browse");
  const [selectedListing, setSelectedListing] = useState<MarketplaceListingWithAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [myRequests, setMyRequests] = useState<RequestWithListing[]>([]);
  const [myRequestsLoading, setMyRequestsLoading] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState<RequestWithListingAndWorkspace[]>([]);
  const [incomingRequestsLoading, setIncomingRequestsLoading] = useState(false);

  const [listingState, setListingState] = useState<MarketplaceListingWithAsset[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingListing, setSavingListing] = useState(false);
  const [mName, setMName] = useState("");
  const [mType, setMType] = useState("Total Station");
  const [mCondition, setMCondition] = useState("Good");
  const [mPrice, setMPrice] = useState("");
  const [mCurrency, setMCurrency] = useState("USD");
  const [mSeller, setMSeller] = useState("");
  const [mLocation, setMLocation] = useState("");
  const [mDescription, setMDescription] = useState("");
  const [mSpecs, setMSpecs] = useState("");
  const [mIsGlobal, setMIsGlobal] = useState(false);
  const [workspaceMarketplaceWallet, setWorkspaceMarketplaceWallet] = useState<string | null>(null);

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestStartDate, setRequestStartDate] = useState("");
  const [requestEndDate, setRequestEndDate] = useState("");
  const [requestSending, setRequestSending] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [alreadyRequested, setAlreadyRequested] = useState(false);

  const [showPayment, setShowPayment] = useState(false);
  const [paymentToken, setPaymentToken] = useState<"SOL" | "USDC">("USDC");
  const [paymentPin, setPaymentPin] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<{ signature: string; orderId: string } | null>(null);

  const embeddedWallet = useEmbeddedWallet();

  const fetchListings = useCallback(async () => {
    try {
      setFetchError(null);
      const data = isPlatformAdmin
        ? await listAllMarketplaceListings()
        : await listMarketplaceListings(workspaceId);
      setListingState(data);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin, workspaceId]);

  useAsyncAction(fetchListings, [fetchListings]);

  const fetchWorkspaceWallet = useCallback(async () => {
    try {
      const address = await getMarketplaceWallet(workspaceId);
      setWorkspaceMarketplaceWallet(address);
    } catch {
      setWorkspaceMarketplaceWallet(null);
    }
  }, [workspaceId]);

  useAsyncAction(fetchWorkspaceWallet, [fetchWorkspaceWallet]);

  const fetchMyRequests = useCallback(async () => {
    setMyRequestsLoading(true);
    try {
      const data = await listMyRequestsWithListings(workspaceId);
      setMyRequests(data);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Failed to load your requests");
    } finally {
      setMyRequestsLoading(false);
    }
  }, [workspaceId]);

  const fetchIncomingRequests = useCallback(async () => {
    setIncomingRequestsLoading(true);
    try {
      const data = await listSellerRequestsWithListings(workspaceId);
      setIncomingRequests(data);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Failed to load incoming requests");
    } finally {
      setIncomingRequestsLoading(false);
    }
  }, [workspaceId]);

  const handleTabChange = (value: string) => {
    const tab = value as "browse" | "myRequests" | "incomingRequests";
    setActiveTab(tab);
    if (tab === "myRequests") void fetchMyRequests();
    if (tab === "incomingRequests") void fetchIncomingRequests();
  };

  const handleUpdateRequestStatus = async (
    id: string,
    status: "accepted" | "declined" | "cancelled",
  ) => {
    try {
      await updateRequestStatus(id, status);
      void fetchIncomingRequests();
      void fetchMyRequests();
      setNotice(status === "accepted" ? "Request accepted." : "Request declined.");
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Failed to update request");
    }
  };

  const filtered = listingState.filter((l) => {
    if (typeFilter !== "all" && l.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return [l.name, l.type, l.seller, l.location, l.description]
        .join(" ")
        .toLowerCase()
        .includes(q);
    }
    return true;
  });
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const paginated = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

  const clearMarketplaceFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setPage(1);
  };

  const openListingDetail = useCallback(async (listing: MarketplaceListingWithAsset) => {
    setSelectedListing(listing);
    setShowRequestForm(false);
    setRequestSent(false);
    setRequestMessage("");
    setRequestStartDate("");
    setRequestEndDate("");
    setShowPayment(false);
    setPaymentToken("USDC");
    setPaymentPin("");
    setPaymentSuccess(null);
    const active = await hasActiveRequest(listing.id);
    setAlreadyRequested(active);
  }, []);

  const handleSubmitRequest = useCallback(async () => {
    if (!selectedListing) return;
    setRequestSending(true);
    try {
      await createMarketplaceRequest({
        listingId: selectedListing.id,
        requesterWorkspaceId: workspaceId,
        message: requestMessage.trim() || null,
        desiredStartDate: requestStartDate || null,
        desiredEndDate: requestEndDate || null,
      });
      setRequestSent(true);
      setShowRequestForm(false);
      setAlreadyRequested(true);
      const ws = await getWorkspaceById(workspaceId).catch(() => null);
      void notifyMarketplaceRequest({
        sellerWorkspaceId: selectedListing.workspace_id,
        listingName: selectedListing.name,
        requesterName: ws?.name ?? null,
        listingType: selectedListing.listing_type ?? undefined,
      });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setRequestSending(false);
    }
  }, [selectedListing, workspaceId, requestMessage, requestStartDate, requestEndDate]);

  const isValidSolanaAddress = useCallback((value: string) => {
    if (!value.trim()) return false;
    try {
      new PublicKey(value.trim());
      return true;
    } catch {
      return false;
    }
  }, []);

  const handlePayWithSolana = useCallback(async () => {
    if (!selectedListing) return;
    if (!selectedListing.seller_wallet_address) {
      setNotice("This listing does not have a Solana payment address.");
      return;
    }
    if (!isValidSolanaAddress(selectedListing.seller_wallet_address)) {
      setNotice("The seller wallet address on this listing is invalid.");
      return;
    }
    setPaymentBusy(true);
    setNotice(null);
    try {
      if (!embeddedWallet.unlocked) {
        await embeddedWallet.unlockWallet(paymentPin);
      }
      const signature = await embeddedWallet.sendTokens({
        token: paymentToken,
        recipient: selectedListing.seller_wallet_address,
        amount: selectedListing.price,
      });
      const order = await createMarketplaceOrder({
        listing_id: selectedListing.id,
        listing_workspace_id: selectedListing.workspace_id,
        buyer_workspace_id: workspaceId,
        amount: selectedListing.price,
        currency: paymentToken,
        provider: "solana",
        external_payment_ref: signature,
        payment_status: "completed",
        platform_fee_amount: 0,
        metadata: {
          listing_type: selectedListing.listing_type,
          token: paymentToken,
          seller_wallet_address: selectedListing.seller_wallet_address,
        },
      });
      setPaymentSuccess({ signature, orderId: order.id });
      setShowPayment(false);
      void embeddedWallet.refreshBalances();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Payment failed. Please try again.");
    } finally {
      setPaymentBusy(false);
    }
  }, [selectedListing, workspaceId, paymentToken, paymentPin, embeddedWallet, isValidSolanaAddress]);

  const openCreateListing = () => {
    setEditingId(null);
    setMName("");
    setMType("Total Station");
    setMCondition("Good");
    setMPrice("");
    setMCurrency("USD");
    setMSeller("");
    setMLocation("");
    setMDescription("");
    setMSpecs("");
    setMIsGlobal(false);
    setEditorOpen(true);
  };

  const openEditListing = (row: MarketplaceListingRow) => {
    setEditingId(row.id);
    setMName(row.name);
    setMType(row.type);
    setMCondition(row.condition);
    setMPrice(String(row.price));
    setMCurrency(row.currency);
    setMSeller(row.seller);
    setMLocation(row.location);
    setMDescription(row.description ?? "");
    setMSpecs((row.specs ?? []).join(", "));
    setMIsGlobal(row.is_global ?? false);
    setEditorOpen(true);
    setSelectedListing(null);
  };

  const saveListing = async () => {
    const existing = editingId
      ? listingState.find((l) => l.id === editingId)
      : null;
    const isOwner = existing?.workspace_id === workspaceId;
    const canManage = isPlatformAdmin || isOwner;
    if (!canManage) {
      setFetchError("Only the listing owner or a platform administrator can edit this listing.");
      return;
    }
    if (!mName.trim() || !mSeller.trim() || !mLocation.trim()) {
      setFetchError("Name, seller, and location are required.");
      return;
    }
    const priceNum = Number(mPrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setFetchError("Enter a valid price.");
      return;
    }
    const specsArr = mSpecs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setSavingListing(true);
    setFetchError(null);
    try {
      const payload = {
        name: mName.trim(),
        type: mType,
        condition: mCondition,
        price: priceNum,
        currency: mCurrency.trim() || "USD",
        seller: mSeller.trim(),
        seller_wallet_address: workspaceMarketplaceWallet ?? null,
        location: mLocation.trim(),
        description: mDescription.trim() || null,
        specs: specsArr.length ? specsArr : null,
        is_global: isPlatformAdmin ? mIsGlobal : false,
      };
      if (editingId) {
        await updateMarketplaceListing(editingId, payload);
      } else {
        await createMarketplaceListing(workspaceId, payload);
      }
      setEditorOpen(false);
      await fetchListings();
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to save listing.");
    } finally {
      setSavingListing(false);
    }
  };

  const removeListing = async (id: string) => {
    const row = listingState.find((l) => l.id === id);
    const isOwner = row?.workspace_id === workspaceId;
    const canManage = isPlatformAdmin || isOwner;
    if (!canManage) {
      setFetchError("Only the listing owner or a platform administrator can delete this listing.");
      return;
    }
    if (!window.confirm("Delete this listing permanently?")) return;
    setFetchError(null);
    try {
      await deleteMarketplaceListing(id);
      setSelectedListing(null);
      await fetchListings();
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to delete.");
    }
  };

  const filterTabs: { label: string; value: FilterType }[] = [
    { label: "All", value: "all" },
    { label: "Total Stations", value: "Total Station" },
    { label: "GNSS", value: "GNSS Receiver" },
    { label: "Levels", value: "Digital Level" },
    { label: "Drones", value: "UAV / Drone" },
    { label: "Controllers", value: "Controller" },
    { label: "Calibration", value: "Calibration Service" },
  ];

  const totalListings = listingState.length;
  const saleListings = listingState.filter((l) => l.listing_type !== "hire").length;
  const hireListings = listingState.filter((l) => l.listing_type === "hire").length;
  const inUseListings = listingState.filter((l) => l.assets?.status === "deployed").length;

  if (editorOpen) {
    return (
      <PageForm
        title={editingId ? "Edit listing" : "List an instrument"}
        description="Listing assets for hire is free for your workspace."
        onBack={() => setEditorOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={savingListing}>
              Cancel
            </Button>
            <Button onClick={saveListing} disabled={savingListing}>
              {savingListing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                </>
              ) : editingId ? (
                "Save changes"
              ) : (
                "Publish listing"
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* ── Listing Details ──────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ClipboardList size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Listing Details</h3>
                <p className="text-[11px] text-muted-foreground">Basic information about the instrument.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-4">
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  placeholder="e.g. Leica TS16"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <SelectDropdown options={TYPE_OPTIONS} value={mType} onChange={setMType} />
                </div>
                <div className="space-y-1.5">
                  <Label>Specs (comma separated)</Label>
                  <Input
                    value={mSpecs}
                    onChange={(e) => setMSpecs(e.target.value)}
                    placeholder="e.g. 2'' accuracy, 1000m range"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    value={mDescription}
                    onChange={(e) => setMDescription(e.target.value)}
                    placeholder="Optional details about the asset's history or inclusions."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Pricing & Condition ──────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
                <DollarSign size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Pricing & Condition</h3>
                <p className="text-[11px] text-muted-foreground">Set your price and describe the asset condition.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Condition</Label>
                  <SelectDropdown options={CONDITION_OPTIONS} value={mCondition} onChange={setMCondition} />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Input
                    value={mCurrency}
                    onChange={(e) => setMCurrency(e.target.value)}
                    placeholder="USD"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Price <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    min="0"
                    value={mPrice}
                    onChange={(e) => setMPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Location & Seller ────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600">
                <MapPin size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Location & Seller</h3>
                <p className="text-[11px] text-muted-foreground">Where it is and who is selling it.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Location <span className="text-destructive">*</span></Label>
                  <Input
                    value={mLocation}
                    onChange={(e) => setMLocation(e.target.value)}
                    placeholder="e.g. City, country"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Seller / Provider <span className="text-destructive">*</span></Label>
                  <Input
                    value={mSeller}
                    onChange={(e) => setMSeller(e.target.value)}
                    placeholder="Your firm or name"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Receiving Wallet</Label>
                  {workspaceMarketplaceWallet ? (
                    <div className="rounded-md border border-border/40 bg-muted/30 px-3 py-2">
                      <p className="break-all text-xs font-mono text-muted-foreground">
                        {workspaceMarketplaceWallet}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs text-amber-700">
                        No marketplace wallet selected. Buyers will see "Seller has no wallet." Set one in Billing.
                      </p>
                    </div>
                  )}
                </div>
                {isPlatformAdmin && (
                  <div className="sm:col-span-2 mt-2 flex items-center gap-3 rounded-md border p-3 bg-background">
                    <Switch
                      id="listing-global"
                      checked={mIsGlobal}
                      onCheckedChange={setMIsGlobal}
                    />
                    <Label htmlFor="listing-global" className="cursor-pointer">
                      Publish globally (visible to all workspaces)
                    </Label>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </PageForm>
    );
  }

  return (
    <DashboardShell>
      {fetchError && (
        <Alert variant="destructive">
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert variant="success">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <DashboardHeader
        title="Marketplace"
        description="Browse available survey instruments and calibration services"
        actions={
          isPlatformAdmin ? (
            <Button onClick={openCreateListing}>
              <Plus className="mr-2 h-4 w-4" /> List a global instrument
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <PageLoader />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Total Listings"
              value={String(totalListings)}
              subtext="Instruments & services"
              icon={<Package className="size-4" />}
            />
            <KpiCard
              title="For Sale"
              value={String(saleListings)}
              subtext="Available to purchase"
              icon={<ShoppingCart className="size-4" />}
            />
            <KpiCard
              title="For Hire"
              value={String(hireListings)}
              subtext="Rent per day"
              icon={<Clock className="size-4" />}
            />
            <KpiCard
              title="In Use"
              value={String(inUseListings)}
              subtext="Currently deployed"
              icon={<Activity className="size-4" />}
            />
          </div>

          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="space-y-4"
          >
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="browse">
                <Package className="mr-2 h-4 w-4" /> Browse
              </TabsTrigger>
              <TabsTrigger value="myRequests">
                <Send className="mr-2 h-4 w-4" /> My Requests
              </TabsTrigger>
              <TabsTrigger value="incomingRequests">
                <Inbox className="mr-2 h-4 w-4" /> Incoming Requests
              </TabsTrigger>
            </TabsList>

            <TabsContent value="browse" className="space-y-4">
              <DashboardCard
                title="Available Listings"
                icon={<Package size={16} />}
                titleAction={
              <div className="relative w-full sm:w-[260px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search instruments & services..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            }
          >
            <div className="mb-4">
              <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as FilterType)}>
                <TabsList className="h-auto flex-wrap">
                  {filterTabs.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

          <DialogTemplate
            open={!!selectedListing}
            onOpenChange={() => setSelectedListing(null)}
            title={selectedListing?.name ?? "Listing Details"}
            description={
              selectedListing ? (
                <>
                  {selectedListing.type} ·{" "}
                  <Badge variant={conditionVariant[selectedListing.condition] as never}>
                    {selectedListing.condition}
                  </Badge>
                </>
              ) : null
            }
            size="md"
            footer={
              selectedListing ? (
                <>
                  <Button variant="outline" onClick={() => setSelectedListing(null)} className="w-full sm:w-auto">
                    Close
                  </Button>
                  {!showRequestForm && (
                    (() => {
                      const isOwner = selectedListing.workspace_id === workspaceId;
                      const isDeployed = selectedListing.assets?.status === "deployed";
                      const canManage = isPlatformAdmin || isOwner;
                      return (
                        <div className="flex flex-wrap gap-2">
                          {canManage && (
                            <>
                              <Button
                                variant="outline"
                                onClick={() => openEditListing(selectedListing)}
                                className="w-full sm:w-auto"
                              >
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => removeListing(selectedListing.id)}
                                className="w-full sm:w-auto"
                              >
                                Delete
                              </Button>
                            </>
                          )}
                          {!isOwner && isDeployed && (
                            <Button variant="outline" disabled className="w-full sm:w-auto">
                              Currently In Use
                            </Button>
                          )}
                          {!isOwner && !isDeployed && alreadyRequested && (
                            <>
                              <Button disabled className="w-full sm:w-auto">
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Request Pending
                              </Button>
                              {selectedListing.seller_wallet_address ? (
                                <Button
                                  onClick={() => setShowPayment(true)}
                                  className="w-full sm:w-auto"
                                >
                                  Make Payment
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  disabled
                                  className="w-full sm:w-auto"
                                >
                                  Seller has no wallet
                                </Button>
                              )}
                            </>
                          )}
                          {!isOwner && !isDeployed && !alreadyRequested && (
                            <Button
                              onClick={() => setShowRequestForm(true)}
                              className="w-full sm:w-auto"
                            >
                              {selectedListing.listing_type === "hire"
                                ? "Request Hire"
                                : "Request Purchase"}
                            </Button>
                          )}
                        </div>
                      );
                    })()
                  )}
                </>
              ) : undefined
            }
          >
            {selectedListing && (
              <div className="space-y-4">
                <p className="text-2xl font-semibold text-foreground">
                  ${selectedListing.price.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {selectedListing.currency}{" "}
                    {selectedListing.listing_type === "hire" ? "/ day" : "one-time"}
                  </span>
                </p>

                {selectedListing.description && (
                  <p className="text-sm text-muted-foreground">{selectedListing.description}</p>
                )}
                {selectedListing.specs && selectedListing.specs.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedListing.specs.map((s) => (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}

                <Card>
                  <CardContent className="space-y-2 py-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {selectedListing.condition === "Service" ? "Provider" : "Seller"}
                      </span>
                      <span className="font-medium text-foreground">{selectedListing.seller}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Location</span>
                      <span className="font-medium text-foreground">{selectedListing.location}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Posted</span>
                      <span className="font-medium text-foreground">
                        {new Date(selectedListing.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {showRequestForm && (
                  <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
                    <h4 className="text-sm font-semibold">
                      {selectedListing.listing_type === "hire" ? "Request to Hire" : "Request to Purchase"}
                    </h4>
                    {selectedListing.listing_type === "hire" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Start Date</Label>
                          <Input
                            type="date"
                            value={requestStartDate}
                            onChange={(e) => setRequestStartDate(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">End Date</Label>
                          <Input
                            type="date"
                            value={requestEndDate}
                            onChange={(e) => setRequestEndDate(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                    <Textarea
                      placeholder="Add a message to the seller (optional)..."
                      value={requestMessage}
                      onChange={(e) => setRequestMessage(e.target.value)}
                      rows={3}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowRequestForm(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" disabled={requestSending} onClick={handleSubmitRequest}>
                        {requestSending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
                          </>
                        ) : (
                          "Send Request"
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {requestSent && (
                  <Alert variant="success">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                      Request sent successfully! The seller will be notified.
                    </AlertDescription>
                  </Alert>
                )}

                {showPayment && selectedListing && (
                  <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
                    <h4 className="text-sm font-semibold">Pay with Solana</h4>
                    <div className="space-y-1">
                      <Label className="text-xs">Recipient wallet</Label>
                      <code className="block break-all rounded bg-background px-2 py-1 text-xs text-muted-foreground">
                        {selectedListing.seller_wallet_address}
                      </code>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-medium">
                        {selectedListing.price} {paymentToken}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Token</Label>
                      <SelectDropdown
                        options={[
                          { value: "USDC", label: "USDC" },
                          { value: "SOL", label: "SOL" },
                        ]}
                        value={paymentToken}
                        onChange={(v) => setPaymentToken(v as "SOL" | "USDC")}
                      />
                    </div>

                    {!embeddedWallet.supported ? (
                      <p className="text-sm text-destructive">
                        Embedded Solana wallet is not supported in this environment.
                      </p>
                    ) : !embeddedWallet.exists ? (
                      <p className="text-sm text-destructive">
                        Set up your embedded Solana wallet in Settings before paying.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {embeddedWallet.shortAddress && (
                          <p className="text-xs text-muted-foreground">
                            Paying from <span className="font-mono">{embeddedWallet.shortAddress}</span>
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Balance: {embeddedWallet.balances.sol.toFixed(4)} SOL /{" "}
                          {embeddedWallet.balances.usdc.toFixed(2)} USDC
                        </p>
                        {!embeddedWallet.unlocked && (
                          <div className="space-y-1 pt-1">
                            <Label className="text-xs">Wallet PIN</Label>
                            <Input
                              type="password"
                              value={paymentPin}
                              onChange={(e) => setPaymentPin(e.target.value)}
                              placeholder="Unlock wallet to pay"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPayment(false)}
                        disabled={paymentBusy}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          paymentBusy ||
                          !embeddedWallet.exists ||
                          (!embeddedWallet.unlocked && !paymentPin.trim())
                        }
                        onClick={handlePayWithSolana}
                      >
                        {paymentBusy ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
                          </>
                        ) : (
                          `Pay ${selectedListing.price} ${paymentToken}`
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {paymentSuccess && (
                  <Alert variant="success">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription className="space-y-1">
                      <p>Payment sent and order recorded.</p>
                      <a
                        href={`https://explorer.solana.com/tx/${paymentSuccess.signature}?cluster=${SOLANA_CLUSTER}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary underline"
                      >
                        View transaction on Solana Explorer
                      </a>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </DialogTemplate>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Package className="h-12 w-12 text-muted-foreground/50" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">No listings found</p>
                  <p className="text-sm text-muted-foreground">
                    No listings are currently available in the system for this view.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={clearMarketplaceFilters}>
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paginated.map((l) => (
                  <Card
                    key={l.id}
                    className={cn(
                      "cursor-pointer transition-all hover:border-primary hover:shadow-md",
                      l.assets?.status === "deployed" && "opacity-70",
                    )}
                    onClick={() => openListingDetail(l)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openListingDetail(l);
                      }
                    }}
                  >
                    <CardContent className="flex flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                          <ListingIcon type={l.type} />
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Badge variant={conditionVariant[l.condition] as never}>{l.condition}</Badge>
                          {l.assets?.status === "deployed" && (
                            <Badge variant="secondary">In Use</Badge>
                          )}
                          <Badge variant={l.listing_type === "hire" ? "purple" : "outline"}>
                            {l.listing_type === "hire" ? "Hire" : "Sale"}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{l.name}</h3>
                        <p className="text-sm text-muted-foreground">{l.type}</p>
                      </div>
                      <p className="text-lg font-semibold text-foreground">
                        ${l.price.toLocaleString()}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {l.currency} {l.listing_type === "hire" ? "/ day" : "one-time"}
                        </span>
                      </p>
                      <div className="text-xs text-muted-foreground">
                        <span>{l.seller}</span>
                        <span className="mx-1">·</span>
                        <span>{l.location}</span>
                      </div>
                      <p className="mt-auto text-xs text-muted-foreground">
                        Posted {new Date(l.created_at).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {filtered.length > pageSize && (
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={effectivePage <= 1}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {effectivePage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={effectivePage >= totalPages}
                  >
                    Next <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
              </DashboardCard>
            </TabsContent>

            <TabsContent value="myRequests">
              <DashboardCard title="My Requests" icon={<Send size={16} />}>
                {myRequestsLoading ? (
                  <PageLoader />
                ) : myRequests.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    You have not requested any items yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myRequests.map((req) => (
                      <Card key={req.id} className="overflow-hidden">
                        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <h4 className="font-semibold">
                              {req.marketplace_listings.name}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              {req.marketplace_listings.type} ·{" "}
                              {req.marketplace_listings.listing_type === "hire"
                                ? "Hire"
                                : "Purchase"}{" "}
                              · ${req.marketplace_listings.price.toLocaleString()}
                            </p>
                            {(req.desired_start_date || req.desired_end_date) && (
                              <p className="text-xs text-muted-foreground">
                                {req.desired_start_date && `From ${req.desired_start_date}`}
                                {req.desired_start_date && req.desired_end_date && " · "}
                                {req.desired_end_date && `Until ${req.desired_end_date}`}
                              </p>
                            )}
                            {req.message && (
                              <p className="text-sm text-muted-foreground">{req.message}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-start gap-2 sm:items-end">
                            <Badge
                              variant={
                                req.status === "accepted"
                                  ? "success"
                                  : req.status === "declined" || req.status === "cancelled"
                                    ? "destructive"
                                    : "default"
                              }
                            >
                              {req.status}
                            </Badge>
                            {req.status === "pending" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateRequestStatus(req.id, "cancelled")}
                              >
                                <Ban className="mr-2 h-3 w-3" /> Cancel
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </DashboardCard>
            </TabsContent>

            <TabsContent value="incomingRequests">
              <DashboardCard title="Incoming Requests" icon={<Inbox size={16} />}>
                {incomingRequestsLoading ? (
                  <PageLoader />
                ) : incomingRequests.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No one has requested your listings yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {incomingRequests.map((req) => (
                      <Card key={req.id} className="overflow-hidden">
                        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <h4 className="font-semibold">
                              {req.marketplace_listings.name}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              {req.marketplace_listings.type} ·{" "}
                              {req.marketplace_listings.listing_type === "hire"
                                ? "Hire"
                                : "Purchase"}
                            </p>
                            {req.workspaces?.name && (
                              <p className="text-xs text-muted-foreground">
                                From workspace: {req.workspaces.name}
                              </p>
                            )}
                            {(req.desired_start_date || req.desired_end_date) && (
                              <p className="text-xs text-muted-foreground">
                                {req.desired_start_date && `From ${req.desired_start_date}`}
                                {req.desired_start_date && req.desired_end_date && " · "}
                                {req.desired_end_date && `Until ${req.desired_end_date}`}
                              </p>
                            )}
                            {req.message && (
                              <p className="text-sm text-muted-foreground">{req.message}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-start gap-2 sm:items-end">
                            <Badge
                              variant={
                                req.status === "accepted"
                                  ? "success"
                                  : req.status === "declined" || req.status === "cancelled"
                                    ? "destructive"
                                    : "default"
                              }
                            >
                              {req.status}
                            </Badge>
                            {req.status === "pending" && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleUpdateRequestStatus(req.id, "accepted")}
                                >
                                  <CheckCircle2 className="mr-2 h-3 w-3" /> Accept
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUpdateRequestStatus(req.id, "declined")}
                                >
                                  <Ban className="mr-2 h-3 w-3" /> Decline
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </DashboardCard>
            </TabsContent>
          </Tabs>
        </>
      )}
    </DashboardShell>
  );
}
