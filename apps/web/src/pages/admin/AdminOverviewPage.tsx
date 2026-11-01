import { useCallback, useState } from "react";

import ErrorNotice from "@/components/errors/ErrorNotice";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { AdminPlatformDashboard } from "@/features/admin/dashboard/admin-platform-dashboard";
import { DatabaseStorageCard } from "@/components/dashboard/DatabaseStorageCard";
import { ProfessionalPortfolioCard } from "@/features/personal/components/ProfessionalPortfolioCard";
import {
  countProfiles,
  listProfilesSummary,
  listWorkspaces,
  type WorkspaceRowAdmin,
} from "@/lib/repositories/adminPlatform";

interface AdminOverviewPageProps {
  isPlatformAdmin: boolean;
  workspaceId?: string;
  userName?: string;
}

export default function AdminOverviewPage({
  isPlatformAdmin,
  workspaceId,
  userName,
}: AdminOverviewPageProps) {
  const [rows, setRows] = useState<WorkspaceRowAdmin[]>([]);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [ownerLabels, setOwnerLabels] = useState<Map<string, string>>(new Map());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const [ws, profiles] = await Promise.all([
        listWorkspaces(),
        countProfiles(),
      ]);
      setRows(ws);
      setUserCount(profiles);
      setLastRefreshed(new Date());
      if (ws.length > 0) {
        const labels = await listProfilesSummary(ws.map((r) => r.owner_user_id));
        setOwnerLabels(labels);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load platform data.");
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin]);

  useAsyncAction(load, [load]);

  if (!isPlatformAdmin) {
    return null;
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorNotice tone="danger">{error}</ErrorNotice> : null}

      <AdminPlatformDashboard
        workspaces={rows}
        userCount={userCount}
        ownerLabels={ownerLabels}
        loading={loading}
        lastRefreshed={lastRefreshed}
        onRefresh={load}
      />

      {workspaceId ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your Operator Workspace
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <ProfessionalPortfolioCard workspaceId={workspaceId} userName={userName} />
            </div>
            <div className="lg:col-span-4">
              <DatabaseStorageCard workspaceId={workspaceId} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
