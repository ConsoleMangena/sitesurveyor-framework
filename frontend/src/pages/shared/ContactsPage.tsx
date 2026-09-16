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
import PageLoader from "@/components/PageLoader.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Badge, type BadgeProps } from "../../components/ui/badge.tsx";
import { Card, CardContent } from "../../components/ui/card.tsx";
import { PageForm } from "../../components/templates/PageForm.tsx";
import { SuccessDialog } from "../../components/SuccessDialog.tsx";
import { Alert, AlertDescription } from "../../components/ui/alert.tsx";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
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

  const getAvatarColor = (name: string) => {
    const colors = ["#2563eb", "#059669", "#dc2626", "#d97706", "#7c3aed", "#db2777"];
    return colors[name.length % colors.length];
  };

  const stats = [
    { label: "Total Contacts", value: totalContacts, icon: Users },
    { label: "Active Clients", value: activeClients, icon: Building2 },
    { label: "Network Partners", value: networkPartners, icon: Handshake },
  ];

  if (loading) {
    return (
      <div className="hub-body">
        <PageLoader />
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
        <form id="contact-create-form" onSubmit={handleCreate} className="space-y-6">
          {/* ── Contact Identity ─────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Users size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Contact Identity</h3>
                <p className="text-[11px] text-muted-foreground">Basic information and organizational role.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="contact-name">Full name <span className="text-destructive">*</span></Label>
                <Input
                  id="contact-name"
                  placeholder="e.g. Jane Doe"
                  value={createForm.full_name}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, full_name: e.target.value }))
                  }
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-org">Organization</Label>
                  <Select
                    value={createForm.organization_id || "__none__"}
                    onValueChange={(val) =>
                      setCreateForm((f) => ({ ...f, organization_id: val === "__none__" ? "" : val }))
                    }
                  >
                    <SelectTrigger id="contact-org"><SelectValue placeholder="No organization" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No organization</SelectItem>
                      {organizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-title">Job title</Label>
                  <Input
                    id="contact-title"
                    placeholder="e.g. Project Manager"
                    value={createForm.title}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, title: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="contact-type">Contact type</Label>
                  <Select
                    value={createForm.contact_type}
                    onValueChange={(val) =>
                      setCreateForm((f) => ({ ...f, contact_type: val }))
                    }
                  >
                    <SelectTrigger id="contact-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTACT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* ── Contact Details ──────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600">
                <Mail size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Contact Details</h3>
                <p className="text-[11px] text-muted-foreground">Email and phone number for communication.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    placeholder="e.g. jane@example.com"
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, email: e.target.value }))
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
                      setCreateForm((f) => ({ ...f, phone: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          {createError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}
        </form>
      </PageForm>
    );
  }

  return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1>Directory</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage clients, subcontractors, and authorities
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Contact
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 py-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="relative flex-1 sm:max-w-xs">
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
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">No contacts found</p>
              <p className="text-sm text-muted-foreground">
                {contacts.length === 0
                  ? "Add your first contact to get started."
                  : "Try adjusting your search or filter criteria."}
              </p>
            </div>
            {contacts.length === 0 && (
              <Button onClick={() => setShowCreateModal(true)}>Add Contact</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const initials = c.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .substring(0, 2)
              .toUpperCase();
            const avatarColor = getAvatarColor(c.name);
            return (
              <Card key={c.id} className="flex flex-col transition-shadow hover:shadow-md">
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ background: avatarColor }}
                    >
                      {initials}
                    </div>
                    <Badge variant={typeVariant[c.type] ?? "secondary"}>{c.type}</Badge>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {[c.title, c.company].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="mt-auto space-y-2 text-sm text-muted-foreground">
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="flex items-center gap-2 hover:text-primary"
                      >
                        <Mail className="h-3.5 w-3.5" /> {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="flex items-center gap-2 hover:text-primary"
                      >
                        <Phone className="h-3.5 w-3.5" /> {c.phone}
                      </a>
                    )}
                    {c.lastContact && (
                      <span className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" /> {c.lastContact}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleArchive(c.dbId)}
                  >
                    Archive
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <SuccessDialog
        open={!!successMessage}
        onOpenChange={() => setSuccessMessage(null)}
        message={successMessage ?? ""}
      />
    </div>
  );
}
