import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  FileCheck,
  FileText,
  Gauge,
  Plus,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ProjectStatusChart } from "@/components/dashboard/ProjectStatusChart";
import { ProjectTimelineChart } from "@/components/dashboard/ProjectTimelineChart";
import { RecentProjectsTable } from "@/components/dashboard/RecentProjectsTable";
import { DashboardHeader, DashboardShell } from "@/components/dashboard/DashboardShell.tsx";
import { TodaysSchedule } from "@/components/dashboard/TodaysSchedule.tsx";
import MarketGlobeCard from "../../components/market/MarketGlobeCard.tsx";
import { DatabaseStorageCard } from "@/components/dashboard/DatabaseStorageCard.tsx";

import { listProjects, type ProjectWithOrg } from "../../lib/repositories/projects.ts";
import { listInvoices, type InvoiceWithDetails } from "../../lib/repositories/invoices.ts";
import { listJobEvents, type JobEventRow } from "../../lib/repositories/jobEvents.ts";
import { listWorkspaceMembers } from "../../lib/repositories/workspaceMembers.ts";
import { listCalibrations, listAssets } from "../../lib/repositories/assets.ts";
import { listQuotes } from "../../lib/repositories/quotes.ts";

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
    ]).then(([p, i, events, members, assets, quotes, calibrations]) => {
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
    });
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
        description="Manage company operations from one place — dispatch crews, monitor active projects, track billing, and coordinate assets across your workspace."
        actions={
          <>
            <Button variant="outline" className="gap-2">
              <TrendingUp size={16} />
              Weekly Report
            </Button>
            <Button className="gap-2">
              <Plus size={16} />
              New Dispatch
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:col-span-12">
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
          <KpiCard
            title="Active Staff"
            value={memberCount.toString()}
            subtext="workspace members"
            icon={<Users className="size-4" />}
            tone="info"
          />
          <KpiCard
            title="Ready Assets"
            value={assetsAvailableCount.toString()}
            subtext="available for deployment"
            icon={<Gauge className="size-4" />}
            tone="success"
          />
          <KpiCard
            title="Calibrations Due"
            value={calibrationsDueCount.toString()}
            subtext="due this week"
            icon={<AlertTriangle className="size-4" />}
            tone="warning"
          />
          <KpiCard
            title="Pending Invoices"
            value={pendingInvoices.length.toString()}
            subtext="awaiting payment"
            icon={<FileText className="size-4" />}
          />
        </div>

        <div className="xl:col-span-12">
          <MarketGlobeCard onNavigate={onNavigate} />
        </div>

        <div className="xl:col-span-5">
          <ProjectTimelineChart projects={projects} />
        </div>
        <div className="xl:col-span-4">
          <ProjectStatusChart projects={projects} />
        </div>
        <div className="xl:col-span-3">
          <TodaysSchedule
            events={jobEvents}
            footer={
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => onNavigate?.("schedule")}
              >
                Open Full Schedule
              </Button>
            }
          />
        </div>

        <div className="xl:col-span-12">
          <RecentProjectsTable projects={projects} />
        </div>

        <div className="xl:col-span-4">
          <DatabaseStorageCard
            workspaceId={workspaceId}
            onNavigate={onNavigate}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
