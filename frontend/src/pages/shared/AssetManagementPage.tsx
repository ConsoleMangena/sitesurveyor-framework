import { useState, useCallback, type ComponentType } from "react";
import {
  Plus,
  ClipboardList,
  DollarSign,
  Gauge,
  MapPinned,
  CheckCircle2,
  AlertTriangle,
  LayoutGrid,
  Wrench,
  Search,
  X,
  Download,
} from "lucide-react";

import PageLoader from "@/components/PageLoader.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { PageForm } from "@/components/templates/PageForm.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { DashboardHeader, DashboardShell } from "@/components/dashboard/DashboardShell.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { KpiCard } from "@/components/dashboard/KpiCard.tsx";
import { AssetStatusChart } from "@/components/dashboard/AssetStatusChart.tsx";
import { CalibrationDuePanel } from "@/components/dashboard/CalibrationDuePanel.tsx";
import { cn } from "@/lib/utils";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";

import {
  listAssets,
  createAsset,
  updateAsset,
  listCalibrations,
  listMaintenanceEvents,
  type AssetUpdate,
} from "../../lib/repositories/assets.ts";
import {
  getMarketplaceListingByAssetId,
  createMarketplaceListing,
  updateMarketplaceListing,
  deleteMarketplaceListing,
  listMarketplaceListings,
  type MarketplaceListingRow,
} from "../../lib/repositories/marketplace.ts";
import { getMarketplaceWallet, getWorkspaceById } from "../../lib/repositories/workspaces.ts";
import { listProjects, type ProjectWithOrg } from "../../lib/repositories/projects.ts";
import { mapAssetRowToInstrument, type UiInstrument } from "../../lib/mappers.ts";

type Instrument = UiInstrument & { listing?: MarketplaceListingRow | null };

interface AssetManagementPageProps {
  workspaceId: string;
}

const ASSET_CATEGORIES = [
  { value: "Total Station", label: "Total Station" },
  { value: "GNSS Receiver", label: "GNSS Receiver" },
  { value: "Digital Level", label: "Digital Level" },
  { value: "UAV / Drone", label: "UAV / Drone" },
  { value: "Controller", label: "Controller" },
  { value: "Calibration Service", label: "Calibration Service" },
  { value: "Other", label: "Other" },
];

function daysUntil(dateStr: string): number {
  if (!dateStr) return 999;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function calDaysClass(days: number): string {
  if (days < 0) return "text-destructive";
  if (days <= 30) return "text-amber-600";
  if (days <= 60) return "text-yellow-600";
  return "text-emerald-600";
}

function calBgClass(days: number): string {
  if (days < 0) return "bg-destructive/10 text-destructive border-destructive/20";
  if (days <= 30) return "bg-amber-100 text-amber-800 border-amber-200";
  if (days <= 60) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

function calLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d remaining`;
}

const statusVariant: Record<string, BadgeProps["variant"]> = {
  Available: "success",
  Deployed: "default",
  Maintenance: "warning",
  Retired: "secondary",
};

const typeBgClass: Record<string, string> = {
  "Total Station": "bg-violet-100 text-violet-800 border-violet-200",
  "GNSS Receiver": "bg-blue-100 text-blue-800 border-blue-200",
  "Digital Level": "bg-sky-100 text-sky-800 border-sky-200",
  "UAV / Drone": "bg-amber-100 text-amber-800 border-amber-200",
  Controller: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Calibration Service": "bg-rose-100 text-rose-800 border-rose-200",
  Other: "bg-slate-100 text-slate-800 border-slate-200",
};

type Tab = "register" | "calibration" | "deployments" | "maintenance";
type TypeFilter =
  | "all"
  | "Total Station"
  | "GNSS Receiver"
  | "Digital Level"
  | "UAV / Drone"
  | "Controller"
  | "Calibration Service";

function IconTotalStation() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21v-3" /><path d="M8 21l2-3" /><path d="M16 21l-2-3" /><path d="M9 18h6" /><rect x="10" y="15" width="4" height="3" rx="0.5" /><path d="M10 15v-6a2 2 0 0 1 4 0v6" /><rect x="7" y="6" width="10" height="4" rx="1" /><path d="M17 7v2" /><path d="M7 7v2" /><path d="M5 7.5h2v1H5z" /><path d="M10 6V4h4v2" />
    </svg>
  );
}
function IconGnss() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21V9" /><path d="M10 21h4" /><path d="M8 9h8a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2z" /><path d="M9 4c1-2 5-2 6 0" /><path d="M8 6L7 2" /><rect x="13" y="12" width="3" height="5" rx="0.5" />
    </svg>
  );
}
function IconLevel() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21v-3" /><path d="M8 21l2-3" /><path d="M16 21l-2-3" /><path d="M9 18h6" /><rect x="6" y="10" width="12" height="8" rx="1" /><path d="M18 11v6" /><path d="M6 12v4" /><path d="M4 12.5h2v3H4z" /><rect x="9" y="12" width="4" height="4" rx="0.5" /><path d="M11 10V9h2v1" />
    </svg>
  );
}
function IconDrone() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="6" height="6" rx="2" /><path d="M11 15v2h2v-2" /><circle cx="12" cy="18" r="1" /><line x1="9" y1="9" x2="5" y2="5" /><line x1="15" y1="9" x2="19" y2="5" /><line x1="9" y1="15" x2="5" y2="19" /><line x1="15" y1="15" x2="19" y2="19" /><ellipse cx="5" cy="5" rx="3" ry="1" /><ellipse cx="19" cy="5" rx="3" ry="1" /><ellipse cx="5" cy="19" rx="3" ry="1" /><ellipse cx="19" cy="19" rx="3" ry="1" />
    </svg>
  );
}
function IconController() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" /><rect x="6" y="5" width="12" height="10" rx="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /><circle cx="12" cy="17" r="0.5" /><circle cx="12" cy="19" r="0.5" /><circle cx="11" cy="18" r="0.5" /><circle cx="13" cy="18" r="0.5" />
    </svg>
  );
}
function IconCalibration() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M2 12h4" /><path d="M18 12h4" /><circle cx="12" cy="12" r="2" /><path d="M15 15l5 5a2 2 0 0 1-3 3l-5-5" /><path d="M16 14l2 2" />
    </svg>
  );
}

const iconMap: Record<string, ComponentType> = {
  "Total Station": IconTotalStation,
  "GNSS Receiver": IconGnss,
  "Digital Level": IconLevel,
  "UAV / Drone": IconDrone,
  Controller: IconController,
  "Calibration Service": IconCalibration,
};

function ListingIcon({ type }: { type: string }) {
  const Ico = iconMap[type] ?? IconTotalStation;
  return <Ico />;
}

export default function AssetManagementPage({ workspaceId }: AssetManagementPageProps) {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string>("Our Company");
  const [workspaceMarketplaceWallet, setWorkspaceMarketplaceWallet] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("register");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedAsset, setSelectedAsset] = useState<Instrument | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    kind: "instrument" as "instrument" | "vehicle" | "equipment" | "other",
    category: "",
    make: "",
    model: "",
    serial_number: "",
    purchase_date: "",
    purchase_cost: "",
  });
  const [saving, setSaving] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    kind: "instrument" as "instrument" | "vehicle" | "equipment" | "other",
    category: "",
    make: "",
    model: "",
    serial_number: "",
    purchase_date: "",
    purchase_cost: "",
  });

  const [listOnMarketplace, setListOnMarketplace] = useState(false);
  const [marketplaceListingId, setMarketplaceListingId] = useState<string | null>(null);
  const [listingForm, setListingForm] = useState({
    listing_type: "sale",
    price: "",
    condition: "New",
    location: "",
    description: "",
    seller: workspaceName,
    seller_wallet_address: "",
  });

  const [projects, setProjects] = useState<ProjectWithOrg[]>([]);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployTargetAssetId, setDeployTargetAssetId] = useState<string | null>(null);
  const [deployTargetProjectName, setDeployTargetProjectName] = useState("");

  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [assets, calibrations, maintenance, workspace, projList, listings] = await Promise.all([
        listAssets(workspaceId),
        listCalibrations(workspaceId),
        listMaintenanceEvents(workspaceId),
        getWorkspaceById(workspaceId).catch(() => null),
        listProjects(workspaceId).catch(() => []),
        listMarketplaceListings(workspaceId).catch(() => []),
      ]);

      setProjects(projList);
      if (workspace) setWorkspaceName(workspace.name);

      const calByAsset = new Map<string, typeof calibrations>();
      for (const c of calibrations) {
        const arr = calByAsset.get(c.asset_id) ?? [];
        arr.push(c);
        calByAsset.set(c.asset_id, arr);
      }

      const maintByAsset = new Map<string, typeof maintenance>();
      for (const m of maintenance) {
        const arr = maintByAsset.get(m.asset_id) ?? [];
        arr.push(m);
        maintByAsset.set(m.asset_id, arr);
      }

      const listingByAsset = new Map<string, MarketplaceListingRow>();
      for (const l of listings) {
        if (l.asset_id) listingByAsset.set(l.asset_id, l);
      }

      setInstruments(
        assets.map((a) => ({
          ...mapAssetRowToInstrument(
            a,
            calByAsset.get(a.id) ?? [],
            maintByAsset.get(a.id) ?? [],
          ),
          listing: listingByAsset.get(a.id) ?? null,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(fetchAssets, [fetchAssets]);

  const fetchWorkspaceWallet = useCallback(async () => {
    try {
      const address = await getMarketplaceWallet(workspaceId);
      setWorkspaceMarketplaceWallet(address);
    } catch {
      setWorkspaceMarketplaceWallet(null);
    }
  }, [workspaceId]);

  useAsyncAction(fetchWorkspaceWallet, [fetchWorkspaceWallet]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setSaving(true);
    try {
      await createAsset(workspaceId, {
        name: createForm.name.trim(),
        kind: createForm.kind,
        category: createForm.category || null,
        make: createForm.make || null,
        model: createForm.model || null,
        serial_number: createForm.serial_number || null,
        purchase_date: createForm.purchase_date || null,
        purchase_cost: createForm.purchase_cost ? Number(createForm.purchase_cost) : null,
      });
      setShowCreateModal(false);
      setCreateForm({ name: "", kind: "instrument", category: "", make: "", model: "", serial_number: "", purchase_date: "", purchase_cost: "" });
      await fetchAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create asset.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (dbId: string, newStatus: string, metadataUpdates?: Record<string, unknown>) => {
    try {
      const patch: AssetUpdate = { status: newStatus as AssetUpdate["status"] };
      if (metadataUpdates) {
        const asset = instruments.find((i) => i.dbId === dbId);
        const existingMetadata = asset?.metadata || {};
        patch.metadata = { ...existingMetadata, ...metadataUpdates } as AssetUpdate["metadata"];
      }
      await updateAsset(dbId, patch);
      await fetchAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update asset.");
    }
  };

  const handleDeploySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deployTargetAssetId) return;
    void handleStatusChange(deployTargetAssetId, "deployed", {
      current_project_name: deployTargetProjectName || null,
    });
    setShowDeployModal(false);
    setDeployTargetAssetId(null);
    setDeployTargetProjectName("");
  };

  const openDeployModal = (e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    setDeployTargetAssetId(assetId);
    setDeployTargetProjectName("");
    setShowDeployModal(true);
  };

  const handleOpenEdit = useCallback(async () => {
    if (!selectedAsset) return;
    setEditForm({
      name: selectedAsset.name,
      kind: selectedAsset.kind as "instrument" | "vehicle" | "equipment" | "other",
      category: selectedAsset.type,
      make: selectedAsset.make,
      model: selectedAsset.model,
      serial_number: selectedAsset.serial,
      purchase_date: selectedAsset.purchaseDate || "",
      purchase_cost: selectedAsset.purchaseCost ? String(selectedAsset.purchaseCost) : "",
    });
    setEditingAssetId(selectedAsset.dbId);

    try {
      const listing = await getMarketplaceListingByAssetId(selectedAsset.dbId);
      if (listing) {
        setListOnMarketplace(true);
        setMarketplaceListingId(listing.id);
        setListingForm({
          listing_type: listing.listing_type || "sale",
          price: listing.price.toString(),
          condition: listing.condition,
          location: listing.location,
          description: listing.description || "",
          seller: listing.seller || workspaceName,
          seller_wallet_address: listing.seller_wallet_address || "",
        });
      } else {
        setListOnMarketplace(false);
        setMarketplaceListingId(null);
        setListingForm({ listing_type: "sale", price: "", condition: "New", location: "", description: "", seller: workspaceName, seller_wallet_address: "" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load marketplace listing for this asset.");
    }

    setSelectedAsset(null);
    setShowEditModal(true);
  }, [selectedAsset, workspaceName]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.name.trim() || !editingAssetId) return;
    if (listOnMarketplace && !listingForm.price) {
      setError("Please specify a price for the marketplace listing.");
      return;
    }
    setSaving(true);
    try {
      await updateAsset(editingAssetId, {
        name: editForm.name.trim(),
        kind: editForm.kind,
        category: editForm.category || null,
        make: editForm.make || null,
        model: editForm.model || null,
        serial_number: editForm.serial_number || null,
        purchase_date: editForm.purchase_date || null,
        purchase_cost: editForm.purchase_cost ? Number(editForm.purchase_cost) : null,
      });

      if (listOnMarketplace) {
        const listingPayload = {
          asset_id: editingAssetId,
          listing_type: listingForm.listing_type,
          name: editForm.name.trim(),
          type: editForm.category || "Asset",
          condition: listingForm.condition,
          price: Number(listingForm.price),
          currency: "USD",
          seller: listingForm.seller.trim() || workspaceName,
          seller_wallet_address: workspaceMarketplaceWallet ?? null,
          location: listingForm.location || "HQ",
          description: listingForm.description || "",
          specs: editForm.model ? [editForm.model] : [],
        };

        if (marketplaceListingId) {
          await updateMarketplaceListing(marketplaceListingId, listingPayload);
        } else {
          await createMarketplaceListing(workspaceId, listingPayload);
        }
      } else if (marketplaceListingId) {
        await deleteMarketplaceListing(marketplaceListingId);
      }

      setShowEditModal(false);
      setEditingAssetId(null);
      await fetchAssets();
      setSuccessMessage(
        listOnMarketplace
          ? "Asset updated and marketplace listing saved."
          : "Asset updated successfully.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update asset.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = instruments.filter((inst) => {
    if (typeFilter !== "all" && inst.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return [inst.name, inst.make, inst.model, inst.serial, inst.type, inst.assignedTo, inst.assignedProject]
        .join(" ")
        .toLowerCase()
        .includes(q);
    }
    return true;
  });

  const totalValue = instruments.reduce((s, i) => s + i.currentValue, 0);
  const deployed = instruments.filter((i) => i.status === "Deployed").length;
  const inMaintenance = instruments.filter((i) => i.status === "Maintenance").length;
  const available = instruments.filter((i) => i.status === "Available").length;
  const calibDue = instruments.filter((i) => {
    const d = daysUntil(i.nextCalibration);
    return d <= 30 && d !== 999;
  }).length;

  if (loading) {
    return (
      <div className="hub-body p-6">
        <PageLoader />
      </div>
    );
  }

  if (showCreateModal) {
    return (
      <PageForm
        title="Add Instrument"
        description="Register a new survey instrument in your fleet."
        onBack={() => setShowCreateModal(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button type="submit" form="asset-create-form" disabled={saving}>{saving ? "Saving..." : "Add Instrument"}</Button>
          </>
        }
      >
        <form id="asset-create-form" onSubmit={handleCreate} className="space-y-6">
          {/* ── Identity ─────────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ClipboardList size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Instrument Identity</h3>
                <p className="text-[11px] text-muted-foreground">Give your asset a recognisable name and classification.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="create-name">Name <span className="text-destructive">*</span></Label>
                <Input id="create-name" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Leica TS16" required autoFocus />
                <p className="text-[11px] text-muted-foreground">A friendly label like "Leica TS16 #2" or "DJI Phantom Fleet".</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Kind</Label>
                  <Select value={createForm.kind} onValueChange={(v) => setCreateForm((f) => ({ ...f, kind: v as typeof createForm.kind }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instrument">Instrument</SelectItem>
                      <SelectItem value="vehicle">Vehicle</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={createForm.category} onValueChange={(v) => setCreateForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {ASSET_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* ── Manufacturer & Serial ────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600">
                <Wrench size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Manufacturer Details</h3>
                <p className="text-[11px] text-muted-foreground">Make, model and serial for identification and calibration records.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="create-make">Make</Label>
                  <Input id="create-make" value={createForm.make} onChange={(e) => setCreateForm((f) => ({ ...f, make: e.target.value }))} placeholder="e.g. Leica, Trimble" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-model">Model</Label>
                  <Input id="create-model" value={createForm.model} onChange={(e) => setCreateForm((f) => ({ ...f, model: e.target.value }))} placeholder="e.g. TS16, R12i" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="create-serial">Serial Number</Label>
                  <Input id="create-serial" value={createForm.serial_number} onChange={(e) => setCreateForm((f) => ({ ...f, serial_number: e.target.value }))} placeholder="e.g. SN-123456789" className="font-mono text-xs" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Purchase Info ────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
                <DollarSign size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Purchase Information</h3>
                <p className="text-[11px] text-muted-foreground">Optional — helps track asset value and depreciation.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="create-purchase-date">Purchase Date</Label>
                  <Input id="create-purchase-date" type="date" value={createForm.purchase_date} onChange={(e) => setCreateForm((f) => ({ ...f, purchase_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-purchase-cost">Purchase Cost ($)</Label>
                  <Input id="create-purchase-cost" type="number" value={createForm.purchase_cost} onChange={(e) => setCreateForm((f) => ({ ...f, purchase_cost: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
            </div>
          </div>
        </form>
      </PageForm>
    );
  }

  if (showEditModal) {
    return (
      <PageForm
        title="Edit Instrument"
        description="Update asset details and marketplace settings."
        onBack={() => { setShowEditModal(false); setEditingAssetId(null); }}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => { setShowEditModal(false); setEditingAssetId(null); }}>Cancel</Button>
            <Button type="submit" form="asset-edit-form" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
          </>
        }
      >
        <form id="asset-edit-form" onSubmit={handleSaveEdit} className="space-y-6">
          {/* ── Identity ─────────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ClipboardList size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Instrument Identity</h3>
                <p className="text-[11px] text-muted-foreground">Name and classification of this asset.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Name <span className="text-destructive">*</span></Label>
                <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Kind</Label>
                  <Select value={editForm.kind} onValueChange={(v) => setEditForm((f) => ({ ...f, kind: v as typeof editForm.kind }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instrument">Instrument</SelectItem>
                      <SelectItem value="vehicle">Vehicle</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={editForm.category} onValueChange={(v) => setEditForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {ASSET_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* ── Manufacturer & Serial ────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600">
                <Wrench size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Manufacturer Details</h3>
                <p className="text-[11px] text-muted-foreground">Make, model and serial for identification.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-make">Make</Label>
                  <Input id="edit-make" value={editForm.make} onChange={(e) => setEditForm((f) => ({ ...f, make: e.target.value }))} placeholder="e.g. Leica, Trimble" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-model">Model</Label>
                  <Input id="edit-model" value={editForm.model} onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value }))} placeholder="e.g. TS16, R12i" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="edit-serial">Serial Number</Label>
                  <Input id="edit-serial" value={editForm.serial_number} onChange={(e) => setEditForm((f) => ({ ...f, serial_number: e.target.value }))} placeholder="e.g. SN-123456789" className="font-mono text-xs" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Purchase Info ────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
                <DollarSign size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Purchase Information</h3>
                <p className="text-[11px] text-muted-foreground">Optional — helps track asset value and depreciation.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-purchase-date">Purchase Date</Label>
                  <Input id="edit-purchase-date" type="date" value={editForm.purchase_date} onChange={(e) => setEditForm((f) => ({ ...f, purchase_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-purchase-cost">Purchase Cost ($)</Label>
                  <Input id="edit-purchase-cost" type="number" value={editForm.purchase_cost} onChange={(e) => setEditForm((f) => ({ ...f, purchase_cost: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Marketplace ──────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
                <LayoutGrid size={14} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold">Marketplace Listing</h3>
                <p className="text-[11px] text-muted-foreground">Optionally list this asset for sale or hire.</p>
              </div>
              <Switch id="marketplace" checked={listOnMarketplace} onCheckedChange={setListOnMarketplace} />
            </div>
            {listOnMarketplace && (
              <div className="rounded-lg border border-amber-200/50 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-900/10 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Listing Type</Label>
                    <Select value={listingForm.listing_type} onValueChange={(v) => setListingForm((f) => ({ ...f, listing_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hire">Available for Hire</SelectItem>
                        <SelectItem value="sale">Available for Sale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="listing-price">Price ($) <span className="text-destructive">*</span></Label>
                    <Input id="listing-price" type="number" value={listingForm.price} onChange={(e) => setListingForm((f) => ({ ...f, price: e.target.value }))} placeholder="0.00" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Condition</Label>
                    <Select value={listingForm.condition} onValueChange={(v) => setListingForm((f) => ({ ...f, condition: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["New", "Like New", "Good", "Fair"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="listing-location">Location</Label>
                    <Input id="listing-location" value={listingForm.location} onChange={(e) => setListingForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Johannesburg, HQ" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="listing-seller">Seller Name / Company</Label>
                    <Input id="listing-seller" value={listingForm.seller} onChange={(e) => setListingForm((f) => ({ ...f, seller: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Receiving Wallet</Label>
                    {workspaceMarketplaceWallet ? (
                      <div className="rounded-md border border-border/40 bg-muted/30 px-3 py-2">
                        <p className="text-xs break-all font-mono text-muted-foreground">
                          {workspaceMarketplaceWallet}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20 px-3 py-2">
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          No marketplace wallet selected. Buyers will see "Seller has no wallet." Set one in Billing.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="listing-description">Listing Description</Label>
                    <textarea
                      id="listing-description"
                      rows={3}
                      value={listingForm.description}
                      onChange={(e) => setListingForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Describe the asset condition, included accessories, etc."
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      </PageForm>
    );
  }

  return (
    <DashboardShell className="hub-body">
      <DashboardHeader
        title="My Instruments"
        subtitle="Track, calibrate and deploy your survey fleet"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="gap-2">
              <Download size={16} />
              Export Register
            </Button>
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus size={16} />
              Add Instrument
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          title="Instruments"
          value={instruments.length.toString()}
          subtext="registered"
          icon={<ClipboardList className="size-4" />}
        />
        <KpiCard
          title="Fleet Value"
          value={`$${totalValue.toLocaleString()}`}
          subtext="book value"
          icon={<DollarSign className="size-4" />}
        />
        <KpiCard
          title="Utilisation"
          value={`${instruments.length ? Math.round((deployed / instruments.length) * 100) : 0}%`}
          subtext="deployed"
          icon={<Gauge className="size-4" />}
        />
        <KpiCard
          title="Deployed"
          value={deployed.toString()}
          subtext="in the field"
          icon={<MapPinned className="size-4" />}
        />
        <KpiCard
          title="Available"
          value={available.toString()}
          subtext="ready"
          icon={<CheckCircle2 className="size-4" />}
        />
        <KpiCard
          title="Calibrations Due"
          value={calibDue.toString()}
          subtext="within 30 days"
          icon={<AlertTriangle className="size-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-9">
          <DashboardCard title="Asset Register" icon={<ClipboardList size={16} />}>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="register" className="gap-2">
            <LayoutGrid size={16} /> Register
          </TabsTrigger>
          <TabsTrigger value="calibration" className="gap-2">
            <Gauge size={16} /> Calibration
            {calibDue > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5">{calibDue}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="deployments" className="gap-2">
            <MapPinned size={16} /> Deployments
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-2">
            <Wrench size={16} /> Maintenance
            {inMaintenance > 0 && <Badge variant="warning" className="ml-1 h-5 px-1.5">{inMaintenance}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="register" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "Total Station", "GNSS Receiver", "Digital Level", "UAV / Drone", "Controller", "Calibration Service"] as const).map((t) => (
              <Button
                key={t}
                variant={typeFilter === t ? "default" : "outline"}
                size="sm"
                onClick={() => setTypeFilter(t)}
              >
                {t === "all" ? "All" : t}
              </Button>
            ))}
            <div className="flex-1" />
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search instruments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-7"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-none border border-dashed p-12 text-center text-muted-foreground">
              <ClipboardList size={40} />
              <h3 className="mt-3 text-lg font-semibold text-foreground">No instruments found</h3>
              <p>Try adjusting your search criteria or clear filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((inst) => {
                const days = daysUntil(inst.nextCalibration);
                const deployed = inst.status === "Deployed";
                return (
                  <Card
                    key={inst.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => setSelectedAsset(inst)}
                  >
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className={cn("rounded-none p-2 border text-muted-foreground", typeBgClass[inst.type] ?? typeBgClass.Other)}>
                          <ListingIcon type={inst.type} />
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Badge variant={statusVariant[inst.status] ?? "secondary"}>{inst.status}</Badge>
                          {inst.listing && <Badge variant="purple">Listed</Badge>}
                          {deployed && <Badge variant="default">In Use</Badge>}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{inst.name}</h3>
                        <p className="text-sm text-muted-foreground">{inst.type} · {inst.make} {inst.model}</p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold">${inst.currentValue.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">book value</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>SN {inst.serial || "—"}</span>
                        {(inst.assignedProject || inst.assignedTo) && inst.assignedProject !== "—" && (
                          <>
                            <span>·</span>
                            <span>{inst.assignedProject}</span>
                          </>
                        )}
                        {inst.nextCalibration && (
                          <>
                            <span>·</span>
                            <span className={calDaysClass(days)}>{calLabel(days)}</span>
                          </>
                        )}
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        {inst.status === "Available" ? (
                          <Button size="sm" onClick={(e) => openDeployModal(e, inst.dbId)}>Deploy</Button>
                        ) : inst.status === "Deployed" ? (
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); void handleStatusChange(inst.dbId, "available", { current_project_name: null }); }}>
                            Check In
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">View details</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calibration" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered
              .filter((i) => i.nextCalibration)
              .map((inst) => {
                const days = daysUntil(inst.nextCalibration);
                return (
                  <Card key={inst.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAsset(inst)}>
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold">{inst.name}</h3>
                          <p className="text-sm text-muted-foreground">{inst.type}</p>
                        </div>
                        <Badge className={cn("border", calBgClass(days))}>{calLabel(days)}</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", days < 0 ? "bg-destructive" : days <= 30 ? "bg-amber-500" : days <= 60 ? "bg-yellow-500" : "bg-emerald-500")}
                            style={{ width: `${Math.max(0, Math.min(100, ((180 - days) / 180) * 100))}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Last: {inst.lastCalibration}</span>
                          <span>Next: {inst.nextCalibration}</span>
                        </div>
                      </div>
                      {inst.calibrationCert && (
                        <p className="text-xs text-muted-foreground">Cert: {inst.calibrationCert}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
          {filtered.filter((i) => i.nextCalibration).length === 0 && (
            <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
              <Gauge size={40} className="mx-auto" />
              <h3 className="mt-3 text-lg font-semibold text-foreground">No calibration records</h3>
              <p>Add calibration details to instruments to track due dates.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="deployments" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {instruments
              .filter((i) => i.status === "Deployed")
              .map((inst) => (
                <Card key={inst.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAsset(inst)}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold">{inst.name}</h3>
                      <Badge variant="default">Deployed</Badge>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Crew</span><span>{inst.assignedTo}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Project</span><span>{inst.assignedProject}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Serial</span><code>{inst.serial}</code></div>
                    </div>
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); void handleStatusChange(inst.dbId, "available", { current_project_name: null }); }}>
                      Check In
                    </Button>
                  </CardContent>
                </Card>
              ))}

            {instruments.filter((i) => i.status === "Available").length > 0 && (
              <>
                <div className="col-span-full text-sm font-medium text-muted-foreground">Available for Deployment</div>
                {instruments
                  .filter((i) => i.status === "Available")
                  .map((inst) => (
                    <Card key={inst.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAsset(inst)}>
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between">
                          <h3 className="font-semibold">{inst.name}</h3>
                          <Badge variant="success">Available</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{inst.type}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Serial</span><code>{inst.serial}</code></div>
                        </div>
                        <Button size="sm" onClick={(e) => openDeployModal(e, inst.dbId)}>Deploy</Button>
                      </CardContent>
                    </Card>
                  ))}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          {filtered
            .filter((i) => i.maintenanceLog.length > 0)
            .map((inst) => (
              <Card key={inst.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAsset(inst)}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{inst.name}</h3>
                      <p className="text-sm text-muted-foreground">{inst.serial} — {inst.type}</p>
                    </div>
                    <Badge variant={statusVariant[inst.status] ?? "secondary"}>{inst.status}</Badge>
                  </div>
                  <div className="relative space-y-3 pl-4 border-l-2 border-muted">
                    {inst.maintenanceLog.map((log, i) => (
                      <div key={i} className="relative">
                        <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground" />
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm">
                          <span className="text-muted-foreground">{log.date}</span>
                          <span>{log.description}</span>
                          {log.cost > 0 && <span className="font-medium">${log.cost.toLocaleString()}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm font-medium">Total maintenance: ${inst.maintenanceLog.reduce((s, l) => s + l.cost, 0).toLocaleString()}</p>
                </CardContent>
              </Card>
            ))}
          {filtered.filter((i) => i.maintenanceLog.length > 0).length === 0 && (
            <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
              <Wrench size={40} className="mx-auto" />
              <h3 className="mt-3 text-lg font-semibold text-foreground">No maintenance records</h3>
            </div>
          )}
        </TabsContent>
      </Tabs>
          </DashboardCard>
        </div>

        <div className="xl:col-span-3 flex flex-col gap-4">
          <AssetStatusChart assets={instruments} />
          <CalibrationDuePanel instruments={instruments} maxItems={5} />
        </div>
      </div>

      {/* Asset Detail Dialog */}
      <DialogTemplate
        open={selectedAsset !== null}
        onOpenChange={(open) => { if (!open) setSelectedAsset(null); }}
        title={selectedAsset?.name ?? "Asset Details"}
        description={
          selectedAsset ? (
            <>
              {selectedAsset.type} · <Badge variant={statusVariant[selectedAsset.status] ?? "secondary"}>{selectedAsset.status}</Badge>
            </>
          ) : null
        }
        icon={selectedAsset ? <ListingIcon type={selectedAsset.type} /> : null}
        size="2xl"
        footer={
          selectedAsset?.status === "Available" ? (
            <>
              <Button variant="outline" onClick={handleOpenEdit}>Edit Asset</Button>
              <Button onClick={(e) => selectedAsset && openDeployModal(e, selectedAsset.dbId)}>Deploy</Button>
            </>
          ) : (
            <Button onClick={handleOpenEdit}>Edit Asset</Button>
          )
        }
      >
        {selectedAsset && (
          <>
            <div className="text-2xl font-bold">
              ${selectedAsset.currentValue.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">book value</span>
            </div>

            {selectedAsset.listing && (
              <div className="rounded-none border p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Marketplace listing</span><span>{selectedAsset.listing.listing_type === "hire" ? "Available for Hire" : "Available for Sale"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span>${selectedAsset.listing.price.toLocaleString()} {selectedAsset.listing.currency}{selectedAsset.listing.listing_type === "hire" ? " / day" : ""}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Condition</span><span>{selectedAsset.listing.condition}</span></div>
              </div>
            )}

            <div className="rounded-none border p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Make / Model</span><span>{selectedAsset.make} {selectedAsset.model}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Serial</span><code>{selectedAsset.serial}</code></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Project</span><span>{selectedAsset.assignedProject}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Purchase Cost</span><span>${selectedAsset.purchaseCost.toLocaleString()} on {selectedAsset.purchaseDate}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Depreciation</span><span>{selectedAsset.purchaseCost > 0 ? Math.round(((selectedAsset.purchaseCost - selectedAsset.currentValue) / selectedAsset.purchaseCost) * 100) : 0}%</span></div>
            </div>

            {selectedAsset.nextCalibration && (
              <div className="rounded-none border p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Last Calibration</span><span>{selectedAsset.lastCalibration}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Next Due</span>
                  <span className={calDaysClass(daysUntil(selectedAsset.nextCalibration))}>{selectedAsset.nextCalibration} ({calLabel(daysUntil(selectedAsset.nextCalibration))})</span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Certificate</span><span>{selectedAsset.calibrationCert}</span></div>
              </div>
            )}

            {selectedAsset.maintenanceLog.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Maintenance History</h4>
                <div className="relative space-y-3 pl-4 border-l-2 border-muted">
                  {selectedAsset.maintenanceLog.map((log, i) => (
                    <div key={i} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground" />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <span className="text-muted-foreground">{log.date}</span>
                        <span>{log.description}</span>
                        {log.cost > 0 && <span className="font-medium">${log.cost.toLocaleString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </DialogTemplate>

      {/* Deploy Asset Dialog */}
      <DialogTemplate
        open={showDeployModal}
        onOpenChange={(open) => { if (!open) { setShowDeployModal(false); setDeployTargetAssetId(null); } }}
        title="Deploy Asset"
        description="Assign this instrument to an active project."
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => { setShowDeployModal(false); setDeployTargetAssetId(null); }}>Cancel</Button>
            <Button type="submit" form="asset-deploy-form" disabled={!deployTargetProjectName}>Deploy Asset</Button>
          </>
        }
      >
        <form id="asset-deploy-form" onSubmit={handleDeploySubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Select Project</Label>
            <Select value={deployTargetProjectName} onValueChange={setDeployTargetProjectName}>
              <SelectTrigger><SelectValue placeholder="Select a project..." /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {projects.length === 0 && (
              <p className="text-xs text-muted-foreground">No active projects found. You can add projects in the Project Hub.</p>
            )}
          </div>
        </form>
      </DialogTemplate>

      {/* Success Dialog */}
      <DialogTemplate
        open={!!successMessage}
        onOpenChange={() => setSuccessMessage(null)}
        title="Success"
        description={successMessage ?? ""}
        size="sm"
        footer={
          <Button onClick={() => setSuccessMessage(null)} className="w-full sm:w-auto">
            Done
          </Button>
        }
      >
        <div className="flex justify-center py-4">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        </div>
      </DialogTemplate>
    </DashboardShell>
  );
}
