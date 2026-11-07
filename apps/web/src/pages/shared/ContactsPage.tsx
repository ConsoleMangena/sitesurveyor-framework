import { useState, useCallback } from "react";
import {
  Users,
  Building2,
  Handshake,
  Search,
  X,
  Mail,
  Phone,
  Clock,
  Download,
  Plus,
} from "lucide-react";
import { listContacts, createContact, archiveContact } from "../../lib/repositories/contacts.ts";
import { listOrganizations } from "../../lib/repositories/organizations.ts";
import type { OrganizationRow } from "../../lib/repositories/organizations.ts";
import { mapContactRowToUi, type UiContact } from "../../lib/mappers.ts";
import { initialsOf } from "../../lib/initials";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Badge, type BadgeProps } from "../../components/ui/badge.tsx";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card.tsx";
import { MetricStrip } from "../../components/dashboard/MetricStrip.tsx";
import { DashboardHeader } from "../../components/dashboard/DashboardShell.tsx";
import { ComboboxField } from "../../components/templates/ComboboxField.tsx";
import { DialogTemplate } from "../../components/templates/DialogTemplate.tsx";
import { PageForm } from "../../components/templates/PageForm.tsx";
import { EntityFilesCard } from "../../components/files/EntityFilesCard";
import { SuccessDialog } from "../../components/SuccessDialog.tsx";
import { Alert, AlertDescription } from "../../components/ui/alert.tsx";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx";

interface ContactsPageProps {
  workspaceId: string;
}

const CONTACT_TYPES = ["Client", "Subcontractor", "Vendor", "Government", "Lead"] as const;

const typeVariant: Record<string, BadgeProps['variant']> = {
  Client: "default",
  Subcontractor: "secondary",
  Vendor: "outline",
  Government: "warning",
  Lead: "purple",
};

export default function ContactsPage({ workspaceId }: ContactsPageProps) {
  const [contacts, setContacts] = useState<UiContact[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<"All" | "Client" | "Subcontractor" | "Vendor" | "Government">("All");
  const [selectedContact, setSelectedContact] = useState<UiContact | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: "",
    organization_id: "",
    title: "",
    contact_type: "Client",
    email: "",
    phone: "",
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [rows, orgs] = await Promise.all([
        listContacts(workspaceId),
        listOrganizations(workspaceId),
      ]);
      setContacts(rows.map(mapContactRowToUi));
      setOrganizations(orgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(fetchContacts, [fetchContacts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createForm.full_name.trim();
    if (!name) {
      setCreateError("Name is required.");
      return;
    }

    setSaving(true);
    setCreateError(null);
    try {
      await createContact(workspaceId, {
        full_name: name,
        organization_id: createForm.organization_id || null,
        title: createForm.title || null,
        contact_type: createForm.contact_type || null,
        email: createForm.email || null,
        phone: createForm.phone || null,
      });
      setShowCreateModal(false);
      setCreateForm({
        full_name: "",
        organization_id: "",
        title: "",
        contact_type: "Client",
        email: "",
        phone: "",
      });
      await fetchContacts();
      setSuccessMessage("Contact created successfully.");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create contact.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (dbId: string) => {
    try {
      await archiveContact(dbId);
      await fetchContacts();
      setSuccessMessage("Contact archived successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive contact.");
    }
  };

  const totalContacts = contacts.length;
  const activeClients = contacts.filter((c) => c.type === "Client").length;
  const networkPartners = contacts.filter(
    (c) => c.type === "Vendor" || c.type === "Subcontractor",
  ).length;

  const filtered = contacts.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.company.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeFilter === "All" ? true : c.type === activeFilter;
    return matchesSearch && matchesTab;
  });

  const stats = [
    {
      label: "Total Contacts",
      value: String(totalContacts),
      tone: "primary" as const,
      icon: <Users />,
    },
    {
      label: "Active Clients",
      value: String(activeClients),
      icon: <Building2 />,
    },
    {
      label: "Network Partners",
      value: String(networkPartners),
      icon: <Handshake />,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (showCreateModal) {
    return (
      <PageForm
        title="Add Contact"
        description="Create a new contact or client record."
        onBack={() => setShowCreateModal(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="contact-create-form" disabled={saving}>
              {saving ? "Saving..." : "Add Contact"}
            </Button>
          </>
        }
      >
        <form id="contact-create-form" onSubmit={handleCreate} className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-6">
              {/* ── Contact Identity ─────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <Users size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Contact identity
                      </CardTitle>
                      <CardDescription>
                        Basic information and organizational role.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-name">
                        Full name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="contact-name"
                        placeholder="e.g. Jane Doe"
                        value={createForm.full_name}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            full_name: e.target.value,
                          }))
                        }
                        autoFocus
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <ComboboxField
                          label="Organization"
                          value={createForm.organization_id}
                          onChange={(val) =>
                            setCreateForm((f) => ({
                              ...f,
                              organization_id: val,
                            }))
                          }
                          options={organizations.map((org) => ({
                            value: org.id,
                            label: org.name,
                          }))}
                          placeholder="No organization"
                          emptyText="No organizations found."
                          optional
                          optionalLabel="No organization"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="contact-title">Job title</Label>
                        <Input
                          id="contact-title"
                          placeholder="e.g. Project Manager"
                          value={createForm.title}
                          onChange={(e) =>
                            setCreateForm((f) => ({
                              ...f,
                              title: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="contact-type">Contact type</Label>
                        <Select
                          value={createForm.contact_type}
                          onValueChange={(val) =>
                            setCreateForm((f) => ({
                              ...f,
                              contact_type: val,
                            }))
                          }
                        >
                          <SelectTrigger id="contact-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTACT_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Contact Details ──────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <Mail size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Contact details
                      </CardTitle>
                      <CardDescription>
                        Email and phone number for communication.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-email">Email</Label>
                      <Input
                        id="contact-email"
                        type="email"
                        placeholder="e.g. jane@example.com"
                        value={createForm.email}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            email: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-phone">Phone</Label>
                      <Input
                        id="contact-phone"
                        placeholder="e.g. +1 234 567 8900"
                        value={createForm.phone}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            phone: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {createError && (
                <Alert variant="destructive">
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}
            </div>

            {/* ── Summary ───────────────────────────────────── */}
            <aside className="h-fit space-y-6 lg:sticky lg:top-0">
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="text-base">Contact details</CardTitle>
                  <CardDescription>Summary at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Organization</dt>
                      <dd className="truncate font-medium">
                        {createForm.organization_id
                          ? organizations.find(
                              (org) => org.id === createForm.organization_id
                            )?.name || createForm.organization_id
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Job title</dt>
                      <dd className="truncate font-medium">
                        {createForm.title || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="truncate font-medium">
                        {createForm.contact_type || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Email</dt>
                      <dd className="truncate font-medium">
                        {createForm.email || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd className="truncate font-medium">
                        {createForm.phone || "—"}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </aside>
          </div>
        </form>
      </PageForm>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DashboardHeader
        title="Contacts"
        badge={<Badge variant="secondary">Directory</Badge>}
        subtitle="Manage clients, subcontractors, and authorities"
        meta={`${totalContacts} ${totalContacts === 1 ? "contact" : "contacts"}`}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" /> Add Contact
            </Button>
          </>
        }
      />

      <MetricStrip metrics={stats} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={activeFilter}
          onValueChange={(value) =>
            setActiveFilter(value as typeof activeFilter)
          }
        >
          <TabsList className="h-auto flex-wrap">
            {["All", "Client", "Subcontractor", "Vendor", "Government"].map((tab) => (
              <TabsTrigger key={tab} value={tab} className="text-xs sm:text-sm">
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchTerm && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchTerm("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon" aria-hidden="true">
              <Users className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No contacts found</EmptyTitle>
            <EmptyDescription>
              {contacts.length === 0
                ? "Add your first contact to get started."
                : "Try adjusting your search or filter criteria."}
            </EmptyDescription>
          </EmptyHeader>
          {contacts.length === 0 && (
            <EmptyContent>
              <Button onClick={() => setShowCreateModal(true)}>Add Contact</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const initials = initialsOf(c.name);
            return (
              <Card
                key={c.id}
                className="flex cursor-pointer flex-col transition-colors hover:bg-muted/40"
                onClick={() => setSelectedContact(c)}
              >
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary"
                    >
                      {initials}
                    </div>
                    <Badge variant={typeVariant[c.type] ?? "secondary"}>{c.type}</Badge>
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">{c.name}</h3>
                    <p className="truncate text-sm text-muted-foreground">
                      {[c.title, c.company].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="mt-auto space-y-2 text-sm text-muted-foreground">
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="flex min-w-0 items-center gap-2 hover:text-primary"
                      >
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </a>
                    )}
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="flex min-w-0 items-center gap-2 hover:text-primary"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{c.phone}</span>
                      </a>
                    )}
                    {c.lastContact && (
                      <span className="flex min-w-0 items-center gap-2">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{c.lastContact}</span>
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleArchive(c.dbId);
                    }}
                  >
                    Archive
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DialogTemplate
        open={!!selectedContact}
        onOpenChange={(open) => { if (!open) setSelectedContact(null); }}
        title={selectedContact?.name ?? "Contact Details"}
        description={selectedContact ? `${selectedContact.type} · ${[selectedContact.title, selectedContact.company].filter(Boolean).join(" · ")}` : undefined}
        icon={
          selectedContact ? (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary"
            >
              {selectedContact.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .substring(0, 2)
                .toUpperCase()}
            </div>
          ) : null
        }
        size="screen"
      >
        {selectedContact && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
            <div className="min-w-0 space-y-4">
            <div className="rounded-lg border p-4 text-sm">
              <div className="flex items-baseline justify-between gap-4 py-1.5">
                <span className="shrink-0 text-muted-foreground">Type</span>
                <Badge variant={typeVariant[selectedContact.type] ?? "secondary"}>{selectedContact.type}</Badge>
              </div>
              {selectedContact.email && (
                <div className="flex items-baseline justify-between gap-4 py-1.5">
                  <span className="shrink-0 text-muted-foreground">Email</span>
                  <a href={`mailto:${selectedContact.email}`} className="min-w-0 break-all text-right font-medium text-primary hover:underline">{selectedContact.email}</a>
                </div>
              )}
              {selectedContact.phone && (
                <div className="flex items-baseline justify-between gap-4 py-1.5">
                  <span className="shrink-0 text-muted-foreground">Phone</span>
                  <a href={`tel:${selectedContact.phone}`} className="min-w-0 break-words text-right font-medium text-primary hover:underline">{selectedContact.phone}</a>
                </div>
              )}
              {selectedContact.title && (
                <div className="flex items-baseline justify-between gap-4 py-1.5">
                  <span className="shrink-0 text-muted-foreground">Title</span>
                  <span className="min-w-0 break-words text-right font-medium text-foreground">{selectedContact.title}</span>
                </div>
              )}
              {selectedContact.company && (
                <div className="flex items-baseline justify-between gap-4 py-1.5">
                  <span className="shrink-0 text-muted-foreground">Company</span>
                  <span className="min-w-0 break-words text-right font-medium text-foreground">{selectedContact.company}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-4 py-1.5">
                <span className="shrink-0 text-muted-foreground">Last Contact</span>
                <span className="min-w-0 break-words text-right font-medium text-foreground">{selectedContact.lastContact}</span>
              </div>
            </div>
            </div>

            <div className="min-w-0 space-y-4">
            <EntityFilesCard
              workspaceId={workspaceId}
              entityTable="contacts"
              entityId={selectedContact.dbId}
              title="Contact Files"
              description="Documents, agreements and reference files for this contact."
            />
            </div>
          </div>
        )}
      </DialogTemplate>

      <SuccessDialog
        open={!!successMessage}
        onOpenChange={() => setSuccessMessage(null)}
        message={successMessage ?? ""}
      />
    </div>
  );
}
