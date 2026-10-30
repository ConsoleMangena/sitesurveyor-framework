import * as React from "react";
import { format } from "date-fns";
import { Building2, Briefcase, RefreshCw, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { KpiCard } from "@/components/dashboard/KpiCard";
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
    return {
      active: active.length,
      archived: workspaces.length - active.length,
      personal: active.filter((w) => w.type === "personal").length,
      business: active.filter((w) => w.type === "business").length,
    };
  }, [workspaces]);

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Platform overview</h1>
          <p className="text-muted-foreground text-sm">
            {format(new Date(), "EEEE, MMMM do, yyyy")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lastRefreshed && !loading ? (
            <span className="text-xs text-muted-foreground">
              Last refreshed: {lastRefreshed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void onRefresh()} disabled={loading} className="gap-2">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:col-span-12">
          <KpiCard
            title="Active workspaces"
            value={formatStat(stats.active)}
            subtext={stats.archived > 0 ? `${formatStat(stats.archived)} archived` : "No archived workspaces"}
            icon={<Briefcase className="size-4 text-foreground" />}
          />
          <KpiCard
            title="User profiles"
            value={userCount === null ? "—" : formatStat(userCount)}
            subtext="Registered accounts"
            icon={<Users className="size-4 text-foreground" />}
          />
          <KpiCard
            title="Personal workspaces"
            value={formatStat(stats.personal)}
            subtext="Individual accounts"
            icon={<Users className="size-4 text-foreground" />}
          />
          <KpiCard
            title="Business workspaces"
            value={formatStat(stats.business)}
            subtext="Organizations"
            icon={<Building2 className="size-4 text-foreground" />}
          />
        </div>

        <div className="xl:col-span-12">
          <Badge variant="secondary" className="mb-2">Platform admin</Badge>
          <Separator className="mb-4" />
        </div>

        <div className="xl:col-span-5">
          <WorkspaceGrowthChart workspaces={workspaces} />
        </div>

        <div className="xl:col-span-7">
          <RecentWorkspacesTable workspaces={workspaces} ownerLabels={ownerLabels} />
        </div>
      </div>
    </div>
  );
}
