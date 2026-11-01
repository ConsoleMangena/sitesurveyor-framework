import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  CalendarDays,
  Clock,
  DollarSign,
  FileCheck,
  Gauge,
  ListTodo,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { Overview, type OverviewDataPoint } from "@/components/dashboard/Overview";
import { RecentSales, type RecentSaleItem } from "@/components/dashboard/RecentSales";
import { Analytics } from "@/components/dashboard/Analytics";
import { ProjectStatusChart } from "@/components/dashboard/ProjectStatusChart";
import { ProjectTimelineChart } from "@/components/dashboard/ProjectTimelineChart";
import { RecentProjectsTable } from "@/components/dashboard/RecentProjectsTable";
import { ProfessionalPortfolioCard } from "../../features/personal/components/ProfessionalPortfolioCard";
import MarketGlobeCard from "../../components/market/MarketGlobeCard";
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
  const [taskItems, setTaskItems] = useState<string[]>([]);
  const [todayEvents, setTodayEvents] = useState<JobEventRow[]>([]);
  const [assetSnapshot, setAssetSnapshot] = useState<
    { name: string; status: string; color: string }[]
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
        } else {
          setNextCalibrationDays(null);
        }

        const today = new Date().toISOString().slice(0, 10);
        setTodayEvents(events.filter((event) => event.event_date === today).slice(0, 3));

        const pendingInvoiceCount = i.filter(
          (invoice) =>
            invoice.status === "draft" ||
            invoice.status === "sent" ||
            invoice.status === "overdue",
        ).length;
        const activeProjectCount = p.filter((project) => project.status === "active").length;
        const sentQuotes = q.filter(
          (quote) => quote.status === "draft" || quote.status === "sent",
        ).length;
        const dueSoonCalibrations = upcomingCalibrations.filter((item) => {
          if (!item.next_calibration_date) return false;
          const due = new Date(item.next_calibration_date);
          const windowEnd = new Date();
          windowEnd.setDate(windowEnd.getDate() + 14);
          return due <= windowEnd;
        }).length;
        setTaskItems([
          `${activeProjectCount} active project${activeProjectCount === 1 ? "" : "s"} need tracking`,
          `${pendingInvoiceCount} pending invoice${pendingInvoiceCount === 1 ? "" : "s"} need follow-up`,
          `${sentQuotes} quote${sentQuotes === 1 ? "" : "s"} waiting for client decision`,
          `${dueSoonCalibrations} calibration${dueSoonCalibrations === 1 ? "" : "s"} due within 14 days`,
        ]);

        setAssetSnapshot(
          assets.slice(0, 3).map((asset) => ({
            name: asset.name,
            status:
              asset.status === "available"
                ? "Ready"
                : asset.status === "maintenance"
                  ? "Service Soon"
                  : asset.status === "deployed"
                    ? "In Use"
                    : "Unavailable",
            color:
              asset.status === "available"
                ? "#16a34a"
                : asset.status === "maintenance"
                  ? "#d97706"
                  : "#64748b",
          })),
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

  const recentSalesItems = useMemo<RecentSaleItem[] | undefined>(() => {
    if (invoices.length === 0) return undefined;
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
    <div className="space-y-4">
      {/* Top Heading */}
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {getGreeting()}, {getFirstName(userName)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentDate} • Solo surveying operations & pipeline
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            className="gap-2"
            onClick={() => {
              requestQuoteCreate();
              onNavigate?.("quotes");
            }}
          >
            <Plus className="h-4 w-4" />
            Create Quote
          </Button>
        </div>
      </div>

      {loading ? (
        <DashboardSkeleton kpis={4} />
      ) : (
        <Tabs orientation="vertical" defaultValue="overview" className="space-y-4">
          <div className="w-full overflow-x-auto pb-2">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="reports" onClick={() => onNavigate?.("projects")}>
                Reports
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                onClick={() => onNavigate?.("notifications")}
              >
                Notifications
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4">
            {/* 4 Stat Cards Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{activeProjectsCount}</div>
                  <p className="text-xs text-muted-foreground">
                    {projects.length} total projects
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${pendingInvoicesTotal.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pendingInvoices.length} awaiting payment
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Quotes Pending</CardTitle>
                  <FileCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">+{pendingQuotesCount}</div>
                  <p className="text-xs text-muted-foreground">
                    awaiting client decision
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Next Calibration</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {nextCalibrationDays == null ? "—" : `${nextCalibrationDays}d`}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {nextCalibrationDays == null
                      ? "No schedule found"
                      : "until next calibration"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 7-column Overview + Recent Sales */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <Card className="col-span-1 lg:col-span-4">
                <CardHeader>
                  <CardTitle>Overview</CardTitle>
                  <CardDescription>
                    Monthly billings and completed project activity
                  </CardDescription>
                </CardHeader>
                <CardContent className="ps-2">
                  <Overview data={overviewData} />
                </CardContent>
              </Card>

              <Card className="col-span-1 lg:col-span-3">
                <CardHeader>
                  <CardTitle>Recent Sales</CardTitle>
                  <CardDescription>
                    {pendingInvoices.length > 0
                      ? `${pendingInvoices.length} pending client invoices.`
                      : "Recent client billing & work orders."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RecentSales items={recentSalesItems} />
                </CardContent>
              </Card>
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

            {/* Operations Row */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card className="flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    Today&apos;s Schedule
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => onNavigate?.("schedule")}
                  >
                    Open schedule
                  </Button>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  {todayEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-3">
                      <div className="w-14 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                        {event.start_time ? event.start_time.slice(0, 5) : "All day"}
                      </div>
                      <div className="min-w-0 flex-1 rounded-md bg-muted/50 p-2.5">
                        <p className="truncate text-sm font-medium text-foreground">
                          {event.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {event.notes || event.event_type || "Scheduled activity"}
                        </p>
                      </div>
                    </div>
                  ))}
                  {todayEvents.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-xs text-muted-foreground">
                      <CalendarDays className="h-5 w-5 text-muted-foreground/60" />
                      <span>No schedule events for today.</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ListTodo className="h-4 w-4 text-muted-foreground" />
                    Priority Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="flex flex-col gap-3">
                    {taskItems.map((task) => (
                      <li key={task} className="flex items-start gap-2.5">
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1.5 size-1.5 shrink-0 rounded-full",
                            /^0 /.test(task) ? "bg-muted-foreground/40" : "bg-primary",
                          )}
                        />
                        <span className="text-sm leading-snug text-foreground">
                          {task}
                        </span>
                      </li>
                    ))}
                    {taskItems.length === 0 && (
                      <li className="text-sm text-muted-foreground">
                        No priority tasks available.
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>

              <Card className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    Equipment Snapshot
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  {assetSnapshot.map((asset) => (
                    <div
                      key={asset.name}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Gauge className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium text-foreground">
                          {asset.name}
                        </span>
                      </div>
                      <span
                        className="shrink-0 text-xs font-semibold"
                        style={{ color: asset.color }}
                      >
                        {asset.status}
                      </span>
                    </div>
                  ))}
                  {assetSnapshot.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-xs text-muted-foreground">
                      <Gauge className="h-5 w-5 text-muted-foreground/60" />
                      <span>No assets tracked yet.</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Market Globe & Portfolio */}
            <MarketGlobeCard onNavigate={onNavigate} />
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
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Analytics />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
