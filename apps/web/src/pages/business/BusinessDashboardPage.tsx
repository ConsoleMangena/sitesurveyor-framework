import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  DollarSign,
  FileCheck,
  FileText,
  FolderOpen,
  FolderPlus,
  Gauge,
  Plus,
  Receipt,
  Users,
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
            {currentDate} • Company operations, field dispatches & equipment
          </p>
        </div>
        <div className="flex items-center space-x-2">
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
        </div>
      </div>

      {loading ? (
        <DashboardSkeleton kpis={4} rail={4} />
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
            {/* Primary 4 Metric Cards */}
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
                  <CardTitle className="text-sm font-medium">Dispatches Today</CardTitle>
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{todaysEvents.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {todaysEvents.filter((item) => item.start_time).length} time-slotted
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Outstanding Billing
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${pendingInvoicesTotal.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pendingInvoices.length} invoices awaiting payment
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Quotes Pipeline</CardTitle>
                  <FileCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">+{quotesPendingCount}</div>
                  <p className="text-xs text-muted-foreground">awaiting approval</p>
                </CardContent>
              </Card>
            </div>

            {/* Supporting 4 Metric Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{memberCount}</div>
                  <p className="text-xs text-muted-foreground">active crew members</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Ready Assets</CardTitle>
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{assetsAvailableCount}</div>
                  <p className="text-xs text-muted-foreground">ready in inventory</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Calibrations Due</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{calibrationsDueCount}</div>
                  <p className="text-xs text-muted-foreground">due within 7 days</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{pendingInvoices.length}</div>
                  <p className="text-xs text-muted-foreground">draft or sent</p>
                </CardContent>
              </Card>
            </div>

            {/* 7-column Overview + Recent Sales */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <Card className="col-span-1 lg:col-span-4">
                <CardHeader>
                  <CardTitle>Overview</CardTitle>
                  <CardDescription>
                    Monthly revenue & business billing activity
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
                      ? `${pendingInvoices.length} invoices awaiting payment.`
                      : "Recent client billing & work orders."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RecentSales items={recentSalesItems} />
                </CardContent>
              </Card>
            </div>

            {/* Market Globe Card */}
            <MarketGlobeCard onNavigate={onNavigate} />

            {/* Pipeline Row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <div className="col-span-1 lg:col-span-4">
                <ProjectTimelineChart projects={projects} />
              </div>
              <div className="col-span-1 lg:col-span-3">
                <ProjectStatusChart projects={projects} />
              </div>
            </div>

            {/* Today's Dispatches & Recent Projects Row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <div className="col-span-1 lg:col-span-3">
                <TodaysSchedule events={jobEvents} maxItems={5} />
              </div>
              <div className="col-span-1 lg:col-span-4">
                <RecentProjectsTable projects={projects} />
              </div>
            </div>

            {/* Workspace & Shortcuts Row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
              <div className="col-span-1 lg:col-span-3">
                <DatabaseStorageCard
                  workspaceId={workspaceId}
                  onNavigate={onNavigate}
                />
              </div>
              <div className="col-span-1 lg:col-span-4">
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      Quick Shortcuts
                    </CardTitle>
                    <CardDescription>Frequent operational workflows</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        className="h-auto justify-start gap-2.5 py-3"
                        onClick={() => onNavigate?.("projects")}
                      >
                        <FolderPlus className="h-4 w-4 text-muted-foreground" />
                        <span>New project</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto justify-start gap-2.5 py-3"
                        onClick={() => onNavigate?.("dispatch")}
                      >
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <span>Dispatch a crew</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto justify-start gap-2.5 py-3"
                        onClick={() => onNavigate?.("invoices")}
                      >
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                        <span>Create an invoice</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto justify-start gap-2.5 py-3"
                        onClick={() => onNavigate?.("file-manager")}
                      >
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <span>Open file manager</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
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
