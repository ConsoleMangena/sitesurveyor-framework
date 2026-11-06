import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Briefcase,
  Clock,
  DollarSign,
  FileCheck,
  Gauge,
  Plus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DashboardHeader,
  DashboardShell,
  PanelMeta,
} from "@/components/dashboard/DashboardShell";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { KpiCard, KpiGrid } from "@/components/dashboard/KpiCard";
import { TodaysSchedule } from "@/components/dashboard/TodaysSchedule";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { Overview, type OverviewDataPoint } from "@/components/dashboard/Overview";
import { RecentSales, type RecentSaleItem } from "@/components/dashboard/RecentSales";
import { ProjectStatusChart } from "@/components/dashboard/ProjectStatusChart";
import { ProjectTimelineChart } from "@/components/dashboard/ProjectTimelineChart";
import { RecentProjectsTable } from "@/components/dashboard/RecentProjectsTable";
import { ProfessionalPortfolioCard } from "../../features/personal/components/ProfessionalPortfolioCard";
import MarketGlobeCard from "../../components/market/MarketGlobeCard";
import ExtensionsCard from "../../components/dashboard/ExtensionsCard";
import { DatabaseStorageCard } from "@/components/dashboard/DatabaseStorageCard";
import { cn } from "@/lib/utils";

import { listProjects, type ProjectWithOrg } from "../../lib/repositories/projects";
import { listInvoices, type InvoiceWithDetails } from "../../lib/repositories/invoices";
import { listCalibrations, listAssets } from "../../lib/repositories/assets";
import { listJobEvents, type JobEventRow } from "../../lib/repositories/jobEvents";
import { listQuotes } from "../../lib/repositories/quotes";
import { requestQuoteCreate } from "../../lib/navigationIntents";

interface PersonalDashboardPageProps {
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

type AssetTone = "success" | "warning" | "info" | "muted";

const ASSET_TONE_BADGE: Record<AssetTone, string> = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  info: "border-info/40 bg-info/10 text-info",
  muted: "border-border bg-muted text-muted-foreground",
};

function assetStatus(status: string): { label: string; tone: AssetTone } {
  switch (status) {
    case "available":
      return { label: "Ready", tone: "success" };
    case "maintenance":
      return { label: "Service Soon", tone: "warning" };
    case "deployed":
      return { label: "In Use", tone: "info" };
    default:
      return { label: "Unavailable", tone: "muted" };
  }
}

export default function PersonalDashboardPage({
  userName,
  workspaceId,
  onNavigate,
}: PersonalDashboardPageProps) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectWithOrg[]>([]);
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [quotes, setQuotes] = useState<{ status: string }[]>([]);
  const [nextCalibrationDays, setNextCalibrationDays] = useState<number | null>(null);
  const [nextCalibrationDate, setNextCalibrationDate] = useState<string | null>(null);
  const [jobEvents, setJobEvents] = useState<JobEventRow[]>([]);
  const [assetSnapshot, setAssetSnapshot] = useState<
    { name: string; status: string; tone: AssetTone }[]
  >([]);

  useEffect(() => {
    if (!workspaceId) return;

    Promise.all([
      listProjects(workspaceId).catch(() => []),
      listInvoices(workspaceId).catch(() => []),
      listCalibrations(workspaceId).catch(() => []),
      listJobEvents(workspaceId).catch(() => []),
      listAssets(workspaceId).catch(() => []),
      listQuotes(workspaceId).catch(() => []),
    ])
      .then(([p, i, calibrations, events, assets, q]) => {
        setProjects(p);
        setInvoices(i);
        setQuotes(q);
        const upcomingCalibrations = calibrations
          .filter((item) => item.next_calibration_date)
          .sort((a, b) =>
            (a.next_calibration_date ?? "").localeCompare(b.next_calibration_date ?? ""),
          );
        if (upcomingCalibrations.length > 0) {
          const nextDate = new Date(upcomingCalibrations[0].next_calibration_date!);
          const dayDiff = Math.max(
            0,
            Math.ceil((nextDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          );
          setNextCalibrationDays(dayDiff);
          setNextCalibrationDate(
            nextDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          );
        } else {
          setNextCalibrationDays(null);
          setNextCalibrationDate(null);
        }

        setJobEvents(events);

        setAssetSnapshot(
          assets.slice(0, 5).map((asset) => {
            const { label, tone } = assetStatus(asset.status);
            return { name: asset.name, status: label, tone };
          }),
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
  const pendingQuotesCount = quotes.filter(
    (q) => q.status === "draft" || q.status === "sent",
  ).length;

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
        description="Solo surveying operations & pipeline."
        subtitle={currentDate}
        actions={
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
        }
      />

      {loading ? (
        <DashboardSkeleton kpis={4} />
      ) : (
        <div className="flex flex-col gap-4 sm:gap-5">
            <KpiGrid>
              <KpiCard
                title="Active projects"
                value={activeProjectsCount}
                subtext={`${projects.length} total`}
                tone="primary"
                icon={<Briefcase />}
                onClick={() => onNavigate?.("projects")}
              />
              <KpiCard
                title="Outstanding billing"
                value={`$${pendingInvoicesTotal.toLocaleString()}`}
                subtext={`${pendingInvoices.length} open`}
                tone="warning"
                icon={<DollarSign />}
                onClick={() => onNavigate?.("invoices")}
              />
              <KpiCard
                title="Quotes pending"
                value={pendingQuotesCount}
                subtext="awaiting client decision"
                tone="info"
                icon={<FileCheck />}
                onClick={() => onNavigate?.("quotes")}
              />
              <KpiCard
                title="Next calibration"
                value={nextCalibrationDays == null ? "—" : `${nextCalibrationDays}d`}
                subtext={nextCalibrationDate ?? "Nothing scheduled"}
                tone={
                  nextCalibrationDays != null && nextCalibrationDays <= 14
                    ? "danger"
                    : "neutral"
                }
                icon={<Clock />}
                onClick={() => onNavigate?.("assets")}
              />
            </KpiGrid>

            {/* 7-column billings + recent invoices */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <DashboardCard
                title="Monthly billings"
                titleAction={<PanelMeta>{new Date().getFullYear()}</PanelMeta>}
                className="col-span-1 lg:col-span-4"
              >
                <Overview data={overviewData} />
              </DashboardCard>

              <DashboardCard
                title="Recent invoices"
                titleAction={<PanelMeta>{invoices.length} issued</PanelMeta>}
                className="col-span-1 lg:col-span-3"
              >
                <RecentSales items={recentInvoices} />
              </DashboardCard>
            </div>

            {/* Pipeline Row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <div className="col-span-1 lg:col-span-4">
                <ProjectTimelineChart projects={projects} />
              </div>
              <div className="col-span-1 lg:col-span-3">
                <ProjectStatusChart projects={projects} />
              </div>
            </div>

            {/* Operations */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <div className="col-span-1 lg:col-span-3">
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

              <DashboardCard
                title="Equipment snapshot"
                icon={<Gauge />}
                className="col-span-1 lg:col-span-4"
              >
                {assetSnapshot.length > 0 ? (
                  <div className="flex flex-col divide-y divide-border">
                    {assetSnapshot.map((asset) => (
                      <div
                        key={asset.name}
                        className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0 truncate text-sm text-foreground">
                          {asset.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 text-[10px]",
                            ASSET_TONE_BADGE[asset.tone],
                          )}
                        >
                          {asset.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No assets tracked yet.
                  </p>
                )}
              </DashboardCard>
            </div>

            {/* Market Globe & Portfolio */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <div className="col-span-1 lg:col-span-4">
                <MarketGlobeCard onNavigate={onNavigate} />
              </div>
              <div className="col-span-1 lg:col-span-3">
                <ExtensionsCard workspaceId={workspaceId} onNavigate={onNavigate} />
              </div>
            </div>
            <ProfessionalPortfolioCard workspaceId={workspaceId} userName={userName} />

            {/* Records & Storage */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <div className="col-span-1 lg:col-span-4">
                <RecentProjectsTable projects={projects} />
              </div>
              <div className="col-span-1 lg:col-span-3">
                <DatabaseStorageCard
                  workspaceId={workspaceId}
                  onNavigate={onNavigate}
                />
              </div>
            </div>
        </div>
      )}
    </DashboardShell>
  );
}
