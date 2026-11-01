import * as React from "react";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import {
  Archive,
  Building2,
  Briefcase,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import type { WorkspaceRowAdmin } from "@/lib/repositories/adminPlatform";

import { RecentWorkspacesTable } from "./recent-workspaces-table";
import { WorkspaceGrowthChart } from "./workspace-growth-chart";

interface AdminPlatformDashboardProps {
  workspaces: WorkspaceRowAdmin[];
  userCount: number | null;
  ownerLabels: Map<string, string>;
  loading: boolean;
  lastRefreshed: Date | null;
  onRefresh: () => void;
}

function formatStat(n: number): string {
  return n.toLocaleString();
}

export function AdminPlatformDashboard({
  workspaces,
  userCount,
  ownerLabels,
  loading,
  lastRefreshed,
  onRefresh,
}: AdminPlatformDashboardProps) {
  const stats = React.useMemo(() => {
    const active = workspaces.filter((w) => !w.archived_at);
    const newIn30 = workspaces.filter(
      (w) => differenceInCalendarDays(new Date(), parseISO(w.created_at)) <= 30,
    ).length;
    return {
      active: active.length,
      archived: workspaces.length - active.length,
      personal: active.filter((w) => w.type === "personal").length,
      business: active.filter((w) => w.type === "business").length,
      newIn30,
    };
  }, [workspaces]);

  return (
    <>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            Platform overview
            <Badge variant="secondary">Platform admin</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
          <p className="text-xs text-muted-foreground">
            Every workspace, owner and account across SiteSurveyor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && !loading ? (
            <span className="text-xs text-muted-foreground">
              Refreshed{" "}
              {lastRefreshed.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onRefresh()}
            disabled={loading}
            className="w-full gap-2 sm:w-auto"
          >
            <RefreshCw
              className={`h-4 w-4${loading ? " animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {loading && workspaces.length === 0 ? (
        <DashboardSkeleton kpis={4} rail={4} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Active workspaces
                </CardTitle>
                <Briefcase className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatStat(stats.active)}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.personal} personal · {stats.business} business
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">User profiles</CardTitle>
                <Users className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {userCount === null ? "—" : formatStat(userCount)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Registered accounts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Personal workspaces
                </CardTitle>
                <Users className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatStat(stats.personal)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Individual accounts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Business workspaces
                </CardTitle>
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatStat(stats.business)}
                </div>
                <p className="text-xs text-muted-foreground">Organizations</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Archive className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Archived
                  </p>
                  <p className="text-xl font-bold">{formatStat(stats.archived)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    New · 30 days
                  </p>
                  <p className="text-xl font-bold">{formatStat(stats.newIn30)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Users className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Owners labelled
                  </p>
                  <p className="text-xl font-bold">
                    {formatStat(ownerLabels.size)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Briefcase className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Workspace total
                  </p>
                  <p className="text-xl font-bold">
                    {formatStat(workspaces.length)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Both cards take the full row: the growth trend reads better wide,
              and the workspace records clip beside anything narrower. */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Growth &amp; workspaces
            </h2>
            <div className="flex flex-col gap-4 sm:gap-5">
              <WorkspaceGrowthChart workspaces={workspaces} />
              <RecentWorkspacesTable workspaces={workspaces} ownerLabels={ownerLabels} />
            </div>
          </section>
        </>
      )}
    </>
  );
}
