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
  LayoutGrid,
  LayoutList,
  Columns2,
} from "lucide-react";
import { DashboardHeader, DashboardShell } from "../../components/dashboard/DashboardShell.tsx";
import { DashboardCard } from "../../components/dashboard/DashboardCard.tsx";
import { KpiCard, KpiGrid } from "../../components/dashboard/KpiCard.tsx";
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
  getMyRequestForListing,
  listMyRequestsWithListings,
  listSellerRequestsWithListings,
  updateRequestStatus,
  type MarketplaceRequestRow,
  type RequestWithListing,
  type RequestWithListingAndWorkspace,
} from "../../lib/repositories/marketplaceRequests.ts";
import { notifyMarketplaceRequest } from "../../lib/repositories/notificationEvents.ts";
import {
  getMarketplaceWallet,
  getWorkspaceById,
} from "../../lib/repositories/workspaces.ts";
import { AddToCartButton } from "../../components/market/AddToCartButton.tsx";
import {
  MarketCartButton,
  MarketCartSheet,
} from "../../components/market/MarketCartSheet.tsx";
import { ListingPaymentPanel } from "../../components/market/ListingPaymentPanel.tsx";
import PageLoader from "../../components/PageLoader.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card.tsx";
import { ComboboxField } from "../../components/templates/ComboboxField.tsx";
import { DialogTemplate } from "../../components/templates/DialogTemplate.tsx";
import { PageForm } from "../../components/templates/PageForm.tsx";
import { Alert, AlertDescription } from "../../components/ui/alert.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { cn } from "../../lib/utils.ts";
import { assetMediaUrl } from "../../lib/repositories/assetMedia.ts";
import { getEquipmentPlaceholder } from "../../components/market/marketPlaceholders.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";

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
  const [layoutMode, setLayoutMode] = useState<"tiles" | "grid" | "list">("grid");

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
  /** The buyer's latest request on the open listing — payment waits on `accepted`. */
  const [listingRequest, setListingRequest] =
    useState<MarketplaceRequestRow | null>(null);

  const [showPayment, setShowPayment] = useState(false);
  /** Which accepted request is showing its payment panel in My Requests. */
  const [payRequestId, setPayRequestId] = useState<string | null>(null);

  const [cartOpen, setCartOpen] = useState(false);
  const authUser = useAuthStore((s) => s.user);

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
    setListingRequest(null);
    const existing = await getMyRequestForListing(listing.id);
    setListingRequest(existing);
  }, []);

  const handleSubmitRequest = useCallback(async () => {
    if (!selectedListing) return;
    setRequestSending(true);
    try {
      const created = await createMarketplaceRequest({
        listingId: selectedListing.id,
        requesterWorkspaceId: workspaceId,
        message: requestMessage.trim() || null,
        desiredStartDate: requestStartDate || null,
        desiredEndDate: requestEndDate || null,
      });
      setRequestSent(true);
      setShowRequestForm(false);
      setListingRequest(created);
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

  /** A row becomes a basket entry; own listings and deployed assets never do. */
  const cartListingOf = (l: MarketplaceListingWithAsset) => ({
    id: l.id,
    name: l.name,
    price: l.price,
    currency: l.currency,
    listingType: l.listing_type,
    seller: l.seller,
    location: l.location,
    sellerWorkspaceId: l.workspace_id,
  });

  const canBuy = (l: MarketplaceListingWithAsset) =>
    l.workspace_id !== workspaceId && l.assets?.status !== "deployed";

  /** The asset's own photo when it has one, otherwise the type placeholder. */
  const listingPhoto = (l: MarketplaceListingWithAsset) =>
    assetMediaUrl(l.assets?.photos?.[0]) ?? getEquipmentPlaceholder(l.type, l.category);

  /** A photo that fails to load must not retry forever against its own url. */
  const photoFallback = (l: MarketplaceListingWithAsset) =>
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      if (img.dataset.fallback) return;
      img.dataset.fallback = "1";
      img.src = getEquipmentPlaceholder(l.type, l.category);
    };

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
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-6">
              {/* ── Listing Details ──────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <ClipboardList size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Listing details
                      </CardTitle>
                      <CardDescription>
                        Basic information about the instrument.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>
                        Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={mName}
                        onChange={(e) => setMName(e.target.value)}
                        placeholder="e.g. Leica TS16"
                        autoFocus
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <ComboboxField
                          label="Type"
                          value={mType}
                          onChange={(v) => setMType(v)}
                          options={TYPE_OPTIONS}
                          placeholder="Select type"
                          emptyText="No types found."
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Specs (comma separated)</Label>
                        <Input
                          value={mSpecs}
                          onChange={(e) => setMSpecs(e.target.value)}
                          placeholder="e.g. 2'' accuracy, 1000m range"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
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
                </CardContent>
              </Card>

              {/* ── Pricing & Condition ──────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <DollarSign size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Pricing & condition
                      </CardTitle>
                      <CardDescription>
                        Set your price and describe the asset condition.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <ComboboxField
                        label="Condition"
                        value={mCondition}
                        onChange={(v) => setMCondition(v)}
                        options={CONDITION_OPTIONS}
                        placeholder="Select condition"
                        emptyText="No conditions found."
                      />
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
                      <Label>
                        Price <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={mPrice}
                        onChange={(e) => setMPrice(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Location & Seller ────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <MapPin size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Location & seller
                      </CardTitle>
                      <CardDescription>
                        Where it is and who is selling it.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>
                        Location <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={mLocation}
                        onChange={(e) => setMLocation(e.target.value)}
                        placeholder="e.g. City, country"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        Seller / Provider{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={mSeller}
                        onChange={(e) => setMSeller(e.target.value)}
                        placeholder="Your firm or name"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Receiving Wallet</Label>
                      {workspaceMarketplaceWallet ? (
                        <div className="rounded-none border border-border/40 bg-muted/30 px-3 py-2">
                          <p className="break-all font-mono text-xs text-muted-foreground">
                            {workspaceMarketplaceWallet}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-none border border-warning/30 bg-warning/10 px-3 py-2">
                          <p className="text-xs text-warning">
                            No marketplace wallet selected. Buyers will see
                            "Seller has no wallet." Set one in Billing.
                          </p>
                        </div>
                      )}
                    </div>
                    {isPlatformAdmin && (
                      <div className="mt-2 flex items-center gap-3 rounded-none border bg-background p-3 sm:col-span-2">
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
                </CardContent>
              </Card>
            </div>

            {/* ── Summary ───────────────────────────────────── */}
            <aside className="h-fit space-y-6 lg:sticky lg:top-0">
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="text-base">Listing summary</CardTitle>
                  <CardDescription>Summary at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="truncate font-medium">{mType || "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Condition</dt>
                      <dd className="truncate font-medium">
                        {mCondition || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Price</dt>
                      <dd className="font-semibold tabular-nums">
                        {mPrice ? `${mCurrency || "USD"} ${mPrice}` : "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Location</dt>
                      <dd className="truncate font-medium">
                        {mLocation || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Seller</dt>
                      <dd className="truncate font-medium">{mSeller || "—"}</dd>
                    </div>
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
    <DashboardShell className="w-full max-w-full">
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
          <div className="flex flex-wrap items-center gap-2">
            <MarketCartButton onClick={() => setCartOpen(true)}>
              Cart
            </MarketCartButton>
            {isPlatformAdmin ? (
              <Button onClick={openCreateListing} className="gap-2">
                <Plus className="h-4 w-4" /> List a global instrument
              </Button>
            ) : null}
          </div>
        }
      />

      {loading ? (
        <PageLoader />
      ) : (
        <>
          <KpiGrid>
            <KpiCard
              title="Total Listings"
              value={String(totalListings)}
              icon={<Package className="size-4" />}
            />
            <KpiCard
              title="For Sale"
              value={String(saleListings)}
              tone="success"
              icon={<ShoppingCart className="size-4" />}
            />
            <KpiCard
              title="For Hire"
              value={String(hireListings)}
              tone="info"
              icon={<Clock className="size-4" />}
            />
            <KpiCard
              title="In Use"
              value={String(inUseListings)}
              tone="warning"
              icon={<Activity className="size-4" />}
            />
          </KpiGrid>

          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="space-y-4"
          >
            <TabsList className="h-auto w-full flex-wrap rounded-lg border border-border/70 bg-card p-1 shadow-sm sm:w-fit">
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
                  <div className="flex w-full flex-col gap-3 rounded-lg border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative w-full sm:w-[260px]">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search instruments & services..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="inline-flex items-center gap-0.5 rounded-none border bg-background p-0.5 shrink-0">
                      <Button
                        type="button"
                        variant={layoutMode === "tiles" ? "default" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        title="Big tiles"
                        aria-label="Big tiles layout"
                        onClick={() => setLayoutMode("tiles")}
                      >
                        <Columns2 className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={layoutMode === "grid" ? "default" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        title="Grid"
                        aria-label="Grid layout"
                        onClick={() => setLayoutMode("grid")}
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={layoutMode === "list" ? "default" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        title="List"
                        aria-label="List layout"
                        onClick={() => setLayoutMode("list")}
                      >
                        <LayoutList className="h-4 w-4" />
                      </Button>
                    </div>
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
            onOpenChange={() => {
              setSelectedListing(null);
              setShowRequestForm(false);
              setShowPayment(false);
            }}
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
            size="lg"
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
                          {!isOwner && !isDeployed && listingRequest?.status === "pending" && (
                            <Button variant="outline" disabled className="w-full sm:w-auto">
                              <Clock className="mr-2 h-4 w-4" /> Request pending
                            </Button>
                          )}
                          {!isOwner && !isDeployed && listingRequest?.status === "accepted" && (
                            <Button
                              onClick={() => setShowPayment(true)}
                              className="w-full sm:w-auto"
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Approved — pay now
                            </Button>
                          )}
                          {!isOwner &&
                            !isDeployed &&
                            (!listingRequest ||
                              listingRequest.status === "declined" ||
                              listingRequest.status === "cancelled") && (
                              <>
                                <Button
                                  onClick={() => setShowRequestForm(true)}
                                  className="w-full sm:w-auto"
                                >
                                  {selectedListing.listing_type === "hire"
                                    ? "Request Hire"
                                    : "Request Purchase"}
                                </Button>
                                <AddToCartButton
                                  listing={cartListingOf(selectedListing)}
                                  className="w-full sm:w-auto"
                                />
                              </>
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
                <div className="overflow-hidden rounded-lg border border-border/60 bg-muted">
                  <img
                    src={listingPhoto(selectedListing)}
                    alt={selectedListing.name}
                    onError={photoFallback(selectedListing)}
                    className="aspect-[16/9] w-full object-cover"
                  />
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3">
                  <p className="text-2xl font-semibold tracking-tight text-foreground">
                    ${selectedListing.price.toLocaleString()}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      {selectedListing.currency}{" "}
                      {selectedListing.listing_type === "hire" ? "/ day" : "one-time"}
                    </span>
                  </p>
                  <span className="text-xs text-muted-foreground">
                    Posted {new Date(selectedListing.created_at).toLocaleDateString()}
                  </span>
                </div>

                {selectedListing.description && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {selectedListing.description}
                  </p>
                )}

                {selectedListing.specs && selectedListing.specs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedListing.specs.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}

                <Card className="bg-muted/30">
                  <CardContent className="grid grid-cols-2 gap-3 py-3 text-xs sm:text-sm">
                    <div>
                      <span className="block text-micro text-muted-foreground">
                        {selectedListing.condition === "Service" ? "Provider" : "Seller"}
                      </span>
                      <span className="font-medium text-foreground">{selectedListing.seller}</span>
                    </div>
                    <div>
                      <span className="block text-micro text-muted-foreground">Location</span>
                      <span className="font-medium text-foreground">{selectedListing.location}</span>
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

                {showPayment &&
                  selectedListing &&
                  listingRequest?.status === "accepted" && (
                    <ListingPaymentPanel
                      listing={{
                        id: selectedListing.id,
                        name: selectedListing.name,
                        price: selectedListing.price,
                        currency: selectedListing.currency,
                        listingType: selectedListing.listing_type,
                      }}
                      buyerWorkspaceId={workspaceId}
                      onPaid={(orderId) => {
                        setNotice(`Order ${orderId.slice(0, 8)} recorded.`);
                        setShowPayment(false);
                      }}
                    />
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
              {layoutMode === "list" ? (
                <div className="space-y-3">
                  {paginated.map((l, index) => (
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
                        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                            {(effectivePage - 1) * pageSize + index + 1}
                          </span>
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                            <img
                              src={listingPhoto(l)}
                              alt=""
                              loading="lazy"
                              onError={photoFallback(l)}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold text-foreground">{l.name}</h3>
                            <p className="truncate text-xs text-muted-foreground">
                              {l.type} · {l.seller} · {l.location}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4 sm:justify-end">
                          <div className="hidden flex-wrap justify-end gap-1 md:flex">
                            <Badge variant={conditionVariant[l.condition] as never}>{l.condition}</Badge>
                            {l.assets?.status === "deployed" && (
                              <Badge variant="secondary">In Use</Badge>
                            )}
                            <Badge variant={l.listing_type === "hire" ? "purple" : "outline"}>
                              {l.listing_type === "hire" ? "Hire" : "Sale"}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-foreground">
                              ${l.price.toLocaleString()}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                {l.currency} {l.listing_type === "hire" ? "/ day" : "one-time"}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Posted {new Date(l.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          {canBuy(l) ? (
                            <AddToCartButton listing={cartListingOf(l)} size="sm" />
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div
                  className={cn(
                    "grid grid-cols-1 gap-4",
                    layoutMode === "tiles"
                      ? "md:grid-cols-2 xl:grid-cols-2"
                      : "sm:grid-cols-2 lg:grid-cols-3",
                  )}
                >
                  {paginated.map((l, index) => {
                    const itemNumber = (effectivePage - 1) * pageSize + index + 1;
                    return layoutMode === "tiles" ? (
                      <Card
                        key={l.id}
                        className={cn(
                          "cursor-pointer border-border/70 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary hover:shadow-lg",
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
                        <CardContent className="flex flex-col gap-3 p-6">
                          <div className="flex items-start justify-between gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-primary/10 text-xs font-semibold text-primary">
                              {itemNumber}
                            </span>
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
                          <div className="flex flex-col items-center gap-2 py-3">
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                              <img
                                src={listingPhoto(l)}
                                alt=""
                                loading="lazy"
                                onError={photoFallback(l)}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <h3 className="text-center text-lg font-semibold text-foreground">{l.name}</h3>
                            <p className="text-sm text-muted-foreground">{l.type}</p>
                          </div>
                          <div className="flex flex-col items-center gap-2 border-t pt-3">
                            <p className="text-xl font-semibold text-foreground">
                              ${l.price.toLocaleString()}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                {l.currency} {l.listing_type === "hire" ? "/ day" : "one-time"}
                              </span>
                            </p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span>{l.seller}</span>
                              <span className="mx-0.5">·</span>
                              <span>{l.location}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Posted {new Date(l.created_at).toLocaleDateString()}
                            </p>
                            {canBuy(l) ? (
                              <AddToCartButton
                                listing={cartListingOf(l)}
                                className="mt-1 w-full sm:w-auto"
                              />
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
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
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-primary/10 text-xs font-semibold text-primary">
                                {itemNumber}
                              </span>
                              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
                                <img
                                  src={listingPhoto(l)}
                                  alt=""
                                  loading="lazy"
                                  onError={photoFallback(l)}
                                  className="h-full w-full object-cover"
                                />
                              </div>
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
                          {canBuy(l) ? (
                            <AddToCartButton
                              listing={cartListingOf(l)}
                              className="w-full"
                            />
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

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
                    Nothing requested yet. Add listings to your cart, then send
                    one request for the whole basket.
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
                            {req.status === "accepted" && (
                              <Button
                                size="sm"
                                onClick={() =>
                                  setPayRequestId((current) =>
                                    current === req.id ? null : req.id,
                                  )
                                }
                              >
                                <DollarSign className="mr-2 h-3 w-3" />
                                {payRequestId === req.id ? "Hide payment" : "Pay now"}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                        {payRequestId === req.id && (
                          <CardContent className="border-t border-border/60 py-4">
                            <ListingPaymentPanel
                              listing={{
                                id: req.listing_id,
                                name: req.marketplace_listings.name,
                                price: req.marketplace_listings.price,
                                currency: req.marketplace_listings.currency,
                                listingType: req.marketplace_listings.listing_type,
                              }}
                              buyerWorkspaceId={workspaceId}
                              onPaid={() => {
                                setPayRequestId(null);
                                void fetchMyRequests();
                              }}
                            />
                          </CardContent>
                        )}
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

      <MarketCartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        buyer={{ workspaceId, name: authUser?.name ?? null }}
      />
    </DashboardShell>
  );
}
