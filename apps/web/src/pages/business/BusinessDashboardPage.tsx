import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  DollarSign,
  FileCheck,
  FileText,
  Gauge,
  Plus,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import {
  DashboardGrid,
  DashboardHeader,
  DashboardSection,
} from "@/components/dashboard/DashboardShell";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import {
  Overview,
  type OverviewDataPoint,
} from "@/components/dashboard/Overview";
import { RecentSales, type RecentSaleItem } from "@/components/dashboard/RecentSales";
import { ProjectStatusChart } from "@/components/dashboard/ProjectStatusChart";
import { ProjectTimelineChart } from "@/components/dashboard/ProjectTimelineChart";
import { RecentProjectsTable } from "@/components/dashboard/RecentProjectsTable";
import { TodaysSchedule } from "@/components/dashboard/TodaysSchedule";
import MarketGlobeCard from "../../components/market/MarketGlobeCard";
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

const ICON_PROPS = { className: "h-4 w-4" } as const;

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
  const todaysEvents = jobEvents.filter(
    (event) => event.event_date === new Date().toISOString().slice(0, 10),
  );

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const overviewData = useMemo<OverviewDataPoint[] | null>(() => {
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

    if (!hasData) return null;

    return months.map((name, idx) => ({
      name,
      total: totalsByMonth[idx],
    }));
  }, [invoices]);

  const recentSalesItems = useMemo<RecentSaleItem[]>(() => {
    return invoices.slice(0, 5).map((inv) => {
      const name = inv.organization_name || inv.project_name || "Client";
      const email = inv.invoice_number
        ? `invoice-${inv.invoice_number}@sitesurveyor.local`
        : "billing@sitesurveyor.local";
      return {
        id: inv.id,
        name: String(name),
        email: String(email),
        amount: `+$${Number(inv.total || 0).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      };
    });
  }, [invoices]);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <DashboardHeader
        title={
          <>
            {getGreeting()}, {getFirstName(userName)}
          </>
        }
        description="Company operations, field dispatches & equipment"
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
        <DashboardSkeleton kpis={4} rail={4} />
      ) : (
        <>
          <DashboardSection title="Key metrics">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title="Active Projects"
                value={activeProjectsCount}
                subtext={`${projects.length} total projects`}
                icon={<Briefcase {...ICON_PROPS} />}
                tone="primary"
              />
              <KpiCard
                title="Dispatches Today"
                value={todaysEvents.length}
                subtext={`${todaysEvents.filter((item) => item.start_time).length} time-slotted`}
                icon={<CalendarDays {...ICON_PROPS} />}
                tone="info"
              />
              <KpiCard
                title="Outstanding Billing"
                value={`$${pendingInvoicesTotal.toLocaleString()}`}
                subtext={
                  pendingInvoices.length > 0
                    ? `${pendingInvoices.length} invoices awaiting payment`
                    : "All invoices settled"
                }
                icon={<DollarSign {...ICON_PROPS} />}
                tone={pendingInvoicesTotal > 0 ? "warning" : "success"}
              />
              <KpiCard
                title="Quotes Pipeline"
                value={quotesPendingCount}
                subtext="awaiting approval"
                icon={<FileCheck {...ICON_PROPS} />}
                tone={quotesPendingCount > 0 ? "success" : "neutral"}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                size="compact"
                title="Active Staff"
                value={memberCount}
                icon={<Users {...ICON_PROPS} />}
                tone="neutral"
              />
              <KpiCard
                size="compact"
                title="Ready Assets"
                value={assetsAvailableCount}
                icon={<Gauge {...ICON_PROPS} />}
                tone="neutral"
              />
              <KpiCard
                size="compact"
                title="Calibrations Due"
                value={calibrationsDueCount}
                icon={<AlertTriangle {...ICON_PROPS} />}
                tone={calibrationsDueCount > 0 ? "warning" : "neutral"}
              />
              <KpiCard
                size="compact"
                title="Pending Invoices"
                value={pendingInvoices.length}
                icon={<FileText {...ICON_PROPS} />}
                tone={pendingInvoices.length > 0 ? "info" : "neutral"}
              />
            </div>
          </DashboardSection>

          <DashboardSection title="Revenue">
            <DashboardGrid>
              <DashboardCard
                title="Monthly revenue"
                className="col-span-1 md:col-span-7"
                contentClassName="ps-2"
                titleAction={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onNavigate?.("invoices")}
                  >
                    Invoices
                  </Button>
                }
              >
                {overviewData ? (
                  <Overview data={overviewData} height={300} />
                ) : (
                  <div className="flex h-[300px] flex-col items-center justify-center gap-1 text-center">
                    <p className="text-sm font-medium text-muted-foreground">
                      No invoiced revenue yet this year
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Revenue appears here once your first invoice is raised.
                    </p>
                  </div>
                )}
              </DashboardCard>

              <DashboardCard
                title="Recent billing"
                className="col-span-1 md:col-span-5"
                titleAction={
                  pendingInvoices.length > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {pendingInvoices.length} awaiting payment
                    </span>
                  ) : null
                }
              >
                {recentSalesItems.length > 0 ? (
                  <RecentSales items={recentSalesItems} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Recent client billing & work orders will appear here.
                  </p>
                )}
              </DashboardCard>
            </DashboardGrid>
          </DashboardSection>

          <MarketGlobeCard onNavigate={onNavigate} />

          <DashboardSection title="Projects">
            <DashboardGrid>
              <div className="col-span-1 md:col-span-7">
                <ProjectTimelineChart projects={projects} />
              </div>
              <div className="col-span-1 md:col-span-5">
                <ProjectStatusChart projects={projects} />
              </div>
            </DashboardGrid>
          </DashboardSection>

          <DashboardSection
            title="Today"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate?.("projects")}
              >
                All projects
              </Button>
            }
          >
            <DashboardGrid>
              <div className="col-span-1 md:col-span-5">
                <TodaysSchedule
                  events={jobEvents}
                  maxItems={5}
                  onNewDispatch={() => onNavigate?.("dispatch")}
                />
              </div>
              <div className="col-span-1 md:col-span-7">
                <RecentProjectsTable projects={projects} />
              </div>
            </DashboardGrid>
          </DashboardSection>

          <DashboardSection title="Workspace">
            <DashboardGrid>
              <div className="col-span-1 md:col-span-6">
                <DatabaseStorageCard
                  workspaceId={workspaceId}
                  onNavigate={onNavigate}
                />
              </div>
            </DashboardGrid>
          </DashboardSection>
        </>
      )}
    </div>
  );
}
