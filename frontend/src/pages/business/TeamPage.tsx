import { useState, useCallback } from "react";
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
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
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
  const [inviting, setInviting] = useState(false);
  const [membersPage, setMembersPage] = useState(1);
  const [invitesPage, setInvitesPage] = useState(1);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "viewer" as "admin" | "ops_manager" | "finance" | "sales" | "technician" | "viewer",
  });

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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canInvite) return;
    setInviting(true);
    try {
      await inviteWorkspaceMember({
        workspaceId,
        email: inviteForm.email,
        role: inviteForm.role,
      });
      setInviteForm({ email: "", role: "viewer" });
      setShowInviteModal(false);
      await fetchMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to invite team member");
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <div className="hub-body ast-body team-page p-6">
        <PageLoader />
      </div>
    );
  }

  return (
    <DashboardShell className="hub-body ast-body team-page">
      <DashboardHeader
        title="Team"
        subtitle="Personnel, certifications, and roles"
        actions={
          <Button onClick={() => setShowInviteModal(true)} disabled={!canInvite} className="gap-2">
            <Plus size={16} />
            Add Member
          </Button>
        }
      />

      {!canInvite && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You need admin permissions in a business workspace to invite team members.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <MetricStrip
        metrics={[
          {
            label: "Total Personnel",
            value: totalPersonnel.toString(),
            subtext: "workspace members",
            accentColor: "#8b5cf6",
            icon: <Users size={18} />,
          },
          {
            label: "Active",
            value: activeCount.toString(),
            subtext: "active members",
            accentColor: "#22c55e",
            icon: <UserCheck size={18} />,
          },
          {
            label: "Invited",
            value: invitedCount.toString(),
            subtext: "pending invites",
            accentColor: "#3b82f6",
            icon: <MailOpen size={18} />,
          },
          {
            label: "With Promo Code",
            value: promoCodeCount.toString(),
            subtext: "referred members",
            accentColor: "#f59e0b",
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
            <ResponsiveTable>
              <Table className="min-w-[360px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Email</TableHead>
                    <TableHead className="w-[100px]">Role</TableHead>
                    <TableHead className="hidden sm:table-cell w-[120px]">Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedInvitations.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="align-middle">
                        <span className="block truncate max-w-[220px]" title={invite.email}>
                          {invite.email}
                        </span>
                      </TableCell>
                      <TableCell className="align-middle whitespace-nowrap">
                        {roleLabels[invite.role] ?? invite.role}
                      </TableCell>
                      <TableCell className="align-middle hidden sm:table-cell whitespace-nowrap">
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

      <DialogTemplate
        open={showInviteModal}
        onOpenChange={(open) => !open && setShowInviteModal(false)}
        title="Invite Team Member"
        description="Send an invitation to join this workspace."
        size="md"
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
        <form id="team-invite-form" onSubmit={handleInvite} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={inviteForm.email}
              onChange={(e) =>
                setInviteForm((prev) => ({ ...prev, email: e.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={inviteForm.role}
              onValueChange={(val) =>
                setInviteForm((prev) => ({
                  ...prev,
                  role: val as typeof inviteForm.role,
                }))
              }
            >
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue placeholder="Select a role…" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="technician">Technician</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="finance">Finance</SelectItem>
                <SelectItem value="ops_manager">Ops Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
      </DialogTemplate>
    </DashboardShell>
  );
}
