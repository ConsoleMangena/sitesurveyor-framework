import * as React from "react";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { Archive, Briefcase, RefreshCw, Sparkles, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DashboardHeader,
  DashboardSection,
} from "@/components/dashboard/DashboardShell";
import { KpiCard, KpiGrid } from "@/components/dashboard/KpiCard";
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
      <DashboardHeader
        className="mb-2"
        title="Platform overview"
        badge={<Badge variant="secondary">Platform admin</Badge>}
        description="Every workspace, owner and account across SiteSurveyor."
        subtitle={format(new Date(), "EEEE, MMMM d, yyyy")}
        actions={
          <>
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
          </>
        }
      />

      {loading && workspaces.length === 0 ? (
        <DashboardSkeleton kpis={4} />
      ) : (
        <>
          <KpiGrid>
            <KpiCard
              title="Active workspaces"
              value={formatStat(stats.active)}
              subtext={`${formatStat(stats.personal)} personal · ${formatStat(
                stats.business,
              )} business`}
              tone="primary"
              icon={<Briefcase className="h-4 w-4" />}
            />
            <KpiCard
              title="User profiles"
              value={userCount === null ? "—" : formatStat(userCount)}
              icon={<Users className="h-4 w-4" />}
            />
            <KpiCard
              title="New · 30 days"
              value={formatStat(stats.newIn30)}
              tone="success"
              icon={<Sparkles className="h-4 w-4" />}
            />
            <KpiCard
              title="Archived"
              value={formatStat(stats.archived)}
              icon={<Archive className="h-4 w-4" />}
            />
          </KpiGrid>

          {/* Both cards take the full row: the growth trend reads better wide,
              and the workspace records clip beside anything narrower. */}
          <DashboardSection title="Growth & workspaces">
            <div className="flex flex-col gap-4 sm:gap-5">
              <WorkspaceGrowthChart workspaces={workspaces} />
              <RecentWorkspacesTable
                workspaces={workspaces}
                ownerLabels={ownerLabels}
              />
            </div>
          </DashboardSection>
        </>
      )}
    </>
  );
}
