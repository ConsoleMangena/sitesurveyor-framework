import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  FileCheck,
  FileText,
  FolderOpen,
  FolderPlus,
  Gauge,
  Plus,
  Receipt,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ProjectStatusChart } from "@/components/dashboard/ProjectStatusChart";
import { ProjectTimelineChart } from "@/components/dashboard/ProjectTimelineChart";
import { RecentProjectsTable } from "@/components/dashboard/RecentProjectsTable";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton.tsx";
import {
  DashboardGrid,
  DashboardHeader,
  DashboardSection,
  DashboardShell,
} from "@/components/dashboard/DashboardShell.tsx";
import { TodaysSchedule } from "@/components/dashboard/TodaysSchedule.tsx";
import MarketGlobeCard from "../../components/market/MarketGlobeCard.tsx";
import { DatabaseStorageCard } from "@/components/dashboard/DatabaseStorageCard.tsx";

import { listProjects, type ProjectWithOrg } from "../../lib/repositories/projects.ts";
import { listInvoices, type InvoiceWithDetails } from "../../lib/repositories/invoices.ts";
import { listJobEvents, type JobEventRow } from "../../lib/repositories/jobEvents.ts";
import { listWorkspaceMembers } from "../../lib/repositories/workspaceMembers.ts";
import { listCalibrations, listAssets } from "../../lib/repositories/assets.ts";
import { listQuotes } from "../../lib/repositories/quotes.ts";
import { requestQuoteCreate } from "../../lib/navigationIntents.ts";

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

  return (
    <DashboardShell className="hub-body">
      <DashboardHeader
        badge={<Badge variant="secondary">Business account</Badge>}
        title={`${getGreeting()}, ${getFirstName(userName)}`}
        subtitle={currentDate}
        description="Company operations at a glance — dispatch crews, watch billing, and keep assets and calibrations in service."
        actions={
          <>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => onNavigate?.("dispatch")}
            >
              <CalendarDays size={16} />
              Open dispatch
            </Button>
            <Button
              className="gap-2"
              onClick={() => {
                requestQuoteCreate();
                onNavigate?.("quotes");
              }}
            >
              <Plus size={16} />
              New quote
            </Button>
          </>
        }
      />

      {loading ? (
        <DashboardSkeleton kpis={4} rail={4} />
      ) : (
        <>
          <section aria-label="Primary metrics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <KpiCard
              title="Active Projects"
              value={activeProjectsCount.toString()}
              subtext={`${projects.length} total projects`}
              icon={<Briefcase className="size-4" />}
              tone="primary"
            />
            <KpiCard
              title="Dispatches Today"
              value={todaysEvents.length.toString()}
              subtext={`${todaysEvents.filter((item) => item.start_time).length} time-slotted events`}
              icon={<CalendarDays className="size-4" />}
              tone="info"
            />
            <KpiCard
              title="Outstanding Billing"
              value={`$${pendingInvoicesTotal.toLocaleString()}`}
              subtext={`${pendingInvoices.length} invoices awaiting payment`}
              icon={<FileText className="size-4" />}
              tone="warning"
            />
            <KpiCard
              title="Quotes Pipeline"
              value={quotesPendingCount.toString()}
              subtext="awaiting approval"
              icon={<FileCheck className="size-4" />}
              tone="purple"
            />
          </section>

          <section aria-label="Supporting metrics" className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
            <KpiCard
              size="compact"
              title="Active Staff"
              value={memberCount.toString()}
              icon={<Users className="size-3.5" />}
              tone="neutral"
            />
            <KpiCard
              size="compact"
              title="Ready Assets"
              value={assetsAvailableCount.toString()}
              icon={<Gauge className="size-3.5" />}
              tone="success"
            />
            <KpiCard
              size="compact"
              title="Calibrations Due"
              value={calibrationsDueCount.toString()}
              icon={<AlertTriangle className="size-3.5" />}
              tone="warning"
            />
            <KpiCard
              size="compact"
              title="Pending Invoices"
              value={pendingInvoices.length.toString()}
              icon={<FileText className="size-3.5" />}
              tone="info"
            />
          </section>

          <MarketGlobeCard onNavigate={onNavigate} />

          <DashboardSection title="Pipeline">
            <DashboardGrid>
              <div className="md:col-span-12 xl:col-span-7">
                <ProjectTimelineChart projects={projects} />
              </div>
              <div className="md:col-span-12 xl:col-span-5">
                <ProjectStatusChart projects={projects} />
              </div>
            </DashboardGrid>
          </DashboardSection>

          <DashboardSection
            title="Today"
            action={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => onNavigate?.("dispatch")}
              >
                <CalendarDays size={13} />
                Dispatch board
              </Button>
            }
          >
            <DashboardGrid>
              <div className="md:col-span-12 xl:col-span-4">
                <TodaysSchedule events={jobEvents} maxItems={5} />
              </div>
              <div className="md:col-span-12 xl:col-span-8">
                <RecentProjectsTable projects={projects} />
              </div>
            </DashboardGrid>
          </DashboardSection>

          <DashboardSection title="Workspace">
            <DashboardGrid>
              <div className="md:col-span-12 xl:col-span-4">
                <DatabaseStorageCard
                  workspaceId={workspaceId}
                  onNavigate={onNavigate}
                />
              </div>
              <div className="md:col-span-12 xl:col-span-8">
                <DashboardCard
                  title="Shortcuts"
                  icon={<Briefcase className="size-4" />}
                  className="h-full"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      variant="outline"
                      className="h-auto justify-start gap-2 py-3"
                      onClick={() => onNavigate?.("projects")}
                    >
                      <FolderPlus className="size-4" />
                      New project
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto justify-start gap-2 py-3"
                      onClick={() => onNavigate?.("dispatch")}
                    >
                      <CalendarDays className="size-4" />
                      Dispatch a crew
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto justify-start gap-2 py-3"
                      onClick={() => onNavigate?.("invoices")}
                    >
                      <Receipt className="size-4" />
                      Create an invoice
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto justify-start gap-2 py-3"
                      onClick={() => onNavigate?.("file-manager")}
                    >
                      <FolderOpen className="size-4" />
                      Open file manager
                    </Button>
                  </div>
                </DashboardCard>
              </div>
            </DashboardGrid>
          </DashboardSection>
        </>
      )}
    </DashboardShell>
  );
}
