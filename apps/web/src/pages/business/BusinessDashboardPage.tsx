import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  DollarSign,
  FileCheck,
  Gauge,
  Plus,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DashboardHeader,
  DashboardShell,
  PanelMeta,
} from "@/components/dashboard/DashboardShell";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { KpiCard, KpiGrid } from "@/components/dashboard/KpiCard";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { Overview, type OverviewDataPoint } from "@/components/dashboard/Overview";
import { RecentSales, type RecentSaleItem } from "@/components/dashboard/RecentSales";
import { ProjectStatusChart } from "@/components/dashboard/ProjectStatusChart";
import { ProjectTimelineChart } from "@/components/dashboard/ProjectTimelineChart";
import { RecentProjectsTable } from "@/components/dashboard/RecentProjectsTable";
import { TodaysSchedule } from "@/components/dashboard/TodaysSchedule";
import MarketGlobeCard from "../../components/market/MarketGlobeCard";
import ExtensionsCard from "../../components/dashboard/ExtensionsCard";
import { DatabaseStorageCard } from "@/components/dashboard/DatabaseStorageCard";

import { listProjects, type ProjectWithOrg } from "../../lib/repositories/projects";
import { listInvoices, type InvoiceWithDetails } from "../../lib/repositories/invoices";
import { listJobEvents, type JobEventRow } from "../../lib/repositories/jobEvents";
import { listWorkspaceMembers } from "../../lib/repositories/workspaceMembers";
import { listCalibrations, listAssets } from "../../lib/repositories/assets";
import { listQuotes } from "../../lib/repositories/quotes";
import { requestQuoteCreate } from "../../lib/navigationIntents";

interface BusinessDashboardPageProps {
  userName?: string;
  workspaceId: string;
  onNavigate?: (view: string) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function getFirstName(name?: string): string {
  if (!name) return "there";
  const firstName = name.trim().split(/\s+/)[0];
  return firstName || "there";
}

export default function BusinessDashboardPage({
  userName,
  workspaceId,
  onNavigate,
}: BusinessDashboardPageProps) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectWithOrg[]>([]);
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [jobEvents, setJobEvents] = useState<JobEventRow[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [assetsAvailableCount, setAssetsAvailableCount] = useState(0);
  const [assetsTotalCount, setAssetsTotalCount] = useState(0);
  const [quotesPendingCount, setQuotesPendingCount] = useState(0);
  const [calibrationsDueCount, setCalibrationsDueCount] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;

    Promise.all([
      listProjects(workspaceId).catch(() => []),
      listInvoices(workspaceId).catch(() => []),
      listJobEvents(workspaceId).catch(() => []),
      listWorkspaceMembers(workspaceId, { statuses: ["active"] }).catch(() => []),
      listAssets(workspaceId).catch(() => []),
      listQuotes(workspaceId).catch(() => []),
      listCalibrations(workspaceId).catch(() => []),
    ])
      .then(([p, i, events, members, assets, quotes, calibrations]) => {
        setProjects(p);
        setInvoices(i);
        setJobEvents(events);
        setMemberCount(members.length);
        setAssetsAvailableCount(
          assets.filter((asset) => asset.status === "available").length,
        );
        setAssetsTotalCount(assets.length);
        setQuotesPendingCount(
          quotes.filter((quote) => quote.status === "draft" || quote.status === "sent")
            .length,
        );
        const now = new Date();
        const dueWindow = new Date();
        dueWindow.setDate(now.getDate() + 7);
        setCalibrationsDueCount(
          calibrations.filter((item) => {
            if (!item.next_calibration_date) return false;
            const due = new Date(item.next_calibration_date);
            return due >= now && due <= dueWindow;
          }).length,
        );
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const activeProjectsCount = projects.filter((p) => p.status === "active").length;
  const pendingInvoices = invoices.filter(
    (i) => i.status === "draft" || i.status === "sent" || i.status === "overdue",
  );
  const pendingInvoicesTotal = pendingInvoices.reduce(
    (sum, inv) => sum + Number(inv.total || 0),
    0,
  );

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const overviewData = useMemo<OverviewDataPoint[] | undefined>(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentYear = new Date().getFullYear();
    const totalsByMonth = new Array(12).fill(0);
    let hasData = false;

    for (const inv of invoices) {
      if (!inv.created_at) continue;
      const date = new Date(inv.created_at);
      if (date.getFullYear() === currentYear) {
        totalsByMonth[date.getMonth()] += Number(inv.total || 0);
        hasData = true;
      }
    }

    if (!hasData) return undefined;

    return months.map((name, idx) => ({
      name,
      total: totalsByMonth[idx],
    }));
  }, [invoices]);

  const recentInvoices = useMemo<RecentSaleItem[] | undefined>(() => {
    if (invoices.length === 0) return undefined;
    return invoices.slice(0, 6).map((inv) => {
      const name = inv.organization_name || inv.project_name || "Unassigned";
      return {
        id: inv.id,
        name: String(name),
        meta: [
          inv.invoice_number ? `#${inv.invoice_number}` : null,
          inv.created_at ? format(parseISO(inv.created_at), "d MMM") : null,
        ]
          .filter(Boolean)
          .join(" · "),
        amount: `$${Number(inv.total || 0).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      };
    });
  }, [invoices]);

  return (
    <DashboardShell className="w-full max-w-full">
      <DashboardHeader
        title={`${getGreeting()}, ${getFirstName(userName)}`}
        description="Company operations, field dispatches & equipment."
        subtitle={currentDate}
        actions={
          <>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => onNavigate?.("dispatch")}
            >
              <CalendarDays className="h-4 w-4" />
              Open dispatch
            </Button>
            <Button
              className="gap-2"
              onClick={() => {
                requestQuoteCreate();
                onNavigate?.("quotes");
              }}
            >
              <Plus className="h-4 w-4" />
              New quote
            </Button>
          </>
        }
      />

      {loading ? (
        <DashboardSkeleton kpis={6} />
      ) : (
        <div className="flex flex-col gap-4 sm:gap-5">
            <KpiGrid>
              <KpiCard
                title="Active projects"
                value={activeProjectsCount}
                subtext={`${projects.length} total`}
                icon={<Briefcase />}
                tone="primary"
                onClick={() => onNavigate?.("projects")}
              />
              <KpiCard
                title="Outstanding billing"
                value={`$${pendingInvoicesTotal.toLocaleString()}`}
                subtext={`${pendingInvoices.length} open`}
                icon={<DollarSign />}
                tone="warning"
                onClick={() => onNavigate?.("invoices")}
              />
              <KpiCard
                title="Quotes pending"
                value={quotesPendingCount}
                subtext="awaiting client decision"
                icon={<FileCheck />}
                tone="info"
                onClick={() => onNavigate?.("quotes")}
              />
              <KpiCard
                title="Active staff"
                value={memberCount}
                icon={<Users />}
                onClick={() => onNavigate?.("team")}
              />
              <KpiCard
                title="Ready assets"
                value={assetsAvailableCount}
                subtext={`of ${assetsTotalCount} assets`}
                icon={<Gauge />}
                tone="success"
                onClick={() => onNavigate?.("assets")}
              />
              <KpiCard
                title="Calibrations due"
                value={calibrationsDueCount}
                subtext="next 7 days"
                icon={<AlertTriangle />}
                tone={calibrationsDueCount > 0 ? "warning" : "neutral"}
                onClick={() => onNavigate?.("assets")}
              />
            </KpiGrid>

            {/* Billing: the monthly trend and the invoices behind it */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <DashboardCard
                title="Monthly billings"
                titleAction={<PanelMeta>{new Date().getFullYear()}</PanelMeta>}
                className="col-span-1 lg:col-span-4"
              >
                <Overview data={overviewData} height={250} />
              </DashboardCard>

              <DashboardCard
                title="Recent invoices"
                titleAction={<PanelMeta>{invoices.length} issued</PanelMeta>}
                className="col-span-1 lg:col-span-3"
              >
                <RecentSales items={recentInvoices} />
              </DashboardCard>
            </div>

            {/* Pipeline */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <div className="col-span-1 lg:col-span-4">
                <ProjectTimelineChart projects={projects} />
              </div>
              <div className="col-span-1 lg:col-span-3">
                <ProjectStatusChart projects={projects} />
              </div>
            </div>

            {/* Day of operations */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <div className="col-span-1 lg:col-span-4">
                <TodaysSchedule
                  events={jobEvents}
                  maxItems={4}
                  footer={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => onNavigate?.("schedule")}
                    >
                      Open schedule
                    </Button>
                  }
                />
              </div>
              <div className="col-span-1 lg:col-span-3">
                <DatabaseStorageCard
                  workspaceId={workspaceId}
                  onNavigate={onNavigate}
                />
              </div>
            </div>

            <RecentProjectsTable projects={projects} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <div className="col-span-1 lg:col-span-4">
                <MarketGlobeCard onNavigate={onNavigate} />
              </div>
              <div className="col-span-1 lg:col-span-3">
                <ExtensionsCard workspaceId={workspaceId} onNavigate={onNavigate} />
              </div>
            </div>
        </div>
      )}
    </DashboardShell>
  );
}
