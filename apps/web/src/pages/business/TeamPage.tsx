import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Users,
  UserCheck,
  MailOpen,
  Tag,
  Plus,
  Mail,
  Phone,
  X,
  Search,
  Loader2,
} from "lucide-react";

import PageLoader from "@/components/PageLoader.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PageForm } from "@/components/templates/PageForm.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { DashboardHeader, DashboardShell } from "@/components/dashboard/DashboardShell.tsx";
import { MetricStrip } from "@/components/dashboard/MetricStrip.tsx";


import { listWorkspaceMembers } from "../../lib/repositories/workspaceMembers.ts";
import type { WorkspaceMemberWithProfile } from "../../lib/repositories/workspaceMembers.ts";
import {
  inviteWorkspaceMember,
  listWorkspaceInvitations,
  type WorkspaceInvitationRow,
} from "../../lib/repositories/invitations.ts";
import { getMyWorkspaceMembership } from "../../lib/repositories/workspaces.ts";
import { canManageTeam } from "../../lib/permissions.ts";

interface TeamPageProps {
  workspaceId: string;
}

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your teammate's email address.")
    .email("Enter a valid email address."),
  role: z.enum(["admin", "ops_manager", "finance", "sales", "technician", "viewer"]),
});

type InviteValues = z.infer<typeof inviteSchema>;

const inviteDefaults: InviteValues = { email: "", role: "viewer" };

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  ops_manager: "Ops Manager",
  finance: "Finance",
  sales: "Sales",
  technician: "Technician",
  viewer: "Viewer",
};

function statusVariant(status: string) {
  switch (status) {
    case "active":
      return "success";
    case "invited":
      return "default";
    case "suspended":
      return "secondary";
    default:
      return "secondary";
  }
}

function getAvatarUrl(name: string): string {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
    name,
  )}&radius=50&backgroundColor=e5e7eb&textColor=111827`;
}

export default function TeamPage({ workspaceId }: TeamPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberWithProfile[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceInvitationRow[]>([]);
  const [search, setSearch] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [membersPage, setMembersPage] = useState(1);
  const [invitesPage, setInvitesPage] = useState(1);
  const [myRole, setMyRole] = useState<string | null>(null);
  const inviteForm = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: inviteDefaults,
  });
  const inviting = inviteForm.formState.isSubmitting;
  const inviteEmail = inviteForm.watch("email");
  const inviteRole = inviteForm.watch("role");

  const fetchMembers = useCallback(async () => {
    try {
      setError(null);
      const [data, invites] = await Promise.all([
        listWorkspaceMembers(workspaceId),
        listWorkspaceInvitations(workspaceId),
      ]);
      setMembers(data);
      setPendingInvitations(invites);
      const membership = await getMyWorkspaceMembership(workspaceId);
      setMyRole(membership?.role ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load team members");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(fetchMembers, [fetchMembers]);

  const totalPersonnel = members.length;
  const activeCount = members.filter((m) => m.status === "active").length;
  const invitedCount = members.filter((m) => m.status === "invited").length;
  const promoCodeCount = members.filter((m) => m.promo_code).length;

  const filteredMembers = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [m.full_name, m.professional_title, m.promo_code, m.role, m.work_email]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const canInvite = canManageTeam(
    myRole as
      | "owner"
      | "admin"
      | "ops_manager"
      | "finance"
      | "sales"
      | "technician"
      | "viewer"
      | null,
  );

  const membersPageSize = 10;
  const invitesPageSize = 8;
  const totalMembersPages = Math.max(1, Math.ceil(filteredMembers.length / membersPageSize));
  const totalInvitesPages = Math.max(1, Math.ceil(pendingInvitations.length / invitesPageSize));
  const effectiveMembersPage = Math.min(membersPage, totalMembersPages);
  const effectiveInvitesPage = Math.min(invitesPage, totalInvitesPages);
  const paginatedMembers = filteredMembers.slice(
    (effectiveMembersPage - 1) * membersPageSize,
    effectiveMembersPage * membersPageSize,
  );
  const paginatedInvitations = pendingInvitations.slice(
    (effectiveInvitesPage - 1) * invitesPageSize,
    effectiveInvitesPage * invitesPageSize,
  );

  const handleInvite = async (values: InviteValues) => {
    if (!canInvite) return;
    try {
      await inviteWorkspaceMember({
        workspaceId,
        email: values.email,
        role: values.role,
      });
      inviteForm.reset(inviteDefaults);
      setShowInviteModal(false);
      await fetchMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to invite team member");
    }
  };

  const openInvite = () => {
    inviteForm.reset(inviteDefaults);
    setError(null);
    setShowInviteModal(true);
  };

  if (loading) {
    return (
      <div className="w-full max-w-full p-6">
        <PageLoader />
      </div>
    );
  }

  if (showInviteModal) {
    return (
      <PageForm
        title="Invite Team Member"
        description="Send an invitation to join this workspace."
        onBack={() => setShowInviteModal(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setShowInviteModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="team-invite-form" disabled={inviting}>
              {inviting && <Loader2 size={14} className="animate-spin mr-2" />}
              {inviting ? "Sending..." : "Send Invite"}
            </Button>
          </>
        }
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-6">
              {error ? (
                <ErrorNotice tone="danger" onDismiss={() => setError(null)}>
                  {error}
                </ErrorNotice>
              ) : null}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Mail size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">Member details</CardTitle>
                      <CardDescription>
                        Add a colleague to your workspace.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Form {...inviteForm}>
                    <form
                      id="team-invite-form"
                      onSubmit={inviteForm.handleSubmit(handleInvite)}
                      className="space-y-4"
                      noValidate
                    >
                      <FormField
                        control={inviteForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Email <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="colleague@company.com"
                                autoComplete="email"
                                inputMode="email"
                                autoFocus
                                disabled={inviting}
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              They&apos;ll receive an invitation link at this address.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={inviteForm.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Role</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={inviting}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select a role…" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent position="popper" sideOffset={4}>
                                <SelectItem value="viewer">Viewer</SelectItem>
                                <SelectItem value="technician">Technician</SelectItem>
                                <SelectItem value="sales">Sales</SelectItem>
                                <SelectItem value="finance">Finance</SelectItem>
                                <SelectItem value="ops_manager">Ops Manager</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              {canManageTeam(field.value)
                                ? "Manager access — can invite members and manage settings."
                                : "Standard access — can view and work on assigned records."}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </div>

            <aside className="h-fit space-y-6 lg:sticky lg:top-0">
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="text-base">Invite summary</CardTitle>
                  <CardDescription>Details at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Email</dt>
                      <dd className="truncate font-medium">
                        {inviteEmail || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Role</dt>
                      <dd className="truncate font-medium">
                        {roleLabels[inviteRole] ?? inviteRole}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Access</dt>
                      <dd className="font-medium">
                        {canManageTeam(inviteRole) ? "Manager" : "Standard"}
                      </dd>
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
      <DashboardHeader
        title="Team"
        subtitle="Personnel, certifications, and roles"
        actions={
          <Button onClick={openInvite} disabled={!canInvite} className="gap-2">
            <Plus size={16} />
            Add Member
          </Button>
        }
      />

      {!canInvite && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          You need admin permissions in a business workspace to invite team members.
        </div>
      )}

      {error ? (
        <ErrorNotice tone="danger" onDismiss={() => setError(null)}>
          {error}
        </ErrorNotice>
      ) : null}

      <MetricStrip
        metrics={[
          {
            label: "Total Personnel",
            value: totalPersonnel.toString(),
            tone: "purple",
            icon: <Users size={18} />,
          },
          {
            label: "Active",
            value: activeCount.toString(),
            tone: "success",
            icon: <UserCheck size={18} />,
          },
          {
            label: "Invited",
            value: invitedCount.toString(),
            tone: "info",
            icon: <MailOpen size={18} />,
          },
          {
            label: "With Promo Code",
            value: promoCodeCount.toString(),
            tone: "warning",
            icon: <Tag size={18} />,
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search personnel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {filteredMembers.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="py-10 text-center">
            <h3 className="text-base font-semibold">
              {members.length === 0 ? "No team members yet" : "No personnel found"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {members.length === 0
                ? "Invite your first team member to get started."
                : "Try adjusting your search criteria."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedMembers.map((m) => {
              const avatarName = m.full_name ?? m.work_email ?? "Unknown";
              return (
                <Card
                  key={m.id}
                  className="border-border/60 hover:shadow-sm transition-shadow"
                  tabIndex={0}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <img
                        src={getAvatarUrl(avatarName)}
                        alt={avatarName}
                        className="h-10 w-10 rounded-full object-cover border bg-muted"
                        onError={(e) => {
                          e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                            avatarName,
                          )}&background=e5e7eb&color=111827&size=64`;
                        }}
                      />
                      <Badge variant={statusVariant(m.status)} className="capitalize">
                        {m.status}
                      </Badge>
                    </div>
                    <h3 className="text-sm font-semibold truncate">
                      {m.full_name ?? "—"}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {roleLabels[m.role] ?? m.role}
                      {m.professional_title ? ` · ${m.professional_title}` : ""}
                    </p>
                    <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2 truncate">
                        <Mail size={13} />
                        <span className="truncate">{m.work_email ?? m.email ?? "—"}</span>
                      </div>
                      {m.work_phone && (
                        <div className="flex items-center gap-2 truncate">
                          <Phone size={13} />
                          <span>{m.work_phone}</span>
                        </div>
                      )}
                      {m.promo_code && (
                        <div className="flex items-center gap-2 truncate">
                          <Tag size={13} />
                          <span>
                            Promo: <code>{m.promo_code}</code>
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredMembers.length > membersPageSize && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={effectiveMembersPage <= 1}
                onClick={() => setMembersPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {effectiveMembersPage} / {totalMembersPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={effectiveMembersPage >= totalMembersPages}
                onClick={() => setMembersPage((p) => Math.min(totalMembersPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {pendingInvitations.length > 0 && (
        <Card className="border-border/60 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ResponsiveTable records>
              <Table className="min-w-[360px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Email</TableHead>
                    <TableHead className="w-[100px]">Role</TableHead>
                    <TableHead className="w-[120px]">Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedInvitations.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="align-middle" data-label="Email">
                        <span className="block truncate max-w-[220px]" title={invite.email}>
                          {invite.email}
                        </span>
                      </TableCell>
                      <TableCell className="align-middle whitespace-nowrap" data-label="Role">
                        {roleLabels[invite.role] ?? invite.role}
                      </TableCell>
                      <TableCell
                        className="align-middle whitespace-nowrap"
                        data-label="Expires"
                      >
                        {new Date(invite.expires_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ResponsiveTable>
            {pendingInvitations.length > invitesPageSize && (
              <div className="flex items-center justify-center gap-3 py-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={effectiveInvitesPage <= 1}
                  onClick={() => setInvitesPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {effectiveInvitesPage} / {totalInvitesPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={effectiveInvitesPage >= totalInvitesPages}
                  onClick={() => setInvitesPage((p) => Math.min(totalInvitesPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </DashboardShell>
  );
}
