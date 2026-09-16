import { useCallback, useMemo, useState } from "react";
import { RefreshCw, Search, Loader2, ShieldCheck, ShieldX } from "lucide-react";

import PageLoader from "@/components/PageLoader.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { SuccessDialog } from "@/components/SuccessDialog.tsx";
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

import {
  listAllProfiles,
  getProfileWithWorkspaces,
  togglePlatformAdmin,
  type AdminProfileRow,
  type AdminProfileWithWorkspaces,
} from "../../lib/repositories/adminPlatform.ts";

interface AdminUsersPageProps {
  isPlatformAdmin: boolean;
}

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
  } catch {
    return iso;
  }
}

export default function AdminUsersPage({
  isPlatformAdmin,
}: AdminUsersPageProps) {
  const [profiles, setProfiles] = useState<AdminProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterAdmin, setFilterAdmin] = useState<"all" | "admin" | "user">("all");
  const [page, setPage] = useState(1);

  const [detailUser, setDetailUser] = useState<AdminProfileWithWorkspaces | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listAllProfiles();
      setProfiles(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin]);

  useAsyncAction(load, [load]);

  const filtered = useMemo(() => {
    let result = profiles;
    if (filterAdmin === "admin") result = result.filter((p) => p.is_platform_admin);
    if (filterAdmin === "user") result = result.filter((p) => !p.is_platform_admin);
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          (p.full_name ?? "").toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q) ||
          (p.professional_title ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [profiles, query, filterAdmin]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages);
  const paginated = filtered.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE);

  const openDetail = async (userId: string) => {
    setDetailLoading(true);
    try {
      const data = await getProfileWithWorkspaces(userId);
      setDetailUser(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load user details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToggleAdmin = async () => {
    if (!detailUser) return;
    const newVal = !detailUser.is_platform_admin;
    const action = newVal ? "grant" : "revoke";
    if (
      !window.confirm(
        `${action.charAt(0).toUpperCase() + action.slice(1)} platform admin for ${
          detailUser.full_name ?? detailUser.email ?? detailUser.id
        }?`,
      )
    )
      return;

    setToggling(true);
    try {
      await togglePlatformAdmin(detailUser.id, newVal);
      setDetailUser({ ...detailUser, is_platform_admin: newVal });
      setSuccessMessage(`Platform admin ${action}d.`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${action} platform admin.`);
    } finally {
      setToggling(false);
    }
  };

  if (!isPlatformAdmin) return null;

  return (
    <DashboardShell className="hub-body admin-console-page">
      <DashboardHeader
        badge={<Badge variant="secondary">Platform admin</Badge>}
        title="User management"
        subtitle="View registered users and manage platform admin access"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search users"
            className="pl-9"
          />
        </div>
        <Select
          value={filterAdmin}
          onValueChange={(v) => setFilterAdmin(v as "all" | "admin" | "user")}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="admin">Platform admins</SelectItem>
            <SelectItem value="user">Regular users</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <PageLoader compact />
      ) : (
        <>
          <Card className="border-border/60 overflow-hidden">
            <CardContent className="p-0">
              <ResponsiveTable>
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[170px]">Name</TableHead>
                      <TableHead className="min-w-[220px]">Email</TableHead>
                      <TableHead className="min-w-[140px]">Title</TableHead>
                      <TableHead className="w-[110px]">Signup type</TableHead>
                      <TableHead className="w-[110px]">Admin</TableHead>
                      <TableHead className="w-[120px]">Joined</TableHead>
                      <TableHead className="w-[90px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center py-8 text-muted-foreground"
                        >
                          No users found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginated.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="align-middle font-medium">
                            <span className="block truncate max-w-[200px]" title={p.full_name || undefined}>
                              {p.full_name || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="align-middle text-muted-foreground">
                            <span className="block truncate max-w-[220px]" title={p.email ?? undefined}>
                              {p.email ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="align-middle">
                            <span className="block truncate max-w-[160px]" title={p.professional_title ?? undefined}>
                              {p.professional_title ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="align-middle whitespace-nowrap">
                            <Badge variant="outline">
                              {p.auth_signup_account_type ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-middle whitespace-nowrap">
                            {p.is_platform_admin ? (
                              <Badge
                                variant="purple"
                                className="inline-flex items-center gap-1"
                              >
                                <ShieldCheck size={12} />
                                Admin
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="align-middle text-muted-foreground whitespace-nowrap">
                            {formatDate(p.created_at)}
                          </TableCell>
                          <TableCell className="align-middle text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void openDetail(p.id)}
                              disabled={detailLoading}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ResponsiveTable>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={effectivePage <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {effectivePage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={effectivePage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <DialogTemplate
        open={!!detailUser}
        onOpenChange={(open) => !open && setDetailUser(null)}
        title="User detail"
        description="Workspace memberships and platform admin privileges."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setDetailUser(null)}>
              Close
            </Button>
            {detailUser && (
              <Button
                variant={detailUser.is_platform_admin ? "outline" : "default"}
                onClick={() => void handleToggleAdmin()}
                disabled={toggling}
                className="gap-2"
              >
                {toggling ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : detailUser.is_platform_admin ? (
                  <ShieldX size={16} />
                ) : (
                  <ShieldCheck size={16} />
                )}
                {detailUser.is_platform_admin ? "Revoke admin" : "Grant admin"}
              </Button>
            )}
          </>
        }
      >
        {detailLoading || !detailUser ? (
          <PageLoader compact />
        ) : (
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-base font-semibold">{detailUser.full_name || "Unnamed"}</p>
              <p className="text-sm text-muted-foreground">{detailUser.email ?? ""}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">Title</span>
                <p className="text-sm font-medium">{detailUser.professional_title ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Signup type</span>
                <p className="text-sm font-medium">
                  <Badge variant="outline">{detailUser.auth_signup_account_type ?? "—"}</Badge>
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Platform admin</span>
                <p className="text-sm font-medium">
                  {detailUser.is_platform_admin ? (
                    <Badge variant="purple">Yes</Badge>
                  ) : (
                    <Badge variant="secondary">No</Badge>
                  )}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Joined</span>
                <p className="text-sm font-medium">{formatDate(detailUser.created_at)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">
                Workspace memberships ({detailUser.workspaces.length})
              </h4>
              {detailUser.workspaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workspace memberships.</p>
              ) : (
                <ul className="divide-y border rounded-md">
                  {detailUser.workspaces.map((ws) => (
                    <li
                      key={ws.workspace_id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span>{ws.workspace_name}</span>
                      <Badge variant="outline">{ws.role}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogTemplate>

      <SuccessDialog
        open={!!successMessage}
        onOpenChange={() => setSuccessMessage(null)}
        message={successMessage ?? ""}
      />
    </DashboardShell>
  );
}
