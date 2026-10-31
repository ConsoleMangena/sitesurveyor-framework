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
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import {
  DashboardHeader,
  DashboardSection,
} from "@/components/dashboard/DashboardShell";
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
        badge={<Badge variant="secondary">Platform admin</Badge>}
        title="Platform overview"
        subtitle={format(new Date(), "EEEE, MMMM d, yyyy")}
        description="Every workspace, owner and account across SiteSurveyor."
        actions={
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
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
              <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </div>
        }
      />

      {loading && workspaces.length === 0 ? (
        <DashboardSkeleton kpis={4} rail={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <KpiCard
              title="Active workspaces"
              value={formatStat(stats.active)}
              subtext={`${stats.personal} personal · ${stats.business} business`}
              icon={<Briefcase className="size-4" />}
              tone="primary"
            />
            <KpiCard
              title="User profiles"
              value={userCount === null ? "—" : formatStat(userCount)}
              subtext="Registered accounts"
              icon={<Users className="size-4" />}
              tone="info"
            />
            <KpiCard
              title="Personal workspaces"
              value={formatStat(stats.personal)}
              subtext="Individual accounts"
              icon={<Users className="size-4" />}
              tone="success"
            />
            <KpiCard
              title="Business workspaces"
              value={formatStat(stats.business)}
              subtext="Organizations"
              icon={<Building2 className="size-4" />}
              tone="purple"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
            <KpiCard
              size="compact"
              title="Archived"
              value={formatStat(stats.archived)}
              icon={<Archive className="size-3.5" />}
              tone="neutral"
            />
            <KpiCard
              size="compact"
              title="New · 30 days"
              value={formatStat(stats.newIn30)}
              icon={<Sparkles className="size-3.5" />}
              tone="success"
            />
            <KpiCard
              size="compact"
              title="Owners labelled"
              value={formatStat(ownerLabels.size)}
              icon={<Users className="size-3.5" />}
              tone="info"
            />
            <KpiCard
              size="compact"
              title="Workspace total"
              value={formatStat(workspaces.length)}
              icon={<Briefcase className="size-3.5" />}
              tone="neutral"
            />
          </div>

          {/* Both cards take the full row: the growth trend reads better wide,
              and the workspace records clip beside anything narrower. */}
          <DashboardSection title="Growth & workspaces">
            <div className="flex flex-col gap-4 sm:gap-5">
              <WorkspaceGrowthChart workspaces={workspaces} />
              <RecentWorkspacesTable workspaces={workspaces} ownerLabels={ownerLabels} />
            </div>
          </DashboardSection>
        </>
      )}
    </>
  );
}
