/* eslint-disable react-refresh/only-export-components */
// ^ view registries export render helper functions, not components. Lazy page
// components defined here are only consumed inside this file.
import { lazy, Suspense } from "react";
import type { UiUser, WorkspaceView } from "../workspace/types";
import PageLoader from "@/components/PageLoader.tsx";
import PersonalDashboardPage from "../../pages/personal/PersonalDashboardPage";
import SchedulePage from "../../pages/personal/SchedulePage";
import ContactsPage from "../../pages/shared/ContactsPage";
import InvoicesPage from "../../pages/shared/InvoicesPage";
import JobsPage from "../../pages/shared/JobsPage";
import NotificationsPage from "../../pages/shared/NotificationsPage";
import ProfileSettingsPage from "../../pages/shared/ProfileSettingsPage";
import QuotesPage from "../../pages/shared/QuotesPage";
import WorkspaceSettingsPage from "../../pages/shared/WorkspaceSettingsPage";
import ProfessionalsPage from "../../pages/business/ProfessionalsPage";
import TeamPage from "../../pages/business/TeamPage";

// Lazy-load heavy / infrequently-used pages so they do not bloat the shared
// workspace chunk loaded for every view.
const BillingPage = lazy(() => import("../../pages/shared/BillingPage"));
const FileManagerPage = lazy(() => import("../../pages/shared/FileManagerPage"));
const AdminActivityPage = lazy(() => import("../../pages/admin/AdminActivityPage"));
const AdminAuditPage = lazy(() => import("../../pages/admin/AdminAuditPage"));
const AdminOverviewPage = lazy(() => import("../../pages/admin/AdminOverviewPage"));
const AdminUsersPage = lazy(() => import("../../pages/admin/AdminUsersPage"));
const AdminWorkspacesPage = lazy(() => import("../../pages/admin/AdminWorkspacesPage"));

const ProjectHubPage = lazy(() => import("../../pages/shared/ProjectHubPage"));
const TimeTrackingPage = lazy(() => import("../../pages/shared/TimeTrackingPage"));
const AssetManagementPage = lazy(() => import("../../pages/shared/AssetManagementPage"));
const MarketplacePage = lazy(() => import("../../pages/shared/MarketplacePage"));
const AssistantPage = lazy(() => import("../../pages/shared/AssistantPage"));
const TeamChatPage = lazy(() => import("../../pages/shared/TeamChatPage"));

interface PersonalViewRendererOptions {
  user: UiUser;
  onEnterFullscreenProject: () => void;
  onExitFullscreenProject: () => void;
  onNavigate?: (view: string) => void;
}

export function renderPersonalView(
  activeView: WorkspaceView,
  options: PersonalViewRendererOptions,
) {
  const { user, onEnterFullscreenProject, onExitFullscreenProject, onNavigate } = options;

  switch (activeView) {
    case "dashboard":
      return <PersonalDashboardPage userName={user.name} workspaceId={user.workspaceId} onNavigate={onNavigate} />;

    case "assistant":
      return (
        <Suspense fallback={<PageLoader />}>
          <AssistantPage />
        </Suspense>
      );

    case "teamChat":
      return (
        <Suspense fallback={<PageLoader />}>
          <TeamChatPage
            workspaceId={user.workspaceId}
            workspaceName={user.company}
            canModerate={user.accountType === "business"}
          />
        </Suspense>
      );

    case "schedule":
      return <SchedulePage workspaceId={user.workspaceId} />;

    case "projects":
      return (
        <Suspense fallback={<PageLoader />}>
          <ProjectHubPage
            userName={user.name}
            workspaceId={user.workspaceId}
            onEnterFullscreenProject={onEnterFullscreenProject}
            onExitFullscreenProject={onExitFullscreenProject}
          />
        </Suspense>
      );

    case "timeTracking":
      return (
        <Suspense fallback={<PageLoader />}>
          <TimeTrackingPage workspaceId={user.workspaceId} />
        </Suspense>
      );

    case "team":
      return <TeamPage workspaceId={user.workspaceId} />;

    case "files":
      return (
        <Suspense fallback={<PageLoader />}>
          <FileManagerPage workspaceId={user.workspaceId} />
        </Suspense>
      );

    case "notifications":
      return <NotificationsPage workspaceId={user.workspaceId} onNavigate={onNavigate} />;

    case "quotes":
      return <QuotesPage workspaceId={user.workspaceId} />;

    case "invoices":
      return <InvoicesPage workspaceId={user.workspaceId} />;

    case "billing":
      return (
        <Suspense fallback={<PageLoader />}>
          <BillingPage
            workspaceId={user.workspaceId}
            isPlatformAdmin={user.isPlatformAdmin}
          />
        </Suspense>
      );

    case "contacts":
      return <ContactsPage workspaceId={user.workspaceId} />;

    case "settings":
      return <WorkspaceSettingsPage workspaceId={user.workspaceId} isPlatformAdmin={user.isPlatformAdmin} />;

    case "jobs":
      return (
        <JobsPage
          workspaceId={user.workspaceId}
          isPlatformAdmin={user.isPlatformAdmin}
        />
      );

    case "marketplace":
      return (
        <Suspense fallback={<PageLoader />}>
          <MarketplacePage
            workspaceId={user.workspaceId}
            isPlatformAdmin={user.isPlatformAdmin}
          />
        </Suspense>
      );

    case "assets":
      return (
        <Suspense fallback={<PageLoader />}>
          <AssetManagementPage workspaceId={user.workspaceId} />
        </Suspense>
      );

    case "professionals":
      return (
        <ProfessionalsPage
          workspaceId={user.workspaceId}
          isPlatformAdmin={user.isPlatformAdmin}
        />
      );

    case "admin_overview":
      return (
        <Suspense fallback={<PageLoader />}>
          <AdminOverviewPage
            isPlatformAdmin={user.isPlatformAdmin}
            workspaceId={user.workspaceId}
            userName={user.name}
          />
        </Suspense>
      );

    case "admin_activity":
      return (
        <Suspense fallback={<PageLoader />}>
          <AdminActivityPage isPlatformAdmin={user.isPlatformAdmin} />
        </Suspense>
      );

    case "admin_users":
      return (
        <Suspense fallback={<PageLoader />}>
          <AdminUsersPage isPlatformAdmin={user.isPlatformAdmin} />
        </Suspense>
      );

    case "admin_workspaces":
      return (
        <Suspense fallback={<PageLoader />}>
          <AdminWorkspacesPage isPlatformAdmin={user.isPlatformAdmin} />
        </Suspense>
      );

    case "admin_audit":
      return (
        <Suspense fallback={<PageLoader />}>
          <AdminAuditPage isPlatformAdmin={user.isPlatformAdmin} />
        </Suspense>
      );

    case "profile":
    default:
      return <ProfileSettingsPage />;
  }
}
