import { useState, useEffect, useCallback } from "react";
import {
  Download,
  Plus,
  FileText,
  Check,
  CalendarDays,
  Printer,
  Building2,
  Pencil,
  Trash2,
  Save,
  X,
  Send,
  ClipboardList,
} from "lucide-react";

import PageLoader from "@/components/PageLoader.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { PageForm } from "@/components/templates/PageForm.tsx";
import { SuccessDialog } from "@/components/SuccessDialog.tsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardHeader, DashboardShell } from "@/components/dashboard/DashboardShell.tsx";
import { MetricStrip } from "@/components/dashboard/MetricStrip.tsx";
import { LineItemsEditor } from "@/components/finance/LineItemsEditor.tsx";
import { DocumentThemeSelector } from "@/components/finance/DocumentThemeSelector.tsx";
import { BusinessProfileDialog } from "@/components/finance/BusinessProfileDialog.tsx";
import { printDocument } from "@/lib/printDocument.ts";
import { useBusinessProfile, type BusinessProfile } from "@/lib/businessProfile.ts";
import { useDocumentDefaults } from "@/lib/documentDefaults.ts";
import type { DocumentTheme } from "@/lib/printDocument.ts";

import {
  listInvoices,
  getInvoiceWithItems,
  createInvoice,
  updateInvoice,
  saveInvoiceItems,
  deleteInvoice,
} from "../../lib/repositories/invoices.ts";
import { listOrganizations } from "../../lib/repositories/organizations.ts";
import { listProjects } from "../../lib/repositories/projects.ts";
import { mapInvoiceRowToUi, reverseStatus, type UiInvoice } from "../../lib/mappers.ts";
import type { OrganizationRow } from "../../lib/repositories/organizations.ts";
import { cn } from "@/lib/utils";

interface InvoiceLineItem {
  id: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
}

interface InvoiceDetailProps {
  invoice: UiInvoice;
  items: InvoiceLineItem[];
  savingItems: boolean;
  business: BusinessProfile;
  theme: DocumentTheme;
  terms: string;
  editing: boolean;
  editDraft: {
    invoice_number: string;
    organization_id: string;
    project_id: string;
    issue_date: string;
    due_date: string;
    status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  };
  savingDetails: boolean;
  organizations: OrganizationRow[];
  projectOptions: { id: string; name: string }[];
  onChange: (id: string, field: keyof InvoiceLineItem, value: string | number) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSaveItems: () => void;
  onMarkPaid: () => void;
  onDelete: () => void;
  onNotesChange: (value: string) => void;
  onSaveNotes: (notes: string) => Promise<void> | void;
  onTermsChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditDraftChange: (patch: Partial<InvoiceDetailProps["editDraft"]>) => void;
  onSaveDetails: () => void;
  onSend: () => void;
}

function InvoiceDetail({
  invoice,
  items,
  savingItems,
  business,
  theme,
  terms,
  editing,
  editDraft,
  savingDetails,
  organizations,
  projectOptions,
  onChange,
  onAdd,
  onRemove,
  onSaveItems,
  onMarkPaid,
  onDelete,
  onNotesChange,
  onSaveNotes,
  onTermsChange,
  onStartEdit,
  onCancelEdit,
  onEditDraftChange,
  onSaveDetails,
  onSend,
}: InvoiceDetailProps) {
  const [draftNotes, setDraftNotes] = useState(invoice.notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const notesChanged = draftNotes !== invoice.notes;

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onSaveNotes(draftNotes);
    } finally {
      setSavingNotes(false);
    }
  };
  const calcTotal = (rows: InvoiceLineItem[]) =>
    rows.reduce((s, item) => s + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0);
  const formatCurrency = (value: number) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (isoDate: string | null | undefined) => {
    if (!isoDate) return "—";
    return new Date(isoDate).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handlePrint = () => {
    printDocument({
      type: "invoice",
      id: invoice.id,
      status: invoice.status,
      client: invoice.client,
      project: invoice.project,
      date: invoice.date,
      dueDate: invoice.dueDate ?? undefined,
      items: items.map((item) => ({
        description: item.description,
        qty: item.qty,
        unit: item.unit,
        rate: item.rate,
      })),
      business,
      notes: invoice.notes,
      terms,
      theme,
    });
  };

  const subtotal = calcTotal(items);
  const vat = subtotal * 0.15;
  const total = subtotal + vat;
  const isDraft = invoice.status === "Draft";
  const isPaid = invoice.status === "Paid";

  return (
    <div className="space-y-0">
      <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/[0.07] via-background to-background px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                    {invoice.id}
                  </h2>
                  <Badge variant={statusVariant(invoice.status)} className="capitalize">
                    {invoice.status}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Issued {formatDate(invoice.date)}
                  {invoice.dueDate && <> · Due {formatDate(invoice.dueDate)}</>}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 print:hidden">
            {isDraft && !editing && (
              <Button
                variant="outline"
                size="sm"
                onClick={onStartEdit}
                className="h-8 gap-1.5"
              >
                <Pencil size={13} />
                Edit
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onSaveItems}
              disabled={savingItems}
              className="h-8 gap-1.5"
            >
              {savingItems ? "Saving..." : <Save size={13} />}
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="h-8 gap-1.5"
            >
              <Printer size={13} />
              Print
            </Button>
            {isDraft && !isPaid && (
              <Button
                size="sm"
                onClick={onSend}
                className="h-8 gap-1.5"
              >
                <Send size={13} />
                Send
              </Button>
            )}
            {!isPaid && (
              <Button
                size="sm"
                onClick={onMarkPaid}
                className="h-8 gap-1.5"
              >
                <Check size={13} />
                Mark Paid
              </Button>
            )}
            {isDraft && (
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="h-8 gap-1.5 text-destructive hover:text-destructive"
                aria-label="Delete invoice"
              >
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
        {editing && isDraft ? (
          <div className="rounded-none border bg-card p-4 shadow-sm space-y-4 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Edit invoice details</h3>
                <p className="text-xs text-muted-foreground">
                  Changes apply to this draft only. Send or mark paid to lock it.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onCancelEdit}
                aria-label="Cancel editing"
                className="h-8 w-8 shrink-0"
              >
                <X size={14} />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-inv-number">Invoice number</Label>
                <Input
                  id="edit-inv-number"
                  value={editDraft.invoice_number}
                  onChange={(e) => onEditDraftChange({ invoice_number: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-inv-client">Client</Label>
                <Select
                  value={editDraft.organization_id}
                  onValueChange={(v) => onEditDraftChange({ organization_id: v })}
                >
                  <SelectTrigger id="edit-inv-client">
                    <SelectValue placeholder="Select Client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Select Client</SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-inv-project">Project</Label>
                <Select
                  value={editDraft.project_id}
                  onValueChange={(v) => onEditDraftChange({ project_id: v })}
                >
                  <SelectTrigger id="edit-inv-project">
                    <SelectValue placeholder="Select Project (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No project</SelectItem>
                    {projectOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-inv-status">Status</Label>
                <Select
                  value={editDraft.status}
                  onValueChange={(v) =>
                    onEditDraftChange({ status: v as InvoiceDetailProps["editDraft"]["status"] })
                  }
                >
                  <SelectTrigger id="edit-inv-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-inv-issue">Issue date</Label>
                <Input
                  id="edit-inv-issue"
                  type="date"
                  value={editDraft.issue_date}
                  onChange={(e) => onEditDraftChange({ issue_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-inv-due">Due date</Label>
                <Input
                  id="edit-inv-due"
                  type="date"
                  value={editDraft.due_date}
                  onChange={(e) => onEditDraftChange({ due_date: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onCancelEdit}
                disabled={savingDetails}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={onSaveDetails}
                disabled={savingDetails || !editDraft.invoice_number.trim()}
                className="gap-1.5"
              >
                {savingDetails ? "Saving..." : <Save size={14} />}
                Save Details
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            <div className="rounded-none border bg-card px-3 py-2.5 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Bill To
              </span>
              <p className="mt-1 truncate text-sm font-medium text-foreground" title={invoice.client}>
                {invoice.client}
              </p>
            </div>
            <div className="rounded-none border bg-card px-3 py-2.5 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Project
              </span>
              <p className="mt-1 truncate text-sm font-medium text-foreground" title={invoice.project || "—"}>
                {invoice.project || "—"}
              </p>
            </div>
            <div className="rounded-none border bg-card px-3 py-2.5 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date Issued
              </span>
              <p className="mt-1 text-sm font-medium text-foreground">
                {formatDate(invoice.date)}
              </p>
              {invoice.dueDate && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Due {formatDate(invoice.dueDate)}
                </p>
              )}
            </div>
          </div>
        )}

        <LineItemsEditor
          items={items}
          onChange={onChange}
          onAdd={onAdd}
          onRemove={onRemove}
          showTotals={false}
        />

        <div className="space-y-4 print:hidden">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="inv-notes" className="text-xs font-medium">
                  Notes
                </Label>
                {notesChanged && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="h-6 text-[11px]"
                  >
                    {savingNotes ? "Saving..." : "Save"}
                  </Button>
                )}
              </div>
              <Textarea
                id="inv-notes"
                rows={2}
                value={draftNotes}
                onChange={(e) => {
                  setDraftNotes(e.target.value);
                  onNotesChange(e.target.value);
                }}
                placeholder="Add any notes visible to the client..."
                className="resize-y"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-terms" className="text-xs font-medium">
                Terms & Conditions
              </Label>
              <Textarea
                id="inv-terms"
                rows={2}
                value={terms}
                onChange={(e) => onTermsChange(e.target.value)}
                placeholder="Payment terms, late fees, etc."
                className="resize-y"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <div className="w-full max-w-sm rounded-none border bg-gradient-to-br from-primary/[0.06] via-muted/40 to-muted/20 px-4 py-3.5 shadow-sm sm:px-5 sm:py-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Summary
              </h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-medium tabular-nums">{formatCurrency(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">VAT (15%)</dt>
                  <dd className="font-medium tabular-nums">{formatCurrency(vat)}</dd>
                </div>
              </dl>
              <Separator className="my-2.5" />
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-foreground">Amount Due</span>
                <span className="text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface InvoiceDraft {
  invoice_number: string;
  organization_id: string;
  project_id: string;
  issue_date: string;
  due_date: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  items: InvoiceLineItem[];
}

interface InvoicesPageProps {
  workspaceId: string;
}

function defaultInvoiceDates(): { issueDate: string; dueDate: string } {
  const now = Date.now();
  return {
    issueDate: new Date(now).toISOString().slice(0, 10),
    dueDate: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
}

function statusVariant(status: string) {
  switch (status.toLowerCase()) {
    case "paid":
      return "success";
    case "sent":
      return "default";
    case "overdue":
    case "cancelled":
      return "destructive";
    case "draft":
    default:
      return "secondary";
  }
}

export default function InvoicesPage({ workspaceId }: InvoicesPageProps) {
  const [invoices, setInvoices] = useState<UiInvoice[]>([]);
  const [filter, setFilter] = useState<"all" | "Draft" | "Sent" | "Paid" | "Overdue" | "Cancelled">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<
    "issued-desc" | "issued-asc" | "due-asc" | "amount-desc"
  >("issued-desc");
  const [activeInvoice, setActiveInvoice] = useState<UiInvoice | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [localItems, setLocalItems] = useState<InvoiceLineItem[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<UiInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingItems, setSavingItems] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editDraft, setEditDraft] = useState<InvoiceDraft["status"] extends string
    ? {
        invoice_number: string;
        organization_id: string;
        project_id: string;
        issue_date: string;
        due_date: string;
        status: InvoiceDraft["status"];
      }
    : never>({
    invoice_number: "",
    organization_id: "",
    project_id: "",
    issue_date: "",
    due_date: "",
    status: "draft",
  });
  const [savingDetails, setSavingDetails] = useState(false);

  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [projectOptions, setProjectOptions] = useState<{ id: string; name: string }[]>([]);

  const [draftInvoice, setDraftInvoice] = useState<InvoiceDraft>(() => {
    const { issueDate, dueDate } = defaultInvoiceDates();
    return {
      invoice_number: "",
      organization_id: "",
      project_id: "",
      issue_date: issueDate,
      due_date: dueDate,
      status: "draft",
      items: [{ id: "new-1", description: "", qty: 1, unit: "Lump Sum", rate: 0 }],
    };
  });
  const [formNotes, setFormNotes] = useState("");

  const { profile, setProfile } = useBusinessProfile();
  const { defaults, setTheme, setTerms } = useDocumentDefaults();
  const [businessDialogOpen, setBusinessDialogOpen] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      setError(null);
      const rows = await listInvoices(workspaceId);
      const mapped: UiInvoice[] = [];
      for (const row of rows) {
        const detail = await getInvoiceWithItems(row.id);
        mapped.push(mapInvoiceRowToUi(row, detail?.items ?? []));
      }
      setInvoices(mapped);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(fetchInvoices, [fetchInvoices]);

  const loadFormOptions = useCallback(async () => {
    const [orgs, projs] = await Promise.all([
      listOrganizations(workspaceId),
      listProjects(workspaceId),
    ]);
    setOrganizations(orgs);
    setProjectOptions(projs.map((p) => ({ id: p.id, name: p.name })));
  }, [workspaceId]);

  useAsyncAction(loadFormOptions, [loadFormOptions]);

  const calcTotal = (items: InvoiceLineItem[]) =>
    items.reduce((s, item) => s + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0);

  const formatCurrency = (value: number) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (isoDate: string | null | undefined) => {
    if (!isoDate) return "—";
    return new Date(isoDate).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const escapeCsv = (value: string | number | null | undefined) => {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
    return str;
  };

  const downloadInvoicesCsv = () => {
    const rows = sortedInvoices;
    if (rows.length === 0) return;
    const header = [
      "invoice_number",
      "client",
      "project",
      "status",
      "issued",
      "due",
      "subtotal",
      "vat",
      "total",
    ];
    const csvRows = rows.map((inv) => {
      const subtotal = calcTotal(inv.items);
      const vat = subtotal * 0.15;
      const total = subtotal + vat;
      return [
        inv.id,
        inv.client,
        inv.project,
        inv.status,
        inv.date,
        inv.dueDate ?? "",
        subtotal.toFixed(2),
        vat.toFixed(2),
        total.toFixed(2),
      ]
        .map(escapeCsv)
        .join(",");
    });
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredByStatus =
    filter === "all" ? invoices : invoices.filter((i) => i.status === filter);
  const searchQuery = search.trim().toLowerCase();
  const filtered = filteredByStatus.filter(
    (inv) =>
      !searchQuery ||
      inv.id.toLowerCase().includes(searchQuery) ||
      inv.client.toLowerCase().includes(searchQuery) ||
      inv.project.toLowerCase().includes(searchQuery),
  );

  const sortedInvoices = [...filtered].sort((a, b) => {
    if (sortBy === "due-asc") {
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    }
    if (sortBy === "amount-desc") return calcTotal(b.items) - calcTotal(a.items);
    if (sortBy === "issued-asc")
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const totals = {
    outstanding: invoices
      .filter((i) => i.status === "Sent" || i.status === "Overdue")
      .reduce((s, i) => s + calcTotal(i.items), 0),
    overdue: invoices
      .filter((i) => i.status === "Overdue")
      .reduce((s, i) => s + calcTotal(i.items), 0),
    collected: invoices
      .filter((i) => i.status === "Paid")
      .reduce((s, i) => s + calcTotal(i.items), 0),
  };

  // Sync local state to the active invoice.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setLocalItems(activeInvoice ? JSON.parse(JSON.stringify(activeInvoice.items)) : []);
      setEditingDetails(false);
      if (activeInvoice) setDetailOpen(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [activeInvoice]);

  const updateItem = (
    id: string,
    field: keyof InvoiceLineItem,
    value: string | number,
  ) => {
    setLocalItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const handleAddLineItem = () => {
    setLocalItems((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, description: "", qty: 1, unit: "Hours", rate: 0 },
    ]);
  };

  const handleRemoveLineItem = (id: string) => {
    setLocalItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveItems = async () => {
    if (!activeInvoice) return;
    setSavingItems(true);
    try {
      const cleaned = localItems
        .filter((item) => item.description.trim().length > 0)
        .map((item) => ({
          description: item.description.trim(),
          qty: Number(item.qty) || 0,
          rate: Number(item.rate) || 0,
          unit: item.unit || null,
        }));
      await saveInvoiceItems(workspaceId, activeInvoice.dbId, cleaned);
      await fetchInvoices();
      setSuccessMessage("Invoice items saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save items");
    } finally {
      setSavingItems(false);
    }
  };

  const markInvoicePaid = async () => {
    if (!activeInvoice) return;
    try {
      await updateInvoice(activeInvoice.dbId, {
        status: "paid",
        paid_at: new Date().toISOString(),
      });
      await fetchInvoices();
      setSuccessMessage("Invoice marked as paid.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to mark as paid");
    }
  };

  const sendInvoice = async () => {
    if (!activeInvoice) return;
    if (activeInvoice.status !== "Draft") return;
    try {
      await updateInvoice(activeInvoice.dbId, { status: "sent" });
      await fetchInvoices();
      setSuccessMessage("Invoice marked as sent.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleSaveNotes = async (notes: string) => {
    if (!activeInvoice) return;
    try {
      await updateInvoice(activeInvoice.dbId, { notes });
      await fetchInvoices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save notes");
    }
  };

  const handleStartEditDetails = () => {
    if (!activeInvoice) return;
    setEditDraft({
      invoice_number: activeInvoice.id,
      organization_id: activeInvoice.clientId ?? "",
      project_id: activeInvoice.projectId ?? "",
      issue_date: activeInvoice.date,
      due_date: activeInvoice.dueDate ?? "",
      status:
        (reverseStatus(activeInvoice.status) as InvoiceDraft["status"]) ?? "draft",
    });
    setEditingDetails(true);
  };

  const handleCancelEditDetails = () => {
    setEditingDetails(false);
    setEditDraft({
      invoice_number: "",
      organization_id: "",
      project_id: "",
      issue_date: "",
      due_date: "",
      status: "draft",
    });
  };

  const handleEditDraftChange = (
    patch: Partial<typeof editDraft>,
  ) => {
    setEditDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSaveDetails = async () => {
    if (!activeInvoice) return;
    const number = editDraft.invoice_number.trim();
    if (!number) {
      setError("Invoice number is required.");
      return;
    }
    setSavingDetails(true);
    try {
      await updateInvoice(activeInvoice.dbId, {
        invoice_number: number,
        organization_id: editDraft.organization_id || null,
        project_id: editDraft.project_id || null,
        issue_date: editDraft.issue_date,
        due_date: editDraft.due_date || null,
        status: editDraft.status,
      });
      setEditingDetails(false);
      await fetchInvoices();
      setSuccessMessage("Invoice details updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update invoice details");
    } finally {
      setSavingDetails(false);
    }
  };

  const openCreateForm = () => {
    setCreateError(null);
    setEditingInvoiceId(null);
    const { issueDate, dueDate } = defaultInvoiceDates();
    setDraftInvoice({
      invoice_number: "",
      organization_id: "",
      project_id: "",
      issue_date: issueDate,
      due_date: dueDate,
      status: "draft",
      items: [
        { id: `new-${Date.now()}`, description: "", qty: 1, unit: "Lump Sum", rate: 0 },
      ],
    });
    setFormNotes("");
    setIsCreateOpen(true);
  };

  const isEditing = editingInvoiceId !== null;

  const updateDraftItem = (
    id: string,
    field: keyof InvoiceLineItem,
    value: string | number,
  ) => {
    setDraftInvoice((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addDraftItem = () => {
    setDraftInvoice((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { id: `new-${Date.now()}`, description: "", qty: 1, unit: "Hours", rate: 0 },
      ],
    }));
  };

  const removeDraftItem = (id: string) => {
    setDraftInvoice((prev) => ({
      ...prev,
      items: prev.items.length === 1 ? prev.items : prev.items.filter((item) => item.id !== id),
    }));
  };

  const confirmDeleteInvoice = (invoice: UiInvoice) => {
    setInvoiceToDelete(invoice);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    try {
      await deleteInvoice(invoiceToDelete.dbId);
      if (activeInvoice?.dbId === invoiceToDelete.dbId) {
        setActiveInvoice(null);
      }
      setInvoiceToDelete(null);
      setDeleteConfirmOpen(false);
      await fetchInvoices();
      setSuccessMessage("Invoice deleted successfully.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete invoice");
      setDeleteConfirmOpen(false);
    }
  };

  const submitCreateInvoice = async () => {
    if (!draftInvoice.invoice_number.trim()) {
      setCreateError("Invoice number is required.");
      return;
    }

    const cleanedItems = draftInvoice.items
      .map((item) => ({ ...item, description: item.description.trim() }))
      .filter((item) => item.description.length > 0);

    if (cleanedItems.length === 0) {
      setCreateError("Add at least one line item description.");
      return;
    }

    try {
      if (isEditing && editingInvoiceId) {
        await updateInvoice(editingInvoiceId, {
          invoice_number: draftInvoice.invoice_number.trim(),
          organization_id: draftInvoice.organization_id || null,
          project_id: draftInvoice.project_id || null,
          issue_date: draftInvoice.issue_date,
          due_date: draftInvoice.due_date || null,
          status: draftInvoice.status,
          notes: formNotes || null,
        });
        await saveInvoiceItems(
          workspaceId,
          editingInvoiceId,
          cleanedItems.map((item) => ({
            description: item.description,
            qty: Number(item.qty) || 0,
            rate: Number(item.rate) || 0,
            unit: item.unit || null,
          })),
        );
      } else {
        await createInvoice(
          workspaceId,
          {
            invoice_number: draftInvoice.invoice_number.trim(),
            organization_id: draftInvoice.organization_id || null,
            project_id: draftInvoice.project_id || null,
            issue_date: draftInvoice.issue_date,
            due_date: draftInvoice.due_date || null,
            status: draftInvoice.status,
            notes: formNotes || null,
          },
          cleanedItems.map((item) => ({
            description: item.description,
            qty: Number(item.qty) || 0,
            rate: Number(item.rate) || 0,
            unit: item.unit || null,
          })),
        );
      }
      setIsCreateOpen(false);
      setEditingInvoiceId(null);
      setActiveInvoice(null);
      await fetchInvoices();
      setSuccessMessage(
        isEditing ? "Invoice updated successfully." : "Invoice created successfully.",
      );
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to save invoice");
    }
  };

  if (loading) {
    return (
      <div className="hub-body invoices-page p-6">
        <PageLoader />
      </div>
    );
  }

  if (isCreateOpen) {
    return (
      <PageForm
        title={isEditing ? "Edit Invoice" : "Create Invoice"}
        description={
          isEditing
            ? "Update the invoice details and line items."
            : "Issue a new invoice to a client."
        }
        onBack={() => {
          setIsCreateOpen(false);
          setEditingInvoiceId(null);
        }}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateOpen(false);
                setEditingInvoiceId(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={submitCreateInvoice}>
              {isEditing ? "Save Changes" : "Create Invoice"}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* ── Invoice Details ──────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ClipboardList size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Invoice Details</h3>
                <p className="text-[11px] text-muted-foreground">Basic information and scheduling.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-number">Invoice number</Label>
                  <Input
                    id="inv-number"
                    placeholder="e.g. INV-2026-020"
                    value={draftInvoice.invoice_number}
                    onChange={(e) =>
                      setDraftInvoice((prev) => ({ ...prev, invoice_number: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Client</Label>
                  <Select
                    value={draftInvoice.organization_id}
                    onValueChange={(v) =>
                      setDraftInvoice((prev) => ({ ...prev, organization_id: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Select Client</SelectItem>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Project</Label>
                  <Select
                    value={draftInvoice.project_id}
                    onValueChange={(v) =>
                      setDraftInvoice((prev) => ({ ...prev, project_id: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Select Project (optional)</SelectItem>
                      {projectOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-issue">Issue date</Label>
                  <Input
                    id="inv-issue"
                    type="date"
                    value={draftInvoice.issue_date}
                    onChange={(e) =>
                      setDraftInvoice((prev) => ({ ...prev, issue_date: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-due">Due date</Label>
                  <Input
                    id="inv-due"
                    type="date"
                    value={draftInvoice.due_date}
                    onChange={(e) =>
                      setDraftInvoice((prev) => ({ ...prev, due_date: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={draftInvoice.status}
                    onValueChange={(v) =>
                      setDraftInvoice((prev) => ({ ...prev, status: v as InvoiceDraft["status"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* ── Line Items ───────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600">
                <FileText size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Line items</h3>
                <p className="text-[11px] text-muted-foreground">Services and products included in this invoice.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <LineItemsEditor
                items={draftInvoice.items}
                onChange={updateDraftItem}
                onAdd={addDraftItem}
                onRemove={removeDraftItem}
              />
            </div>
          </div>

          {/* ── Additional Info ──────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
                <FileText size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Additional Information</h3>
                <p className="text-[11px] text-muted-foreground">Notes and terms visible to the client.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="create-inv-notes">Notes</Label>
                  <Textarea
                    id="create-inv-notes"
                    rows={3}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Notes visible to the client"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-inv-terms">Terms & Conditions</Label>
                  <Textarea
                    id="create-inv-terms"
                    rows={3}
                    value={defaults.terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="Payment terms, late fees, etc."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Total:</span>{" "}
            <strong>{formatCurrency(calcTotal(draftInvoice.items) * 1.15)}</strong>
          </div>
          {createError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {createError}
            </div>
          )}
        </div>
      </PageForm>
    );
  }

  if (businessDialogOpen) {
    return (
      <BusinessProfileDialog
        open={businessDialogOpen}
        onOpenChange={setBusinessDialogOpen}
        profile={profile}
        onSave={setProfile}
      />
    );
  }

  return (
    <DashboardShell className="hub-body invoices-page">
      <DashboardHeader
        title="Invoices"
        subtitle="Track payments, issue bills, and manage revenue"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DocumentThemeSelector
              value={defaults.theme}
              onChange={setTheme}
              className="w-[130px]"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBusinessDialogOpen(true)}
              className="gap-1.5"
            >
              <Building2 size={14} />
              Business
            </Button>
            <Button
              variant="outline"
              onClick={downloadInvoicesCsv}
              disabled={sortedInvoices.length === 0}
              className="gap-2"
            >
              <Download size={16} />
              Export CSV
            </Button>
            <Button onClick={openCreateForm} className="gap-2">
              <Plus size={16} />
              Create Invoice
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <MetricStrip
        metrics={[
          {
            label: "Outstanding",
            value: formatCurrency(totals.outstanding),
            subtext: "unpaid invoices",
            accentColor: "#f59e0b",
            icon: <FileText size={18} />,
          },
          {
            label: "Overdue",
            value: formatCurrency(totals.overdue),
            subtext: "past due",
            accentColor: "#ef4444",
            icon: <CalendarDays size={18} />,
          },
          {
            label: "Collected",
            value: formatCurrency(totals.collected),
            subtext: "paid invoices",
            accentColor: "#22c55e",
            icon: <Check size={18} />,
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "Draft", "Sent", "Paid", "Overdue", "Cancelled"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All Invoices" : f}
          </Button>
        ))}
        <div className="relative w-full sm:flex-1 sm:min-w-0 max-w-md">
          <Input
            type="search"
            placeholder="Search invoice, client, project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="issued-desc">Newest issued</SelectItem>
            <SelectItem value="issued-asc">Oldest issued</SelectItem>
            <SelectItem value="due-asc">Due soonest</SelectItem>
            <SelectItem value="amount-desc">Highest amount</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="h-[min(600px,calc(100vh-22rem))] overflow-hidden rounded-none border border-border/60 bg-card">
        <div className="h-full overflow-y-auto">
          {sortedInvoices.map((inv) => {
            const sum = calcTotal(inv.items);
            return (
              <button
                key={inv.dbId}
                type="button"
                onClick={() => setActiveInvoice(inv)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors hover:bg-muted/50",
                  activeInvoice?.dbId === inv.dbId && "bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold truncate" title={inv.id}>{inv.id}</span>
                  <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate" title={inv.client}>{inv.client}</div>
                <div className="text-xs text-muted-foreground truncate" title={inv.project}>{inv.project}</div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-muted-foreground">{formatDate(inv.date)}</span>
                  <span
                    className={cn(
                      "font-semibold",
                      inv.status === "Paid" && "text-emerald-600",
                      inv.status === "Overdue" && "text-red-600",
                    )}
                  >
                    {formatCurrency(sum)}
                  </span>
                </div>
              </button>
            );
          })}
          {sortedInvoices.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {invoices.length === 0 ? "No invoices yet" : "No invoices match"}
              </p>
              <p>
                {invoices.length === 0
                  ? "Create your first invoice to start tracking revenue."
                  : "Try adjusting your filters or search."}
              </p>
              {invoices.length === 0 && (
                <Button onClick={openCreateForm} className="mt-4">
                  Create Invoice
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent
          className="max-w-3xl gap-0 p-0 sm:max-w-3xl sm:rounded-xl max-h-[calc(100dvh-2rem)]"
          disableAnimation
        >
          <DialogTitle className="sr-only">Invoice details</DialogTitle>
          {activeInvoice && (
            <InvoiceDetail
              key={activeInvoice.dbId}
              invoice={activeInvoice}
              items={localItems}
              savingItems={savingItems}
              business={profile}
              theme={defaults.theme}
              terms={defaults.terms}
              editing={editingDetails}
              editDraft={editDraft}
              savingDetails={savingDetails}
              organizations={organizations}
              projectOptions={projectOptions}
              onChange={updateItem}
              onAdd={handleAddLineItem}
              onRemove={handleRemoveLineItem}
              onSaveItems={handleSaveItems}
              onMarkPaid={markInvoicePaid}
              onDelete={() => confirmDeleteInvoice(activeInvoice)}
              onNotesChange={() => {
                /* Notes are owned by InvoiceDetail's local state. */
              }}
              onSaveNotes={handleSaveNotes}
              onTermsChange={setTerms}
              onStartEdit={handleStartEditDetails}
              onCancelEdit={handleCancelEditDetails}
              onEditDraftChange={handleEditDraftChange}
              onSaveDetails={handleSaveDetails}
              onSend={sendInvoice}
            />
          )}
        </DialogContent>
      </Dialog>

      <DialogTemplate
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Invoice?"
        description={`This will permanently remove ${invoiceToDelete?.id ?? "this invoice"} and all its line items. This action cannot be undone.`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteInvoice}>
              Delete
            </Button>
          </>
        }
      >
        <></>
      </DialogTemplate>

      <BusinessProfileDialog
        open={businessDialogOpen}
        onOpenChange={setBusinessDialogOpen}
        profile={profile}
        onSave={setProfile}
      />

      <SuccessDialog
        open={!!successMessage}
        onOpenChange={() => setSuccessMessage(null)}
        message={successMessage ?? ""}
      />
    </DashboardShell>
  );
}
